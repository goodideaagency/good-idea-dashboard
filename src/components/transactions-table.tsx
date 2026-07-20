import type { Txn } from '@/lib/transactions'

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function StatusBadge({ status }: { status: string }) {
  const green = status === 'paid'
  const amber = status === 'open' || status === 'draft'
  const cls = green
    ? 'bg-green-100 text-green-800'
    : amber
      ? 'bg-amber-100 text-amber-800'
      : 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

// Reusable transaction table. Optionally show an Account and/or Agency column
// (used on the "all transactions" pages; omitted on a single-subscription view).
export function TransactionsTable({
  txns,
  accountFor,
  agencyFor,
  emptyText = 'No transactions yet.',
}: {
  txns: Txn[]
  accountFor?: (subId: string | null) => string | undefined
  agencyFor?: (subId: string | null) => string | undefined
  emptyText?: string
}) {
  if (txns.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
        <p className="text-sm text-gray-500">{emptyText}</p>
      </div>
    )
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-xl bg-white ring-1 ring-[#ece7d8]">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-5 py-3 font-medium">Date</th>
            {agencyFor && <th className="px-5 py-3 font-medium">Agency</th>}
            {accountFor && <th className="px-5 py-3 font-medium">Account</th>}
            <th className="px-5 py-3 font-medium">Amount</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Receipt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f2ede0]">
          {txns.map((t) => (
            <tr key={t.id}>
              <td className="px-5 py-3 text-gray-900">{fmtDate(t.date)}</td>
              {agencyFor && (
                <td className="px-5 py-3 text-gray-700">{agencyFor(t.subscriptionId) ?? '—'}</td>
              )}
              {accountFor && (
                <td className="px-5 py-3 text-gray-700">{accountFor(t.subscriptionId) ?? '—'}</td>
              )}
              <td className="px-5 py-3 text-gray-900">{money(t.amount, t.currency)}</td>
              <td className="px-5 py-3">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-5 py-3">
                {t.url ? (
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-900 underline underline-offset-2 hover:text-gray-600"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
