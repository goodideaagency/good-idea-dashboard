import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminRole } from '@/lib/admin-auth'
import { calculateMrrCents, formatMoney } from '@/lib/mrr'
import { backfillSubscriptionMetadata, syncSubscriptionAmounts } from './actions'

const ACTIVE = new Set(['active', 'trialing'])

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ backfilled?: string; backfillFailed?: string }>
}) {
  const { backfilled, backfillFailed } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')
  const role = await getAdminRole(user.email)
  if (!role) redirect('/dashboard')

  const admin = createAdminClient()
  const [agenciesRes, accountsRes, subsRes, membersRes] = await Promise.all([
    admin
      .from('agencies')
      .select('id, name, stripe_customer_id, archived, created_at')
      .order('created_at'),
    admin.from('accounts').select('id, agency_id').order('created_at'),
    admin
      .from('subscriptions')
      .select('account_id, agency_id, status, amount_cents, interval, cancel_at_period_end'),
    admin.from('agency_users').select('user_id, agency_id'),
  ])

  const agencies = agenciesRes.data ?? []
  const accounts = accountsRes.data ?? []
  const subs = subsRes.data ?? []
  const members = membersRes.data ?? []

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

  const accountsByAgency = new Map<string, typeof accounts>()
  for (const a of accounts) {
    const list = accountsByAgency.get(a.agency_id) ?? []
    list.push(a)
    accountsByAgency.set(a.agency_id, list)
  }

  // The summary tiles must only reflect agencies actually shown below --
  // otherwise an archived (or admin-owned) agency's subscriptions still
  // inflated the totals while being invisible in the agency list itself,
  // with no way to tell why the numbers didn't add up. Confirmed live: the
  // archived "Test Agency (delete me)" alone was contributing 3 phantom
  // active subscriptions and $1,000+ of phantom MRR.
  const visibleAgencyIds = new Set(visibleAgencies.map((a) => a.id))
  const visibleSubs = subs.filter((s) => s.agency_id && visibleAgencyIds.has(s.agency_id))

  const activeCount = visibleSubs.filter((s) => s.status && ACTIVE.has(s.status)).length
  const pendingCancellationCount = visibleSubs.filter(
    (s) => s.status && ACTIVE.has(s.status) && s.cancel_at_period_end
  ).length
  const totalMrrCents = calculateMrrCents(visibleSubs)

  const subsByAgency = new Map<string, typeof subs>()
  for (const s of subs) {
    if (!s.agency_id) continue
    const list = subsByAgency.get(s.agency_id) ?? []
    list.push(s)
    subsByAgency.set(s.agency_id, list)
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Agencies</h1>
          <p className="mt-1 text-sm text-gray-500">Every agency, account, and subscription</p>
        </div>
        <form action={backfillSubscriptionMetadata}>
          <button className="border border-[#e7e2d3] px-3 py-1.5 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide">
            Backfill Stripe metadata
          </button>
        </form>
      </div>

      {(backfilled || backfillFailed) && (
        <p className="mt-3 bg-green-50 px-3 py-2 text-sm text-green-700">
          Backfilled {backfilled ?? 0} subscription{backfilled === '1' ? '' : 's'}
          {backfillFailed && Number(backfillFailed) > 0 ? ` — ${backfillFailed} skipped (missing data)` : ''}.
        </p>
      )}

      {/* Summary tiles */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="bg-white p-5 ring-1 ring-[#ece7d8]">
          <p className="text-2xl font-semibold text-gray-900">{activeCount}</p>
          <p className="text-sm text-gray-500">Active Subscriptions</p>
        </div>
        <div className="bg-white p-5 ring-1 ring-[#ece7d8]">
          <p className="text-2xl font-semibold text-gray-900">{visibleAgencies.length}</p>
          <p className="text-sm text-gray-500">Agencies</p>
        </div>
        <div className="bg-white p-5 ring-1 ring-[#ece7d8]">
          <p className="text-2xl font-semibold text-gray-900">{pendingCancellationCount}</p>
          <p className="text-sm text-gray-500">Pending Cancellation</p>
        </div>
        <div className="flex items-start justify-between bg-white p-5 ring-1 ring-[#ece7d8]">
          <div>
            <p className="text-2xl font-semibold text-gray-900">{formatMoney(totalMrrCents)}</p>
            <p className="text-sm text-gray-500">MRR</p>
          </div>
          <form action={syncSubscriptionAmounts}>
            <button className="font-mono text-xs uppercase tracking-wide text-gray-400 hover:text-gray-600">
              Sync
            </button>
          </form>
        </div>
      </div>

      {/* Agency cards */}
      <p className="mt-10 text-xs font-mono uppercase tracking-wide text-gray-400">Agencies</p>
      {visibleAgencies.length === 0 ? (
        <div className="mt-4 border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
          <p className="text-sm text-gray-500">No agencies yet.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleAgencies.map((agency) => {
            const agencyAccounts = accountsByAgency.get(agency.id) ?? []
            const agencySubs = subsByAgency.get(agency.id) ?? []
            // A client profile can carry more than one active subscription
            // (e.g. a managed White Label PPC plan AND a Programmatic plan
            // on the same account) -- counting profiles undercounts actual
            // workload. This counts every active subscription, managed or
            // credit-granting alike, which is what the admin team actually
            // needs to gauge.
            const agencyActiveSubs = agencySubs.filter((s) => s.status && ACTIVE.has(s.status))
            const agencyMrrCents = calculateMrrCents(agencySubs)
            return (
              <div
                key={agency.id}
                className="flex flex-col justify-between bg-[#F5EFE2] p-6 ring-1 ring-[#ece7d8]"
              >
                <div>
                  <p className="text-lg font-semibold text-gray-900">{agency.name}</p>
                  <div className="mt-1 flex items-center justify-between text-sm text-gray-600">
                    <span>
                      {agencyActiveSubs.length} active subscription
                      {agencyActiveSubs.length === 1 ? '' : 's'}
                    </span>
                    <span className="font-medium text-gray-900">
                      {formatMoney(agencyMrrCents)}/mo
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {agencyAccounts.length} client{agencyAccounts.length === 1 ? '' : 's'}
                  </p>
                </div>

                <Link
                  href={`/admin/agencies/${agency.id}`}
                  className="mt-6 flex items-center justify-center gap-2 bg-[#1a1a1a] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
                >
                  Accounts <span aria-hidden="true">→</span>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
