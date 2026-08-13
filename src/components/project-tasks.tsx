import ReactMarkdown from 'react-markdown'
import type { ClickUpComment, ClickUpTask, CommentSegment } from '@/lib/clickup'
import { ClickUpStatusPill } from './clickup-status-pill'
import { CommentComposer } from './comment-composer'
import { FileTile } from './file-tile'
import { SubmitButton } from './submit-button'

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

// Consecutive file segments (e.g. several attachments dropped on one
// ClickUp comment) render as one tile row instead of a tile per line --
// same grouping a plain array->rows layout would need for any file grid.
type SegmentGroup =
  | { kind: 'files'; segments: Extract<CommentSegment, { type: 'file' }>[] }
  | { kind: 'text'; segment: Extract<CommentSegment, { type: 'text' }> }

function groupSegments(segments: CommentSegment[]): SegmentGroup[] {
  const groups: SegmentGroup[] = []
  for (const seg of segments) {
    if (seg.type === 'file') {
      const last = groups[groups.length - 1]
      if (last?.kind === 'files') last.segments.push(seg)
      else groups.push({ kind: 'files', segments: [seg] })
    } else {
      groups.push({ kind: 'text', segment: seg })
    }
  }
  return groups
}

// Renders a comment's segments in order: plain text (newlines preserved)
// and file/image attachments as the same standard-size thumbnail tiles used
// everywhere else in the app.
function CommentBody({ segments }: { segments: CommentSegment[] }) {
  return (
    <div className="mt-0.5 space-y-2 text-gray-600">
      {groupSegments(segments).map((group, i) => {
        if (group.kind === 'files') {
          return (
            <div key={i} className="flex flex-wrap gap-3">
              {group.segments.map((seg) => (
                <FileTile
                  key={seg.id}
                  file={{ id: seg.id, title: seg.name, url: seg.url, extension: seg.extension, thumbnail: seg.thumbnail }}
                />
              ))}
            </div>
          )
        }
        return (
          <span key={i} className="whitespace-pre-wrap">
            {group.segment.text}
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
  reopenAction,
  creditCosts,
}: {
  tasks: ClickUpTask[]
  accountId?: string
  commentAction?: (formData: FormData) => void | Promise<void>
  // Agency-only, like commentAction -- moves a completed project back to
  // "scoping" so the team sees it needs attention again.
  reopenAction?: (formData: FormData) => void | Promise<void>
  // Net credit cost per task (after any reconciliation), keyed by task id --
  // only present for tasks that were opened as a credit-funded service
  // request. See getAlreadyChargedForTask in credits.ts for how it's derived.
  creditCosts?: Record<string, number>
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
      {tasks.map((task) => {
        const isComplete = task.status === 'complete'
        return (
        <div key={task.id} className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
          {/* Details -- grows as tall as it needs to. */}
          <div className="bg-white p-5 ring-1 ring-[#ece7d8] lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-gray-900">{task.name}</p>
              <ClickUpStatusPill status={task.status} color={task.statusColor} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              {task.assignees.length > 0 && <span>Owner: {task.assignees.join(', ')}</span>}
              {task.dueDate && <span>Due {fmtDate(task.dueDate)}</span>}
              {task.dateCreated && <span>Added {fmtDate(task.dateCreated)}</span>}
              {creditCosts?.[task.id] !== undefined && (
                <span className="font-medium text-gray-900">{creditCosts[task.id]} credits</span>
              )}
              {/* Admin-only -- agency view never shows the underlying ClickUp
                  link (commentAction is only ever passed on the agency side). */}
              {!commentAction && (
                <a
                  href={task.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-gray-800"
                >
                  View in ClickUp
                </a>
              )}
            </div>

            {task.description && (
              <div className="mt-3 space-y-2 border-t border-[#f0ecdf] pt-3 text-sm text-gray-700 [&_a]:text-gray-900 [&_a]:underline [&_a]:underline-offset-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown>{task.description}</ReactMarkdown>
              </div>
            )}

            {task.attachments.length > 0 && (
              <div className="mt-4 border-t border-[#f0ecdf] pt-3">
                <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Files</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  {task.attachments.map((a) => (
                    <FileTile key={a.id} file={a} />
                  ))}
                </div>
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

            {commentAction && accountId && !isComplete && (
              <CommentComposer accountId={accountId} taskId={task.id} commentAction={commentAction} />
            )}

            {reopenAction && accountId && isComplete && (
              <form action={reopenAction} className="mt-4 border-t border-[#f0ecdf] pt-3">
                <input type="hidden" name="account_id" value={accountId} />
                <input type="hidden" name="task_id" value={task.id} />
                <p className="text-xs text-gray-500">
                  This project is marked complete -- comments are closed. Reopen it if the team
                  needs to pick it back up.
                </p>
                <SubmitButton
                  pendingText="Reopening…"
                  className="mt-2 border border-[#e7e2d3] px-4 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reopen service
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
        )
      })}
    </div>
  )
}
