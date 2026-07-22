import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { listAllInvoices } from '@/lib/transactions'
import { TransactionsTable } from '@/components/transactions-table'

export default async function AdminTransactionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')
  if (!(await isAdmin(user.email))) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, accounts(name), agencies(name)')

  const acctBySub = new Map<string, string | undefined>()
  const agencyBySub = new Map<string, string | undefined>()
  for (const s of subs ?? []) {
    const id = s.stripe_subscription_id as string
    acctBySub.set(id, (s.accounts as { name?: string } | null)?.name)
    agencyBySub.set(id, (s.agencies as { name?: string } | null)?.name)
  }

  const txns = await listAllInvoices()

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-gray-900">All transactions</h1>
      <p className="mt-1 text-sm text-gray-500">Every payment across all agencies.</p>
      <div className="mt-6 max-w-5xl">
        <TransactionsTable
          txns={txns}
          agencyFor={(subId) => (subId ? agencyBySub.get(subId) : undefined)}
          accountFor={(subId) => (subId ? acctBySub.get(subId) : undefined)}
          emptyText="No transactions yet."
        />
      </div>
    </div>
  )
}
