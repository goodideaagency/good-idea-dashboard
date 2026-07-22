import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listProjectTasksForAgency } from '@/lib/projects'
import { ClickUpStatusPill } from '@/components/clickup-status-pill'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function ProjectsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tasks = await listProjectTasksForAgency()
  const sorted = [...tasks].sort(
    (a, b) => a.accountName.localeCompare(b.accountName) || a.name.localeCompare(b.name)
  )

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-gray-900">Projects</h1>
      <p className="mt-1 text-sm text-gray-500">Every project task across your accounts.</p>

      {sorted.length === 0 ? (
        <div className="mt-6 border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
          <p className="text-sm text-gray-500">No projects connected yet.</p>
        </div>
      ) : (
        <table className="mt-6 w-full max-w-4xl text-sm ring-1 ring-[#ece7d8]">
          <thead>
            <tr className="bg-white text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-5 py-2 font-medium">Account</th>
              <th className="px-5 py-2 font-medium">Project</th>
              <th className="px-5 py-2 font-medium">Status</th>
              <th className="px-5 py-2 font-medium">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f2ede0] bg-white">
            {sorted.map((t) => (
              <tr key={t.id}>
                <td className="px-5 py-3 text-gray-700">{t.accountName}</td>
                <td className="px-5 py-3">
                  <Link
                    href={`/dashboard/projects/${t.id}`}
                    className="font-medium text-gray-900 underline-offset-2 hover:underline"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <ClickUpStatusPill status={t.status} color={t.statusColor} />
                </td>
                <td className="px-5 py-3 text-gray-700">
                  {t.dueDate ? fmtDate(t.dueDate) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
