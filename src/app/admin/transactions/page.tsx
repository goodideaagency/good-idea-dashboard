import Link from 'next/link'
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
  if (!user) redirect('/login')
  if (!isAdmin(user.email)) redirect('/dashboard')

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
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">All transactions</h1>
        <Link
          href="/admin"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Back to admin
        </Link>
      </header>

      <section className="mx-auto max-w-5xl p-6">
        <p className="text-sm text-gray-500">Every payment across all agencies.</p>
        <TransactionsTable
          txns={txns}
          agencyFor={(subId) => (subId ? agencyBySub.get(subId) : undefined)}
          accountFor={(subId) => (subId ? acctBySub.get(subId) : undefined)}
          emptyText="No transactions yet."
        />
      </section>
    </main>
  )
}
