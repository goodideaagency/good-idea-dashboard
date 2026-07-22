import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listInvoicesForCustomer } from '@/lib/transactions'
import { TransactionsTable } from '@/components/transactions-table'

export default async function TransactionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/dashboard')

  const { data: agency } = await supabase
    .from('agencies')
    .select('stripe_customer_id')
    .eq('id', membership.agency_id)
    .maybeSingle()

  // Map each subscription to its account name so we can label rows.
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id, accounts(name)')
  const nameBySub = new Map<string, string | undefined>()
  for (const s of subs ?? []) {
    nameBySub.set(
      s.stripe_subscription_id as string,
      (s.accounts as { name?: string } | null)?.name
    )
  }

  const txns = agency?.stripe_customer_id
    ? await listInvoicesForCustomer(agency.stripe_customer_id)
    : []

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-gray-900">Transactions</h1>
      <p className="mt-2 text-sm text-gray-500">Every payment across all your accounts.</p>
      <div className="mt-6 max-w-4xl">
        <TransactionsTable
          txns={txns}
          accountFor={(subId) => (subId ? nameBySub.get(subId) : undefined)}
          emptyText="No payments yet. They'll appear here after the first subscription is charged."
        />
      </div>
    </div>
  )
}
