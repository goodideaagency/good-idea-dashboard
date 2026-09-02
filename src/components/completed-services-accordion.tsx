'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ProjectTask } from '@/lib/projects'
import { ClickUpStatusPill } from './clickup-status-pill'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function assignedTo(assignees: string[]) {
  return assignees.length > 0 ? assignees.join(', ') : 'Unassigned'
}

// Collapsed by default, below every other status section -- completed
// projects are reference material, not something that needs to compete for
// attention with what's actually in flight.
export function CompletedServicesAccordion({ rows }: { rows: ProjectTask[] }) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null

  return (
    <div className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wide text-gray-400 hover:text-gray-600"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="M7.5 5l5 5-5 5V5z" />
        </svg>
        Completed services
      </button>

      {open && (
        <table className="mt-4 w-full text-sm ring-1 ring-[#ece7d8]">
          <thead>
            <tr className="bg-white text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-5 py-2 font-medium">Service</th>
              <th className="px-5 py-2 font-medium">Account</th>
              <th className="px-5 py-2 font-medium">Status</th>
              <th className="px-5 py-2 font-medium">Assigned to</th>
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
                    {t.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-700">{t.accountName}</td>
                <td className="px-5 py-3">
                  <ClickUpStatusPill status={t.status} color={t.statusColor} />
                </td>
                <td className="px-5 py-3 text-gray-700">{assignedTo(t.assignees)}</td>
                <td className="px-5 py-3 text-gray-700">{t.dueDate ? fmtDate(t.dueDate) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
