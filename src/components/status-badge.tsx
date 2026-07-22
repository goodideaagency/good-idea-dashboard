const ACTIVE = new Set(['active', 'trialing'])
const RED = new Set(['past_due', 'unpaid', 'incomplete', 'canceled'])

export function StatusBadge({ status }: { status: string }) {
  const cls = ACTIVE.has(status)
    ? 'bg-green-100 text-green-800'
    : RED.has(status)
      ? 'bg-red-100 text-red-800'
      : 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

// One badge if every service is active/trialing; one badge per distinct
// status otherwise (e.g. "active" + "unpaid" shown side by side).
export function StatusBadges({ statuses }: { statuses: (string | null)[] }) {
  const distinct = [...new Set(statuses.map((s) => s ?? 'none'))]
  if (distinct.every((s) => ACTIVE.has(s))) return <StatusBadge status="active" />
  return (
    <div className="flex flex-wrap gap-1">
      {distinct.map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </div>
  )
}

// "Plan name" for one service, "N plans" for several, "—" for none.
export function planLabel(subs: { product_name: string | null }[]): string {
  if (subs.length === 0) return '—'
  if (subs.length === 1) return subs[0].product_name ?? '—'
  return `${subs.length} plans`
}
