import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listProjectTasksForAgency, type ProjectTask } from '@/lib/projects'
import { ClickUpStatusPill } from '@/components/clickup-status-pill'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const IN_PROGRESS = new Set(['in progress'])
const REVIEWING = new Set(['reviewing'])
const UPCOMING = new Set(['scoping', 'to do'])

function ProjectTable({ title, rows }: { title: string; rows: ProjectTask[] }) {
  if (rows.length === 0) return null
  return (
    <>
      <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">{title}</p>
      <table className="mt-4 w-full text-sm ring-1 ring-[#ece7d8]">
        <thead>
          <tr className="bg-white text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-5 py-2 font-medium">Project</th>
            <th className="px-5 py-2 font-medium">Status</th>
            <th className="px-5 py-2 font-medium">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f2ede0] bg-white">
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="px-5 py-3">
                <Link
                  href={`/dashboard/projects/${t.id}`}
                  className="font-medium text-gray-900 underline-offset-2 hover:underline"
                >
                  {t.accountName} — {t.name}
                </Link>
              </td>
              <td className="px-5 py-3">
                <ClickUpStatusPill status={t.status} color={t.statusColor} />
              </td>
              <td className="px-5 py-3 text-gray-700">{t.dueDate ? fmtDate(t.dueDate) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agencies(name)')
    .eq('user_id', user.id)
    .maybeSingle()

  const agencyName =
    (membership?.agencies as { name?: string } | null)?.name ?? 'your agency'

  const tasks = await listProjectTasksForAgency()
  const ongoing = tasks.filter((t) => t.status === 'ongoing')
  const inProgress = tasks.filter((t) => IN_PROGRESS.has(t.status))
  const reviewing = tasks.filter((t) => REVIEWING.has(t.status))
  const upcoming = tasks.filter((t) => UPCOMING.has(t.status))

  return (
    <div className="p-8">
      <h1 className="text-4xl font-semibold text-gray-900">Welcome back, {agencyName}!</h1>

      <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">
        Ongoing Services
      </p>
      {ongoing.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No ongoing services yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ongoing.map((t) => (
            <div
              key={t.id}
              className="flex flex-col justify-between bg-[#F5EFE2] p-6 ring-1 ring-[#ece7d8]"
            >
              <div>
                <p className="text-lg font-semibold text-gray-900">{t.accountName}</p>
                <p className="mt-1 text-sm text-gray-600">{t.name}</p>
                <div className="mt-4">
                  <ClickUpStatusPill status={t.status} color={t.statusColor} />
                </div>
              </div>
              <Link
                href={`/dashboard/projects/${t.id}`}
                className="mt-8 flex items-center justify-center gap-2 bg-[#1a1a1a] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
              >
                Open <span aria-hidden="true">→</span>
              </Link>
            </div>
          ))}
        </div>
      )}

      <ProjectTable title="In Progress" rows={inProgress} />
      <ProjectTable title="Ready to Review" rows={reviewing} />
      <ProjectTable title="Upcoming" rows={upcoming} />
    </div>
  )
}
