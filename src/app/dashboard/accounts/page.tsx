import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StatusBadges, planLabel } from '@/components/status-badge'
import { getCreditsPriceIds } from '@/lib/subscriptions'

const ACTIVE = new Set(['active', 'trialing'])
// Stripe's own grace period -- a card decline doesn't cancel a subscription
// outright, it flips to 'past_due' (or, once retries are configured to give
// up without canceling, 'unpaid') while Smart Retries keep trying for weeks.
// This page used to only ever show ACTIVE, so the account would silently
// vanish from Managed Accounts the moment a payment failed -- confirmed
// live -- with nothing telling the agency there was even a problem, let
// alone which account. It should keep showing (with its status visibly red)
// until the relationship actually ends, same threshold the Stripe webhook
// itself uses for "did this really end" (see stripe/webhook/route.ts).
const STILL_BILLED = new Set(['active', 'trialing', 'past_due', 'unpaid'])

type AccountRow = {
  id: string
  name: string
  website: string | null
  subscriptions: {
    status: string | null
    product_name: string | null
    current_period_end: string | null
    stripe_price_id: string | null
    cancel_at_period_end: boolean | null
  }[]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// When an account has more than one active service (e.g. PPC + Programmatic),
// the soonest upcoming date is the most useful single thing to surface here --
// that's the next time this account actually gets billed.
function nextBillingLabel(subs: AccountRow['subscriptions']) {
  const upcoming = subs
    .filter((s) => s.status && ACTIVE.has(s.status) && s.current_period_end)
    .sort((a, b) => a.current_period_end!.localeCompare(b.current_period_end!))[0]
  if (!upcoming) return null
  return upcoming.cancel_at_period_end
    ? `Active until ${fmtDate(upcoming.current_period_end!)}`
    : `Renews ${fmtDate(upcoming.current_period_end!)}`
}

export default async function AccountsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: accounts } = await supabase
    .from('accounts')
    .select(
      'id, name, website, subscriptions(status, product_name, current_period_end, stripe_price_id, cancel_at_period_end)'
    )
    .order('created_at', { ascending: true })
    .returns<AccountRow[]>()

  // This page is "Managed Accounts" specifically -- a client profile whose
  // only subscription is a credit plan (Agency Support etc., not tied to
  // any one client in spirit even when a row's account_id happens to be
  // set, e.g. from hand-migrated data) shouldn't appear here, and neither
  // should one with no currently-active managed subscription at all.
  // Confirmed live: several real migrated accounts had exactly this shape.
  const allPriceIds = (accounts ?? []).flatMap((a) =>
    (a.subscriptions ?? []).map((s) => s.stripe_price_id).filter((id): id is string => !!id)
  )
  const creditsPriceIds = await getCreditsPriceIds(allPriceIds)

  const accountList = (accounts ?? [])
    .map((a) => ({
      ...a,
      subscriptions: (a.subscriptions ?? []).filter(
        (s) => !s.stripe_price_id || !creditsPriceIds.has(s.stripe_price_id)
      ),
    }))
    .filter((a) => a.subscriptions.some((s) => s.status && STILL_BILLED.has(s.status)))

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-4xl font-semibold text-gray-900">Managed Accounts</h1>
        <div className="text-right">
          <p className="text-xs font-mono uppercase tracking-wide text-gray-400">
            Total accounts
          </p>
          <p className="text-3xl font-semibold text-gray-900">{accountList.length}</p>
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-500">Manage subscriptions and billing.</p>

      <div className="mt-10 flex items-baseline justify-between">
        <p className="text-xs font-mono uppercase tracking-wide text-gray-400">
          Billed accounts
        </p>
        <Link
          href="/dashboard/request"
          className="border border-[#e7e2d3] px-3 py-1.5 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          + Add new service
        </Link>
      </div>

      {accountList.length === 0 ? (
        <div className="mt-4 border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
          <p className="text-sm text-gray-500">
            No active managed accounts yet.{' '}
            <Link href="/dashboard/request" className="underline underline-offset-2">
              Add your first one.
            </Link>
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {accountList.map((a) => {
            const subs = a.subscriptions ?? []
            const billingLabel = nextBillingLabel(subs)
            const hasFailedPayment = subs.some((s) => s.status === 'past_due' || s.status === 'unpaid')
            return (
              <div
                key={a.id}
                className={
                  hasFailedPayment
                    ? 'flex flex-col justify-between border-l-4 border-[#E0521B] bg-[#FDEDE3] p-6 ring-1 ring-[#F3C7AC]'
                    : 'flex flex-col justify-between bg-[#F5EFE2] p-6 ring-1 ring-[#ece7d8]'
                }
              >
                <div>
                  <p className="text-lg font-semibold text-gray-900">{a.name}</p>
                  <p className="mt-1 text-sm text-gray-600">{planLabel(subs)}</p>
                  <div className="mt-4">
                    {subs.length > 0 ? (
                      <StatusBadges statuses={subs.map((s) => s.status)} />
                    ) : (
                      <span className="text-xs text-gray-400">No subscription yet</span>
                    )}
                  </div>
                  {hasFailedPayment && (
                    <p className="mt-2 text-xs font-medium text-[#9A3412]">
                      Payment failed -- resolve to keep this service active.
                    </p>
                  )}
                  {billingLabel && <p className="mt-2 text-xs text-gray-500">{billingLabel}</p>}
                </div>
                <Link
                  href={`/dashboard/accounts/${a.id}`}
                  className={
                    hasFailedPayment
                      ? 'mt-8 flex items-center justify-center gap-2 bg-[#E0521B] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110'
                      : 'mt-8 flex items-center justify-center gap-2 bg-[#1a1a1a] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110'
                  }
                >
                  {hasFailedPayment ? 'Resolve payment' : 'Manage'} <span aria-hidden="true">→</span>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
