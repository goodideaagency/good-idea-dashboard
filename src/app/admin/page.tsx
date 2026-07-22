import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Logo } from '@/components/logo'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminRole } from '@/lib/admin-auth'
import { calculateMrrCents, formatMoney } from '@/lib/mrr'
import { StatusBadges, planLabel } from '@/components/status-badge'
import { signout } from '../login/actions'
import { setAgencyArchived, syncSubscriptionAmounts } from './actions'

const ACTIVE = new Set(['active', 'trialing'])

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  const role = await getAdminRole(user.email)
  if (!role) redirect('/dashboard')

  const admin = createAdminClient()
  const [agenciesRes, accountsRes, subsRes, membersRes] = await Promise.all([
    admin
      .from('agencies')
      .select('id, name, stripe_customer_id, archived, created_at')
      .order('created_at'),
    admin.from('accounts').select('id, agency_id, name, website').order('created_at'),
    admin
      .from('subscriptions')
      .select('account_id, agency_id, product_name, status, amount_cents, interval'),
    admin.from('agency_users').select('user_id, agency_id'),
  ])

  const agencies = agenciesRes.data ?? []
  const accounts = accountsRes.data ?? []
  const subs = subsRes.data ?? []
  const members = membersRes.data ?? []

  // Map each account to ALL its subscriptions (an account can have several).
  const subsByAccount = new Map<string, typeof subs>()
  for (const s of subs) {
    if (!s.account_id) continue
    const list = subsByAccount.get(s.account_id) ?? []
    list.push(s)
    subsByAccount.set(s.account_id, list)
  }

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

  // Hide admin-owned agencies (auto-created when an admin signs up) from the list.
  const { data: adminRows } = await admin.from('admins').select('email')
  const adminEmails = new Set<string>(
    (adminRows ?? []).map((r) => (r.email as string).toLowerCase())
  )
  const superEmail = (process.env.SUPERADMIN_EMAIL ?? '').trim().toLowerCase()
  if (superEmail) adminEmails.add(superEmail)
  const visibleAgencies = agencies.filter(
    (a) => !a.archived && !adminEmails.has((emailByAgency.get(a.id) ?? '').toLowerCase())
  )
  const archivedCount = agencies.filter((a) => a.archived).length

  const accountsByAgency = new Map<string, typeof accounts>()
  for (const a of accounts) {
    const list = accountsByAgency.get(a.agency_id) ?? []
    list.push(a)
    accountsByAgency.set(a.agency_id, list)
  }

  const activeCount = subs.filter((s) => s.status && ACTIVE.has(s.status)).length
  const totalMrrCents = calculateMrrCents(subs)
  const needsAmountSync = subs.some(
    (s) => s.status && ACTIVE.has(s.status) && s.amount_cents == null
  )

  const subsByAgency = new Map<string, typeof subs>()
  for (const s of subs) {
    if (!s.agency_id) continue
    const list = subsByAgency.get(s.agency_id) ?? []
    list.push(s)
    subsByAgency.set(s.agency_id, list)
  }

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[#ece7d8] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Logo height={20} />
          <div className="h-6 w-px bg-[#ece7d8]" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Admin</h1>
            <p className="text-sm text-gray-500">Every agency, account, and subscription</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/new-agency"
            className="rounded-lg bg-[#f7cf4a] px-3 py-1.5 text-sm font-semibold text-black hover:brightness-95 font-mono uppercase tracking-wide"
          >
            + New agency
          </Link>
          {role === 'superadmin' && (
            <Link
              href="/admin/admins"
              className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
            >
              Admins
            </Link>
          )}
          <Link
            href="/admin/products"
            className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
          >
            Products
          </Link>
          <Link
            href="/admin/transactions"
            className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
          >
            All transactions
          </Link>
          <Link
            href="/admin/archived"
            className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
          >
            Archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
          </Link>
          <form action={signout}>
            <button className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-5xl p-6">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'MRR', value: formatMoney(totalMrrCents) },
            { label: 'Agencies', value: visibleAgencies.length },
            { label: 'Client accounts', value: accounts.length },
            { label: 'Active subscriptions', value: activeCount },
          ].map((t) => (
            <div key={t.label} className="rounded-xl bg-white p-5 ring-1 ring-[#ece7d8]">
              <p className="text-2xl font-semibold text-gray-900">{t.value}</p>
              <p className="text-sm text-gray-500">{t.label}</p>
            </div>
          ))}
        </div>

        {needsAmountSync && (
          <form action={syncSubscriptionAmounts} className="mt-3">
            <p className="text-xs text-gray-400">
              Some subscriptions are missing price data, so MRR may be understated.{' '}
              <button className="underline underline-offset-2 hover:text-gray-600">
                Sync amounts from Stripe
              </button>
            </p>
          </form>
        )}

        {/* Per-agency breakdown */}
        <div className="mt-8 space-y-6">
          {visibleAgencies.map((agency) => {
            const agencyAccounts = accountsByAgency.get(agency.id) ?? []
            const email = emailByAgency.get(agency.id)
            const agencyMrrCents = calculateMrrCents(subsByAgency.get(agency.id) ?? [])
            return (
              <div key={agency.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-[#ece7d8]">
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
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      {formatMoney(agencyMrrCents)}/mo
                    </span>
                    <span className="text-sm text-gray-500">
                      {agencyAccounts.length} account{agencyAccounts.length === 1 ? '' : 's'}
                    </span>
                    <Link
                      href={`/admin/view-as/${agency.id}`}
                      className="rounded-lg border border-[#e7e2d3] px-2.5 py-1 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
                    >
                      View
                    </Link>
                    <form action={setAgencyArchived}>
                      <input type="hidden" name="agency_id" value={agency.id} />
                      <input type="hidden" name="archived" value="true" />
                      <button className="rounded-lg border border-[#e7e2d3] px-2.5 py-1 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide">
                        Archive
                      </button>
                    </form>
                  </div>
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
                    <tbody className="divide-y divide-[#f2ede0]">
                      {agencyAccounts.map((acc) => {
                        const accSubs = subsByAccount.get(acc.id) ?? []
                        return (
                          <tr key={acc.id}>
                            <td className="px-5 py-3">
                              <Link
                                href={`/admin/accounts/${acc.id}`}
                                className="font-medium text-gray-900 underline-offset-2 hover:underline"
                              >
                                {acc.name}
                              </Link>
                              {acc.website && (
                                <p className="text-xs text-gray-500">{acc.website}</p>
                              )}
                            </td>
                            <td className="px-5 py-3 text-gray-700">{planLabel(accSubs)}</td>
                            <td className="px-5 py-3">
                              {accSubs.length === 0 ? (
                                <span className="text-xs text-gray-400">No subscription</span>
                              ) : (
                                <StatusBadges statuses={accSubs.map((s) => s.status)} />
                              )}
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
