'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { FileTileVisual } from './file-tile'
import { tiptapDocToClickUpSegments, isEmptyTiptapDoc } from '@/lib/tiptap-clickup'

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the editor's own selection from collapsing on click
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center text-sm text-gray-600 hover:bg-[#f6f1e4] ${active ? 'bg-[#f0ecdf] text-gray-900' : ''}`}
    >
      {children}
    </button>
  )
}

const OrderedListIcon = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
    <path d="M8 4h9M8 10h9M8 16h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <text x="1" y="6" fontSize="6" fill="currentColor">1</text>
    <text x="1" y="12" fontSize="6" fill="currentColor">2</text>
    <text x="1" y="18" fontSize="6" fill="currentColor">3</text>
  </svg>
)
const BulletListIcon = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
    <path d="M8 4h9M8 10h9M8 16h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="3" cy="4" r="1.5" fill="currentColor" />
    <circle cx="3" cy="10" r="1.5" fill="currentColor" />
    <circle cx="3" cy="16" r="1.5" fill="currentColor" />
  </svg>
)
const OutdentIcon = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
    <path d="M8 4h9M8 10h9M8 16h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M6 6.5 2.5 10 6 13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
)
const IndentIcon = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
    <path d="M8 4h9M8 10h9M8 16h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M2.5 6.5 6 10l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
)
const LinkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
    <path
      d="M8.5 11.5a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-1 1M11.5 8.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l1-1"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
)
const PaperclipIcon = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
    <path
      d="M14 6.5 8 12.5a2.5 2.5 0 0 1-3.5-3.5L11 2.5a4 4 0 0 1 5.5 5.5l-6.5 6.5a1.5 1.5 0 0 1-2-2L14 6.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
)

// Toolbar controls -- bold/italic/underline, numbered/bullet lists (with
// indent levels, via Tab/Shift+Tab or the outdent/indent buttons -- Tiptap's
// list extensions support real nesting out of the box), and a link.
// Matches ClickUp's own comment editor's basic formatting set; anything
// beyond that (headings, code blocks, etc.) is deliberately left out.
function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null

  function setLink() {
    if (!editor) return
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', previous ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex items-center gap-0.5">
      <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span className="underline">U</span>
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-[#e7e2d3]" />
      <ToolbarButton
        title="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <OrderedListIcon />
      </ToolbarButton>
      <ToolbarButton
        title="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <BulletListIcon />
      </ToolbarButton>
      <ToolbarButton title="Decrease indent" onClick={() => editor.chain().focus().liftListItem('listItem').run()}>
        <OutdentIcon />
      </ToolbarButton>
      <ToolbarButton title="Increase indent" onClick={() => editor.chain().focus().sinkListItem('listItem').run()}>
        <IndentIcon />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-[#e7e2d3]" />
      <ToolbarButton title="Link" active={editor.isActive('link')} onClick={setLink}>
        <LinkIcon />
      </ToolbarButton>
    </div>
  )
}

// Replaces a plain textarea+submit with local staging for an attached file:
// selecting a file only shows a preview here (image thumbnail or a
// extension badge, same as everywhere else attachments render) -- nothing
// reaches ClickUp until Post is actually clicked, at which point the file
// (if any) and the comment (which may be empty) go up together as one
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
  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [, setSelectionTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        strike: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder: 'Write a comment...' }),
    ],
    editorProps: {
      attributes: {
        class:
          'min-h-[4.5rem] px-3 py-2 text-sm text-gray-900 outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_a]:text-blue-600 [&_a]:underline',
      },
    },
    // Tiptap doesn't re-render this component on every keystroke on its
    // own -- toolbar active-states (isActive('bold') etc.) and the Send
    // button's disabled state both need to react to the editor's content,
    // so this mirrors "is there anything to send" into real React state on
    // every transaction. Confirmed live: without this, Send stayed
    // permanently disabled/enabled based only on the doc's state at mount.
    onUpdate: ({ editor }) => setIsEmpty(isEmptyTiptapDoc(editor.getJSON())),
    onSelectionUpdate: () => setSelectionTick((t) => t + 1),
  })

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editor) return
    const doc = editor.getJSON()
    const docEmpty = isEmptyTiptapDoc(doc)
    if (docEmpty && !stagedFile) return
    const segmentsJson = JSON.stringify(docEmpty ? [] : tiptapDocToClickUpSegments(doc))

    setError(null)
    setPosting(true)
    try {
      if (stagedFile) {
        const form = new FormData()
        form.append('account_id', accountId)
        form.append('task_id', taskId)
        form.append('segments_json', segmentsJson)
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
        form.append('segments_json', segmentsJson)
        await commentAction(form)
      }
      editor.commands.clearContent()
      clearStagedFile()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post your comment.')
    } finally {
      setPosting(false)
    }
  }

  const canSubmit = Boolean(editor) && (!isEmpty || !!stagedFile)

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t border-[#f0ecdf] pt-3">
      <label className="block text-xs font-mono uppercase tracking-wide text-gray-400">Add a comment</label>

      <div className="mt-1 border border-[#e7e2d3] focus-within:border-gray-900">
        <EditorContent editor={editor} />

        {stagedFile && (
          <div className="flex items-start gap-2 border-t border-[#f0ecdf] px-3 py-2">
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

        <div className="flex items-center justify-between border-t border-[#e7e2d3] bg-[#faf7f0] px-2 py-1">
          <div className="flex items-center gap-0.5">
            <EditorToolbar editor={editor} />
            <span className="mx-1 h-4 w-px bg-[#e7e2d3]" />
            <ToolbarButton title="Attach a file" onClick={() => inputRef.current?.click()}>
              <PaperclipIcon />
            </ToolbarButton>
          </div>
          <button
            type="submit"
            disabled={posting || !canSubmit}
            className="bg-[#f7cf4a] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {posting ? 'Posting…' : 'Send'}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) setStagedFile(file)
        }}
      />

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  )
}
