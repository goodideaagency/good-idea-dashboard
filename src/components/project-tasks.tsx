import type { ClickUpTask, CommentSegment } from '@/lib/clickup'
import { ClickUpStatusPill } from './clickup-status-pill'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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
        <div key={task.id} className="bg-white p-5 ring-1 ring-[#ece7d8]">
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

          {task.comments.length > 0 && (
            <div className="mt-4 border-t border-[#f0ecdf] pt-3">
              <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Comments</p>
              <ul className="mt-2 max-h-72 space-y-3 overflow-y-auto pr-1">
                {task.comments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <p className="text-gray-900">
                      <span className="font-medium">{c.author}</span>{' '}
                      <span className="text-xs text-gray-400">{fmtDate(c.date)}</span>
                    </p>
                    <CommentBody segments={c.segments} />
                  </li>
                ))}
              </ul>
            </div>
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
        </div>
      ))}
    </div>
  )
}
