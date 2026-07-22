import type { ClickUpTask } from '@/lib/clickup'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Renders every ClickUp task for an account's connected List: title, status
// (using ClickUp's own status color), due date, comments, and attachments.
// Shared by the agency and admin account-detail pages.
export function ProjectTasks({ tasks }: { tasks: ClickUpTask[] }) {
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
            <span
              className="inline-block rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide text-white"
              style={{ backgroundColor: task.statusColor }}
            >
              {task.status}
            </span>
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
              <ul className="mt-2 space-y-3">
                {task.comments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <p className="text-gray-900">
                      <span className="font-medium">{c.author}</span>{' '}
                      <span className="text-xs text-gray-400">{fmtDate(c.date)}</span>
                    </p>
                    <p className="mt-0.5 text-gray-600">{c.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
