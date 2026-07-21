import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { listInvoicesForSubscription } from '@/lib/transactions'
import { AccountServices, type AccountService } from '@/components/account-services'
import { updateSubscriptionStateAdmin } from './actions'

type AccountRow = {
  id: string
  name: string
  website: string | null
  agencies: { name?: string } | null
  subscriptions: {
    stripe_subscription_id: string | null
    product_name: string | null
    status: string | null
    cancel_at_period_end: boolean | null
    current_period_end: string | null
    created_at: string | null
  }[]
}

export default async function AdminAccountDetailPage({
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
  if (!(await isAdmin(user.email))) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: account } = await admin
    .from('accounts')
    .select(
      'id, name, website, agencies(name), subscriptions(stripe_subscription_id, product_name, status, cancel_at_period_end, current_period_end, created_at)'
    )
    .eq('id', id)
    .maybeSingle<AccountRow>()

  if (!account) redirect('/admin')

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
          <p className="text-sm text-gray-500">
            {account.agencies?.name ?? 'Unknown agency'}
            {account.website ? ` · ${account.website}` : ''}
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back to admin
        </Link>
      </header>

      <section className="mx-auto max-w-3xl p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Services{services.length > 0 ? ` (${services.length})` : ''}
        </h2>
        <AccountServices
          accountId={account.id}
          services={services}
          action={updateSubscriptionStateAdmin}
        />
      </section>
    </main>
  )
}
