import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { listInvoicesForSubscription } from '@/lib/transactions'
import { TransactionsTable } from '@/components/transactions-table'

type AccountRow = {
  id: string
  name: string
  website: string | null
  agencies: { name?: string } | null
  subscriptions: {
    stripe_subscription_id: string | null
    product_name: string | null
    status: string | null
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
      'id, name, website, agencies(name), subscriptions(stripe_subscription_id, product_name, status)'
    )
    .eq('id', id)
    .maybeSingle<AccountRow>()

  if (!account) redirect('/admin')

  const sub = account.subscriptions?.[0]
  const txns = sub?.stripe_subscription_id
    ? await listInvoicesForSubscription(sub.stripe_subscription_id)
    : []

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{account.name}</h1>
          <p className="text-sm text-gray-500">
            {account.agencies?.name ?? 'Unknown agency'}
            {account.website ? ` · ${account.website}` : ''}
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 font-mono"
        >
          ← Back to admin
        </Link>
      </header>

      <section className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
          <p className="text-sm text-gray-500">Subscription</p>
          {sub ? (
            <div className="mt-1 flex items-center gap-3">
              <span className="font-medium text-gray-900">{sub.product_name ?? '—'}</span>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  sub.status === 'active' || sub.status === 'trialing'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {sub.status ?? 'none'}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-400">No subscription yet.</p>
          )}
        </div>

        <h2 className="mt-8 text-base font-semibold text-gray-900">Transaction history</h2>
        <TransactionsTable txns={txns} emptyText="No transactions for this account yet." />
      </section>
    </main>
  )
}
