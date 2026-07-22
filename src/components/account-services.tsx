import type { Txn } from '@/lib/transactions'
import { TransactionsTable } from './transactions-table'
import { SubscriptionActions } from './subscription-actions'
import { StatusBadge } from './status-badge'

export type AccountService = {
  stripe_subscription_id: string | null
  product_name: string | null
  status: string | null
  cancel_at_period_end: boolean | null
  current_period_end: string | null
  txns: Txn[]
}

// Renders every service (subscription) on an account as its own card + its own
// transaction-history table. Each card has independent cancel / restart. Shared
// by the agency and admin account-detail pages (they pass their own action).
export function AccountServices({
  accountId,
  services,
  action,
}: {
  accountId: string
  services: AccountService[]
  action: (formData: FormData) => void | Promise<void>
}) {
  if (services.length === 0) {
    return (
      <div className="bg-white p-5 ring-1 ring-[#ece7d8]">
        <p className="text-sm text-gray-500">Services</p>
        <p className="mt-1 text-sm text-gray-400">No services yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {services.map((sub, i) => {
        const isLive = sub.status === 'active' || sub.status === 'trialing'
        const canCancel = isLive && !sub.cancel_at_period_end
        const canRestart = isLive && !!sub.cancel_at_period_end
        const periodEndLabel = sub.current_period_end
          ? new Date(sub.current_period_end).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })
          : null

        return (
          <div key={sub.stripe_subscription_id ?? i}>
            <div className="bg-white p-5 ring-1 ring-[#ece7d8]">
              <p className="text-sm text-gray-500">Service</p>
              <div className="mt-1 flex items-center gap-3">
                <span className="font-medium text-gray-900">{sub.product_name ?? '—'}</span>
                <StatusBadge status={sub.status ?? 'none'} />
              </div>
              {sub.stripe_subscription_id && (
                <p className="mt-2 font-mono text-xs text-gray-400">{sub.stripe_subscription_id}</p>
              )}
              {sub.stripe_subscription_id && (
                <SubscriptionActions
                  action={action}
                  subscriptionId={sub.stripe_subscription_id}
                  accountId={accountId}
                  canCancel={canCancel}
                  canRestart={canRestart}
                  periodEndLabel={periodEndLabel}
                />
              )}
            </div>

            <p className="mt-4 text-sm font-medium text-gray-700">
              {sub.product_name ?? 'Service'} — transaction history
            </p>
            <TransactionsTable txns={sub.txns} emptyText="No transactions for this service yet." />
          </div>
        )
      })}
    </div>
  )
}
