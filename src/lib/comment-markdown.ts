// Converts the comment composer's simple markdown-lite syntax (**bold**,
// *italic*, "- " bullet lines, "1. " numbered lines) into ClickUp's own
// comment rich-text segment format. Verified live against the real API:
// POSTed a comment with exactly this {text, attributes:{bold,italic,list}}
// shape, then GET it back -- ClickUp echoes it completely unchanged, which
// is the same shape its own comment editor produces, so this renders
// natively in ClickUp's UI, not as literal asterisks/dashes.
//
// Deliberately not a general markdown parser -- just these four, since
// that's the whole feature.
export type ComposedSegment = {
  text: string
  bold?: boolean
  italic?: boolean
  list?: 'bullet' | 'ordered'
}

function parseInline(line: string): { text: string; bold?: boolean; italic?: boolean }[] {
  const segments: { text: string; bold?: boolean; italic?: boolean }[] = []
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(line))) {
    if (match.index > lastIndex) segments.push({ text: line.slice(lastIndex, match.index) })
    if (match[1] !== undefined) segments.push({ text: match[1], bold: true })
    else if (match[2] !== undefined) segments.push({ text: match[2], italic: true })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < line.length || segments.length === 0) segments.push({ text: line.slice(lastIndex) })
  return segments
}

export function commentMarkdownToSegments(markdown: string): ComposedSegment[] {
  const lines = markdown.split('\n')
  const out: ComposedSegment[] = []
  lines.forEach((line, i) => {
    let list: 'bullet' | 'ordered' | undefined
    let content = line
    if (/^-\s+/.test(line)) {
      list = 'bullet'
      content = line.replace(/^-\s+/, '')
    } else if (/^\d+\.\s+/.test(line)) {
      list = 'ordered'
      content = line.replace(/^\d+\.\s+/, '')
    }
    for (const run of parseInline(content)) {
      out.push({ ...run, ...(list ? { list } : {}) })
    }
    if (i < lines.length - 1) out.push({ text: '\n' })
  })
  return out
}

// Reshapes into ClickUp's exact wire format for POST /task/{id}/comment.
export function segmentsToClickUpComment(segments: ComposedSegment[]): unknown[] {
  return segments.map(({ text, ...attrs }) => {
    const attributes: Record<string, unknown> = {}
    if (attrs.bold) attributes.bold = true
    if (attrs.italic) attributes.italic = true
    if (attrs.list) attributes.list = attrs.list
    return Object.keys(attributes).length > 0 ? { text, attributes } : { text }
  })
}
