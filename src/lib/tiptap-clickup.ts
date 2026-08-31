// Converts a Tiptap editor document into ClickUp's own comment rich-text
// segment format. Verified live against the real API for every attribute
// used here (bold, italic, underline, link, list, indent): POSTed a comment
// with exactly this {text, attributes:{...}} shape, then GET it back --
// ClickUp echoes it completely unchanged, which is the same shape its own
// comment editor produces, so this renders natively in ClickUp's UI.
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

type ListContext = { list: 'bullet' | 'ordered'; indent: number } | null

export function tiptapDocToClickUpSegments(doc: TiptapNode): ComposedSegment[] {
  const out: ComposedSegment[] = []
  let wroteAnyBlock = false

  function pushLineBreak() {
    if (wroteAnyBlock) out.push({ text: '\n' })
    wroteAnyBlock = true
  }

  function walkInline(nodes: TiptapNode[] | undefined, ctx: ListContext) {
    for (const node of nodes ?? []) {
      if (node.type === 'text' && node.text) {
        const marks = node.marks ?? []
        const linkMark = marks.find((m) => m.type === 'link')
        out.push({
          text: node.text,
          ...(marks.some((m) => m.type === 'bold') ? { bold: true } : {}),
          ...(marks.some((m) => m.type === 'italic') ? { italic: true } : {}),
          ...(marks.some((m) => m.type === 'underline') ? { underline: true } : {}),
          ...(linkMark?.attrs?.href ? { link: String(linkMark.attrs.href) } : {}),
          ...(ctx ? { list: ctx.list, ...(ctx.indent > 0 ? { indent: ctx.indent } : {}) } : {}),
        })
      } else if (node.type === 'hardBreak') {
        out.push({ text: '\n' })
      }
    }
  }

  function walkList(node: TiptapNode, ctx: ListContext) {
    const list: 'bullet' | 'ordered' = node.type === 'bulletList' ? 'bullet' : 'ordered'
    const indent = ctx ? ctx.indent + 1 : 0
    for (const item of node.content ?? []) {
      for (const child of item.content ?? []) {
        if (child.type === 'paragraph') {
          pushLineBreak()
          walkInline(child.content, { list, indent })
        } else if (child.type === 'bulletList' || child.type === 'orderedList') {
          walkList(child, { list, indent })
        }
      }
    }
  }

  for (const block of doc.content ?? []) {
    if (block.type === 'paragraph') {
      pushLineBreak()
      walkInline(block.content, null)
    } else if (block.type === 'bulletList' || block.type === 'orderedList') {
      walkList(block, null)
    }
  }

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
    // Space/tab only -- never \n. A bare {text:'\n'} line-separator segment
    // is structural, not decorative trailing whitespace: matching it here
    // (an earlier version used a plain \s, which DOES match a bare newline)
    // merged the separator into the next line's own segment instead of
    // shifting it, which broke every reader that finds line breaks by
    // looking for a segment whose whole text is exactly '\n' (confirmed
    // live: a pasted bullet list's line breaks vanished this way).
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
