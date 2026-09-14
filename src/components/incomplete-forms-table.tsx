import Link from 'next/link'
import type { IncompleteForm } from '@/lib/projects'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Synthetic statuses (not a real ClickUp status/color), so a plain pill
// rather than ClickUpStatusPill.
function StatusPill({ status }: { status: IncompleteForm['status'] }) {
  const label = status === 'draft' ? 'Draft' : 'Not started'
  const cls = status === 'draft' ? 'bg-[#f0ecdf] text-gray-700' : 'bg-amber-100 text-amber-800'
  return (
    <span className={`inline-block rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

// Every form that still needs finishing -- an in-progress draft, or a paid
// managed service whose intake form was never opened at all (see
// lib/projects.ts's listIncompleteForms). Placed above "Ongoing Services"
// on the Dashboard/Projects pages since an unfinished, paid-for setup is
// more actionable than reviewing what's already in flight.
export function IncompleteFormsTable({ rows }: { rows: IncompleteForm[] }) {
  if (rows.length === 0) return null
  return (
    <>
      <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Needs Completion</p>
      <table className="mt-4 w-full text-sm ring-1 ring-[#ece7d8]">
        <thead>
          <tr className="bg-white text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-5 py-2 font-medium">Form</th>
            <th className="px-5 py-2 font-medium">Account</th>
            <th className="px-5 py-2 font-medium">Status</th>
            <th className="px-5 py-2 font-medium">Last updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f2ede0] bg-white">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-5 py-3">
                <Link href={r.href} className="font-medium text-gray-900 underline-offset-2 hover:underline">
                  {r.label}
                </Link>
              </td>
              <td className="px-5 py-3 text-gray-700">{r.accountName}</td>
              <td className="px-5 py-3">
                <StatusPill status={r.status} />
              </td>
              <td className="px-5 py-3 text-gray-700">{r.updatedAt ? fmtDate(r.updatedAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
