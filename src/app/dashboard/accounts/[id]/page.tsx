import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listInvoicesForSubscription } from '@/lib/transactions'
import { AccountServices, type AccountService } from '@/components/account-services'
import { updateSubscriptionState } from './actions'

type AccountRow = {
  id: string
  name: string
  website: string | null
  subscriptions: {
    stripe_subscription_id: string | null
    product_name: string | null
    status: string | null
    cancel_at_period_end: boolean | null
    current_period_end: string | null
    created_at: string | null
  }[]
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Row-level security ensures this only returns an account in the user's agency.
  const { data: account } = await supabase
    .from('accounts')
    .select(
      'id, name, website, subscriptions(stripe_subscription_id, product_name, status, cancel_at_period_end, current_period_end, created_at)'
    )
    .eq('id', id)
    .maybeSingle<AccountRow>()

  if (!account) redirect('/dashboard')

  const subs = [...(account.subscriptions ?? [])].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? '')
  )

  // Fetch each service's transaction history (one Stripe call per subscription).
  const services: AccountService[] = await Promise.all(
    subs.map(async (s) => ({
      ...s,
      txns: s.stripe_subscription_id
        ? await listInvoicesForSubscription(s.stripe_subscription_id)
        : [],
    }))
  )

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[#ece7d8] bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{account.name}</h1>
          {account.website && <p className="text-sm text-gray-500">{account.website}</p>}
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back to dashboard
        </Link>
      </header>

      <section className="mx-auto max-w-3xl p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Services{services.length > 0 ? ` (${services.length})` : ''}
          </h2>
        </div>
        <AccountServices
          accountId={account.id}
          services={services}
          action={updateSubscriptionState}
        />
      </section>
    </main>
  )
}
