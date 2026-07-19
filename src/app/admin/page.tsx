import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { signout } from '../login/actions'

const ACTIVE = new Set(['active', 'trialing'])

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-xs text-gray-400">No subscription</span>
  }
  const green = ACTIVE.has(status)
  const red = ['past_due', 'unpaid', 'incomplete', 'canceled'].includes(status)
  const cls = green
    ? 'bg-green-100 text-green-800'
    : red
      ? 'bg-red-100 text-red-800'
      : 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (!isAdmin(user.email)) redirect('/dashboard')

  const admin = createAdminClient()
  const [agenciesRes, accountsRes, subsRes, membersRes] = await Promise.all([
    admin.from('agencies').select('id, name, stripe_customer_id, created_at').order('created_at'),
    admin.from('accounts').select('id, agency_id, name, website').order('created_at'),
    admin.from('subscriptions').select('account_id, agency_id, product_name, status'),
    admin.from('agency_users').select('user_id, agency_id'),
  ])

  const agencies = agenciesRes.data ?? []
  const accounts = accountsRes.data ?? []
  const subs = subsRes.data ?? []
  const members = membersRes.data ?? []

  // Map each account to its (first) subscription.
  const subByAccount = new Map<string, (typeof subs)[number]>()
  for (const s of subs) if (s.account_id) subByAccount.set(s.account_id, s)

  // Map each agency to a contact email (best effort).
  const emailByUser = new Map<string, string>()
  try {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    for (const u of data.users) if (u.email) emailByUser.set(u.id, u.email)
  } catch {
    // listing users is optional; skip if it fails
  }
  const emailByAgency = new Map<string, string>()
  for (const m of members) {
    const email = emailByUser.get(m.user_id)
    if (email && !emailByAgency.has(m.agency_id)) emailByAgency.set(m.agency_id, email)
  }

  const accountsByAgency = new Map<string, typeof accounts>()
  for (const a of accounts) {
    const list = accountsByAgency.get(a.agency_id) ?? []
    list.push(a)
    accountsByAgency.set(a.agency_id, list)
  }

  const activeCount = subs.filter((s) => s.status && ACTIVE.has(s.status)).length

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Good Idea — Admin</h1>
          <p className="text-sm text-gray-500">Every agency, account, and subscription</p>
        </div>
        <form action={signout}>
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            Sign out
          </button>
        </form>
      </header>

      <section className="mx-auto max-w-5xl p-6">
        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Agencies', value: agencies.length },
            { label: 'Client accounts', value: accounts.length },
            { label: 'Active subscriptions', value: activeCount },
          ].map((t) => (
            <div key={t.label} className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
              <p className="text-2xl font-semibold text-gray-900">{t.value}</p>
              <p className="text-sm text-gray-500">{t.label}</p>
            </div>
          ))}
        </div>

        {/* Per-agency breakdown */}
        <div className="mt-8 space-y-6">
          {agencies.map((agency) => {
            const agencyAccounts = accountsByAgency.get(agency.id) ?? []
            const email = emailByAgency.get(agency.id)
            return (
              <div key={agency.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
                  <div>
                    <h2 className="font-semibold text-gray-900">{agency.name}</h2>
                    <p className="text-sm text-gray-500">
                      {email ?? 'no login on file'}
                      {agency.stripe_customer_id && (
                        <span className="ml-2 font-mono text-xs text-gray-400">
                          {agency.stripe_customer_id}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm text-gray-500">
                    {agencyAccounts.length} account{agencyAccounts.length === 1 ? '' : 's'}
                  </span>
                </div>

                {agencyAccounts.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-400">No accounts yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="px-5 py-2 font-medium">Account</th>
                        <th className="px-5 py-2 font-medium">Plan</th>
                        <th className="px-5 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {agencyAccounts.map((acc) => {
                        const sub = subByAccount.get(acc.id)
                        return (
                          <tr key={acc.id}>
                            <td className="px-5 py-3">
                              <p className="font-medium text-gray-900">{acc.name}</p>
                              {acc.website && (
                                <p className="text-xs text-gray-500">{acc.website}</p>
                              )}
                            </td>
                            <td className="px-5 py-3 text-gray-700">
                              {sub?.product_name ?? '—'}
                            </td>
                            <td className="px-5 py-3">
                              <StatusBadge status={sub?.status ?? null} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
