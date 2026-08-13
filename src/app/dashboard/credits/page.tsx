import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getActiveCreditSubscription,
  getAgencyCreditBalance,
  getAgencyCreditHistory,
  listCreditTopupProducts,
  type CreditHistoryEntry,
} from '@/lib/credits'
import { listPlansForAgency } from '@/lib/plans'
import { SubmitButton } from '@/components/submit-button'
import { buyCreditTopup } from './actions'

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    cents / 100
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const SOURCE_LABEL: Record<string, string> = {
  subscription_initial: 'Plan signup',
  subscription_renewal: 'Plan renewal',
  topup: 'Credit top-up purchase',
  manual: 'Adjusted by Good Idea',
  task_cost_decrease: 'Service cost lowered',
}

const REASON_LABEL: Record<string, string> = {
  service_request: 'Service requested',
  task_cost_increase: 'Service cost increased',
  manual: 'Adjusted by Good Idea',
}

function HistoryRow({ entry }: { entry: CreditHistoryEntry }) {
  const isGrant = entry.type === 'grant'
  const label = isGrant ? SOURCE_LABEL[entry.source] ?? entry.source : REASON_LABEL[entry.reason] ?? entry.reason
  return (
    <div className="flex items-center justify-between border-b border-[#ece7d8] py-3 text-sm last:border-0">
      <div>
        <p className="text-gray-900">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400">
          {new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {isGrant &&
            ` · expires ${new Date(entry.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
        </p>
      </div>
      <span className={`font-mono text-sm font-semibold ${isGrant ? 'text-green-700' : 'text-gray-900'}`}>
        {isGrant ? '+' : '-'}
        {entry.amount}
      </span>
    </div>
  )
}

export default async function CreditsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_id, agencies(name)')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/dashboard')

  const agencyId = membership.agency_id as string
  const agencyName = (membership.agencies as { name?: string } | null)?.name ?? ''

  const [balance, activeSub, history, topups, allPlans] = await Promise.all([
    getAgencyCreditBalance(agencyId),
    getActiveCreditSubscription(agencyId),
    getAgencyCreditHistory(agencyId),
    listCreditTopupProducts(),
    listPlansForAgency(agencyName),
  ])
  const eligible = activeSub !== null
  const creditPlans = allPlans.filter((p) => p.creditsPerCycle > 0)

  return (
    <div>
      <h1 className="text-3xl font-semibold text-gray-900">Credits</h1>
      <p className="mt-2 text-sm text-gray-500">
        Used to request one-time services. Credits roll over for 30 days and expire 60 days after
        they&apos;re added.
      </p>

      <div className="mt-6 max-w-4xl">
        <div className={`grid grid-cols-1 gap-4 ${activeSub ? 'sm:grid-cols-2' : ''}`}>
          <div className="bg-[#f9f5f1] p-6 ring-1 ring-[#ece7d8]">
            <p className="text-xs uppercase tracking-wide text-gray-400">Current balance</p>
            <p className="mt-1 font-mono text-4xl font-semibold text-gray-900">{balance}</p>
            <p className="mt-1 text-sm text-gray-500">credits available</p>
          </div>

          {activeSub && (
            <div className="bg-[#f9f5f1] p-6 ring-1 ring-[#ece7d8]">
              <p className="text-xs uppercase tracking-wide text-gray-400">Your plan</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {activeSub.productName ?? 'Agency Support'}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {activeSub.currentPeriodEnd &&
                  (activeSub.cancelAtPeriodEnd
                    ? `Active until ${fmtDate(activeSub.currentPeriodEnd)}`
                    : `Renews ${fmtDate(activeSub.currentPeriodEnd)}`)}
              </p>
              <Link
                href="/dashboard/credits/change-plan"
                className="mt-4 inline-block border border-[#e7e2d3] px-4 py-2 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
              >
                Change plan
              </Link>
            </div>
          )}
        </div>

        {!activeSub && creditPlans.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">Agency Support Plans</h2>
            <p className="mt-1 text-sm text-gray-500">Monthly plans that grant credits every cycle.</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {creditPlans.map((p) => (
                <div key={p.id} className="flex flex-col justify-between bg-white p-5 ring-1 ring-[#ece7d8]">
                  <div>
                    <p className="font-semibold text-gray-900">{p.name}</p>
                    <p className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-semibold text-gray-900">{money(p.amount, 'USD')}</span>
                      <span className="text-sm text-gray-500">/{p.interval}</span>
                    </p>
                    <p className="mt-1 text-sm text-gray-500">{p.creditsPerCycle} credits/cycle</p>
                  </div>
                  <Link
                    href={`/dashboard/add?plan=${encodeURIComponent(p.id)}`}
                    className="mt-4 flex items-center justify-center bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
                  >
                    Start This Service
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {eligible && topups.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">Buy more credits</h2>
            <p className="mt-1 text-sm text-gray-500">One-time top-ups, no subscription required.</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {topups.map((t) => (
                <form key={t.priceId} action={buyCreditTopup} className="bg-white p-5 ring-1 ring-[#ece7d8]">
                  <input type="hidden" name="priceId" value={t.priceId} />
                  <p className="font-semibold text-gray-900">{t.credits} Credits</p>
                  <p className="text-sm text-gray-500">{money(t.amountCents, t.currency)}</p>
                  <SubmitButton
                    pendingText="Redirecting…"
                    className="mt-4 w-full bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Buy
                  </SubmitButton>
                </form>
              ))}
            </div>
          </div>
        )}

        {!eligible && (
          <div className="mt-8 border border-dashed border-[#e7e2d3] bg-white p-6 text-sm text-gray-500">
            Credit top-ups are available once you have an active plan that grants credits.
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">History</h2>
          <div className="mt-3 bg-white p-5 ring-1 ring-[#ece7d8]">
            {history.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">No credit activity yet.</p>
            ) : (
              history.map((entry) => <HistoryRow key={`${entry.type}-${entry.id}`} entry={entry} />)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
