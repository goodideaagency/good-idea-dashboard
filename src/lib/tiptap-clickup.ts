// Converts a Tiptap editor document into ClickUp's own comment rich-text
// segment format (the same Quill-Delta-flavored shape ClickUp's own comment
// editor produces). Two things confirmed live against the real API that
// aren't obvious from the docs:
//
// 1. Inline marks (bold/italic/underline/link) belong on the content run
//    they apply to -- straightforward, and it's what makes a bold name line
//    like "Demo Agency" render bold in ClickUp's own UI.
// 2. Block-level attributes (list, indent) do NOT belong on the content run
//    -- they belong on the '\n' that CLOSES that line, matching real Quill
//    Delta convention. Putting them on the content run instead is silently
//    accepted by the API and echoed back completely unchanged on a GET --
//    which looks like proof it works -- but ClickUp's actual comment
//    renderer doesn't look for it there, so the whole list renders as flat,
//    unformatted text. Confirmed by a real side-by-side: a comment posted
//    with list/indent on the content ran flat in ClickUp's own UI while
//    this platform's own reader (built against the same wrong assumption)
//    showed it as a properly formatted list -- i.e. the bug was invisible
//    from this app's own side and only showed up by actually looking at
//    ClickUp.
export type ComposedSegment = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  link?: string
  list?: 'bullet' | 'ordered'
  indent?: number
}

// Minimal shape of the bits of Tiptap's ProseMirror JSON this cares about --
// avoids taking a dependency on Tiptap's own types here, since this needs to
// stay callable from a plain converter with no editor instance attached.
type TiptapNode = {
  type: string
  content?: TiptapNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

type BlockAttrs = { list?: 'bullet' | 'ordered'; indent?: number }
type ListContext = { list: 'bullet' | 'ordered'; indent: number } | null

function walkInline(nodes: TiptapNode[] | undefined): ComposedSegment[] {
  const runs: ComposedSegment[] = []
  for (const node of nodes ?? []) {
    if (node.type === 'text' && node.text) {
      const marks = node.marks ?? []
      const linkMark = marks.find((m) => m.type === 'link')
      // A link with no real host (e.g. the prompt's own "https://" default,
      // accepted as-is without editing) previously got sent through anyway
      // -- ClickUp silently stored it as a null link, showing as plain
      // unlinked text. Only a link that actually parses gets kept.
      let href = ''
      if (typeof linkMark?.attrs?.href === 'string') {
        try {
          href = new URL(linkMark.attrs.href).href
        } catch {
          href = ''
        }
      }
      runs.push({
        text: node.text,
        ...(marks.some((m) => m.type === 'bold') ? { bold: true } : {}),
        ...(marks.some((m) => m.type === 'italic') ? { italic: true } : {}),
        ...(marks.some((m) => m.type === 'underline') ? { underline: true } : {}),
        ...(href ? { link: href } : {}),
      })
    } else if (node.type === 'hardBreak') {
      // A soft break WITHIN a line, not a line boundary -- no block
      // attributes belong here even inside a list item.
      runs.push({ text: '\n' })
    }
  }
  return runs
}

export function tiptapDocToClickUpSegments(doc: TiptapNode): ComposedSegment[] {
  const out: ComposedSegment[] = []

  // Emits one line: its content runs, then the '\n' that closes it --
  // carrying this line's own block attributes (list/indent), never the
  // content runs. Every line gets a closing newline, including the very
  // last one in the document, matching real Quill Delta (a document is
  // always "some lines, each ending in \n").
  function emitLine(runs: ComposedSegment[], blockAttrs: BlockAttrs) {
    out.push(...runs, { text: '\n', ...blockAttrs })
  }

  function walkList(node: TiptapNode, ctx: ListContext) {
    const list: 'bullet' | 'ordered' = node.type === 'bulletList' ? 'bullet' : 'ordered'
    const indent = ctx ? ctx.indent + 1 : 0
    for (const item of node.content ?? []) {
      for (const child of item.content ?? []) {
        if (child.type === 'paragraph') {
          emitLine(walkInline(child.content), { list, ...(indent > 0 ? { indent } : {}) })
        } else if (child.type === 'bulletList' || child.type === 'orderedList') {
          walkList(child, { list, indent })
        }
      }
    }
  }

  for (const block of doc.content ?? []) {
    if (block.type === 'paragraph') {
      emitLine(walkInline(block.content), {})
    } else if (block.type === 'bulletList' || block.type === 'orderedList') {
      walkList(block, null)
    }
  }

  // The doc's very last line doesn't need a trailing separator -- nothing
  // follows it -- UNLESS it's a list line, in which case its block
  // attributes live ONLY on that final '\n' and dropping it would silently
  // un-list the last item.
  const last = out[out.length - 1]
  if (last && last.text === '\n' && !last.list) out.pop()

  return out
}

// ClickUp's API silently drops trailing whitespace from a text segment when
// a different segment immediately follows it -- confirmed live: posting
// {text:"Please "} then {text:"review",attributes:{bold:true}} came back as
// "Please"+"review" with the space gone, running the words together (e.g.
// bolding a single word runs it into the one before it). Shifting that
// trailing whitespace onto the FRONT of the next segment instead survives
// intact and renders identically -- a leading space picking up the next
// run's bold/italic/etc doesn't look any different, since whitespace has no
// glyph to notice the styling on.
function shiftTrailingWhitespaceAcrossSegments(segments: ComposedSegment[]): ComposedSegment[] {
  const out = segments.map((s) => ({ ...s }))
  for (let i = 0; i < out.length - 1; i++) {
    const next = out[i + 1]
    if (next.text === '\n') continue // a real line break -- nothing to shift onto
    // Space/tab only -- never \n. A bare '\n' line-separator segment is
    // structural, not decorative trailing whitespace (a plain \s pattern
    // matches a bare newline too, which merges the separator into the next
    // line instead of shifting onto it -- confirmed live, that broke every
    // reader that finds line breaks by looking for a segment whose whole
    // text is exactly '\n').
    const match = out[i].text.match(/[ \t]+$/)
    if (!match) continue
    out[i].text = out[i].text.slice(0, -match[0].length)
    next.text = match[0] + next.text
  }
  return out.filter((s) => s.text !== '')
}

// Reshapes into ClickUp's exact wire format for POST /task/{id}/comment.
export function segmentsToClickUpComment(rawSegments: ComposedSegment[]): unknown[] {
  const segments = shiftTrailingWhitespaceAcrossSegments(rawSegments)
  return segments.map(({ text, ...attrs }) => {
    const attributes: Record<string, unknown> = {}
    if (attrs.bold) attributes.bold = true
    if (attrs.italic) attributes.italic = true
    if (attrs.underline) attributes.underline = true
    if (attrs.link) attributes.link = attrs.link
    if (attrs.list) attributes.list = attrs.list
    if (attrs.indent) attributes.indent = attrs.indent
    return Object.keys(attributes).length > 0 ? { text, attributes } : { text }
  })
}

// True when the doc has no actual text anywhere -- Tiptap's "empty" doc is
// still a paragraph node, not literally nothing, so checking content.length
// alone isn't enough.
export function isEmptyTiptapDoc(doc: TiptapNode): boolean {
  return tiptapDocToClickUpSegments(doc).every((s) => s.text.trim() === '')
}
