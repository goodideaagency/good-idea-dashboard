import type { ClickUpComment, ClickUpTask, CommentSegment } from '@/lib/clickup'
import { ClickUpStatusPill } from './clickup-status-pill'
import { TaskFileUpload } from './task-file-upload'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// postTaskComment posts every platform comment through the single shared
// "bot" ClickUp account, prefixing a bold name line so your ClickUp team can
// tell who really wrote it (see clickup.ts). On the platform's own UI that
// workaround needs to be invisible -- this detects that exact shape (bold
// text segment immediately followed by a bare newline) and unwraps it back
// into a normal "posted by that person" comment.
function resolveDisplayComment(c: ClickUpComment): { author: string; segments: CommentSegment[] } {
  const [first, second, ...rest] = c.segments
  if (
    first?.type === 'text' &&
    first.bold &&
    second?.type === 'text' &&
    second.text === '\n'
  ) {
    return { author: first.text, segments: rest }
  }
  return { author: c.author, segments: c.segments }
}

// Renders a comment's segments in order: plain text (newlines preserved),
// inline images, and file attachments as a small link.
function CommentBody({ segments }: { segments: CommentSegment[] }) {
  return (
    <div className="mt-0.5 space-y-2 text-gray-600">
      {segments.map((seg, i) => {
        if (seg.type === 'image') {
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={i} src={seg.url} alt={seg.alt} className="max-h-64 max-w-full" />
        }
        if (seg.type === 'file') {
          return (
            <a
              key={i}
              href={seg.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gray-900 underline underline-offset-2 hover:text-gray-600"
            >
              {seg.name}
            </a>
          )
        }
        return (
          <span key={i} className="whitespace-pre-wrap">
            {seg.text}
          </span>
        )
      })}
    </div>
  )
}

// Renders every ClickUp task for an account's connected List: title, status
// (using ClickUp's own status color), due date, comments, and attachments.
// Shared by the agency and admin account-detail pages. Pass accountId +
// commentAction to let the viewer reply (agency side only — admins already
// have direct ClickUp access).
export function ProjectTasks({
  tasks,
  accountId,
  commentAction,
}: {
  tasks: ClickUpTask[]
  accountId?: string
  commentAction?: (formData: FormData) => void | Promise<void>
}) {
  if (tasks.length === 0) {
    return (
      <div className="bg-white p-5 ring-1 ring-[#ece7d8]">
        <p className="text-sm text-gray-400">No project tasks yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {tasks.map((task) => (
        <div key={task.id} className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
          {/* Details -- grows as tall as it needs to. */}
          <div className="bg-white p-5 ring-1 ring-[#ece7d8] lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-gray-900">{task.name}</p>
              <ClickUpStatusPill status={task.status} color={task.statusColor} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              {task.dueDate && <span>Due {fmtDate(task.dueDate)}</span>}
              <a
                href={task.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-gray-800"
              >
                View in ClickUp
              </a>
            </div>

            {task.attachments.length > 0 && (
              <div className="mt-4 border-t border-[#f0ecdf] pt-3">
                <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Files</p>
                <ul className="mt-2 space-y-1">
                  {task.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-900 underline underline-offset-2 hover:text-gray-600"
                      >
                        {a.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Comments -- fixed height, and sticks near the top of the viewport
              while the (often much taller) details card scrolls past it. */}
          <div className="bg-white p-5 ring-1 ring-[#ece7d8] lg:sticky lg:top-6 lg:col-span-2 lg:self-start">
            <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Comments</p>
            {task.comments.length > 0 ? (
              /* Sorted newest-first, then rendered in a reversed flex column --
                 visually that reads oldest-on-top/newest-on-bottom like a
                 texting app, and the scroll container's default (top) position
                 lands on the newest message instead of the oldest one. */
              <ul className="mt-2 flex h-72 flex-col-reverse gap-3 overflow-y-auto pr-1">
                {[...task.comments]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((c) => {
                    const { author, segments } = resolveDisplayComment(c)
                    return (
                      <li key={c.id} className="text-sm">
                        <p className="text-gray-900">
                          <span className="font-medium">{author}</span>{' '}
                          <span className="text-xs text-gray-400">{fmtDate(c.date)}</span>
                        </p>
                        <CommentBody segments={segments} />
                      </li>
                    )
                  })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-400">No comments yet.</p>
            )}

            {commentAction && accountId && (
              <form action={commentAction} className="mt-4 border-t border-[#f0ecdf] pt-3">
                <input type="hidden" name="account_id" value={accountId} />
                <input type="hidden" name="task_id" value={task.id} />
                <label
                  className="block text-xs font-mono uppercase tracking-wide text-gray-400"
                  htmlFor={`comment-${task.id}`}
                >
                  Add a comment
                </label>
                <textarea
                  id={`comment-${task.id}`}
                  name="text"
                  required
                  rows={2}
                  placeholder="Write a comment..."
                  className="mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
                />
                <button className="mt-2 bg-[#f7cf4a] px-4 py-1.5 text-sm font-semibold text-black hover:brightness-95">
                  Post
                </button>
              </form>
            )}

            {commentAction && accountId && <TaskFileUpload accountId={accountId} taskId={task.id} />}
          </div>
        </div>
      ))}
    </div>
  )
}
