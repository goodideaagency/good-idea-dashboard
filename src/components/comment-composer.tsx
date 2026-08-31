'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileTileVisual } from './file-tile'

// Replaces a plain textarea+submit with local staging for an attached file:
// selecting a file only shows a preview here (image thumbnail or a
// extension badge, same as everywhere else attachments render) -- nothing
// reaches ClickUp until Post is actually clicked, at which point the file
// (if any) and the comment text (which may be empty) go up together as one
// ClickUp comment. Previously a file input uploaded immediately on select,
// with no way to back out or attach a caption.
export function CommentComposer({
  accountId,
  taskId,
  commentAction,
}: {
  accountId: string
  taskId: string
  commentAction: (formData: FormData) => void | Promise<void>
}) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const previewUrl = useMemo(
    () => (stagedFile && stagedFile.type.startsWith('image/') ? URL.createObjectURL(stagedFile) : null),
    [stagedFile]
  )
  // Object URLs are only good until revoked -- this only runs the cleanup,
  // not the creation (see previewUrl above), so swapping files doesn't leak
  // the previous one.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function clearStagedFile() {
    setStagedFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // Wraps the current selection in **/*` markers (or inserts an empty pair
  // with the cursor in the middle if nothing's selected) -- the composer's
  // whole "rich text" input is just this markdown-lite syntax, parsed into
  // ClickUp's real rich-text segments server-side (see comment-markdown.ts)
  // so it renders as actual bold/italic there too, not literal asterisks.
  function wrapSelection(marker: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = text.slice(start, end)
    const next = text.slice(0, start) + marker + selected + marker + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      el.focus()
      const from = start + marker.length
      el.setSelectionRange(from, from + selected.length)
    })
  }

  // Prefixes every line touched by the current selection (or just the
  // current line, if nothing's selected) with a list marker -- "- " for a
  // bullet, "1. "/"2. "/... for a numbered list. The literal numbers are
  // only for what the user sees while typing; ClickUp renumbers its own
  // rendered list automatically, so only the list TYPE actually needs to
  // survive into the posted comment.
  function prefixLines(prefix: (i: number) => string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const lineStart = text.lastIndexOf('\n', start - 1) + 1
    const lineEndIdx = text.indexOf('\n', end)
    const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx
    const block = text.slice(lineStart, lineEnd)
    const withPrefixes = block
      .split('\n')
      .map((line, i) => `${prefix(i)}${line}`)
      .join('\n')
    setText(text.slice(0, lineStart) + withPrefixes + text.slice(lineEnd))
    requestAnimationFrame(() => el.focus())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed && !stagedFile) return
    setError(null)
    setPosting(true)
    try {
      if (stagedFile) {
        const form = new FormData()
        form.append('account_id', accountId)
        form.append('task_id', taskId)
        form.append('text', trimmed)
        form.append('file', stagedFile)
        const res = await fetch('/api/uploads/task-file', { method: 'POST', body: form })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error ?? 'Could not send that file.')
        }
      } else {
        const form = new FormData()
        form.append('account_id', accountId)
        form.append('task_id', taskId)
        form.append('text', trimmed)
        await commentAction(form)
      }
      setText('')
      clearStagedFile()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post your comment.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t border-[#f0ecdf] pt-3">
      <label
        className="block text-xs font-mono uppercase tracking-wide text-gray-400"
        htmlFor={`comment-${taskId}`}
      >
        Add a comment
      </label>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => wrapSelection('**')}
          title="Bold"
          className="w-7 h-7 text-sm font-bold text-gray-600 hover:bg-[#f6f1e4]"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => wrapSelection('*')}
          title="Italic"
          className="w-7 h-7 text-sm italic text-gray-600 hover:bg-[#f6f1e4]"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => prefixLines(() => '- ')}
          title="Bullet list"
          className="w-7 h-7 text-sm text-gray-600 hover:bg-[#f6f1e4]"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => prefixLines((i) => `${i + 1}. `)}
          title="Numbered list"
          className="w-7 h-7 text-xs text-gray-600 hover:bg-[#f6f1e4]"
        >
          1.
        </button>
      </div>
      <textarea
        ref={textareaRef}
        id={`comment-${taskId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Write a comment..."
        className="mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
      />

      {stagedFile && (
        <div className="mt-2 flex items-start gap-2">
          <div className="relative">
            <FileTileVisual title={stagedFile.name} extension={stagedFile.name.split('.').pop()} thumbnail={previewUrl} />
            <button
              type="button"
              onClick={clearStagedFile}
              aria-label="Remove file"
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-xs text-white hover:bg-gray-700"
            >
              ×
            </button>
          </div>
          <span className="mt-1 max-w-[10rem] truncate text-xs text-gray-500">{stagedFile.name}</span>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={posting || (!text.trim() && !stagedFile)}
          className="bg-[#f7cf4a] px-4 py-1.5 text-sm font-semibold text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {posting ? 'Posting…' : 'Post'}
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={posting}
          className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-800 disabled:opacity-50"
        >
          + Attach a file
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) setStagedFile(file)
          }}
        />
      </div>
    </form>
  )
}
