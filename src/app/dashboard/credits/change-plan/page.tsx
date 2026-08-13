import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveCreditSubscription } from '@/lib/credits'
import { listPlansForAgency } from '@/lib/plans'
import { CreditPlanActions } from '@/components/credit-plan-actions'
import { SubmitButton } from '@/components/submit-button'
import { switchCreditPlan, updateCreditPlanCancelation } from '../actions'

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US')}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function ChangeCreditPlanPage() {
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

  const [activeSub, allPlans] = await Promise.all([
    getActiveCreditSubscription(agencyId),
    listPlansForAgency(agencyName),
  ])
  // Nothing to change if there's no active plan -- back to the normal
  // Credits page, where starting one for the first time lives.
  if (!activeSub) redirect('/dashboard/credits')

  const otherCreditPlans = allPlans.filter((p) => p.creditsPerCycle > 0 && p.id !== activeSub.priceId)
  const periodEndLabel = activeSub.currentPeriodEnd ? fmtDate(activeSub.currentPeriodEnd) : null

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-gray-900">Change Your Plan</h1>
        <Link
          href="/dashboard/credits"
          className="text-sm text-gray-700 hover:text-gray-900 font-mono uppercase tracking-wide"
        >
          Back
        </Link>
      </div>

      <div className="mt-6 max-w-2xl">
        <div className="bg-[#f9f5f1] p-6 ring-1 ring-[#ece7d8]">
          <p className="text-xs uppercase tracking-wide text-gray-400">Current plan</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{activeSub.productName ?? 'Agency Support'}</p>
          <p className="mt-1 text-sm text-gray-500">
            {activeSub.cancelAtPeriodEnd
              ? periodEndLabel && `Active until ${periodEndLabel}`
              : periodEndLabel && `Renews ${periodEndLabel}`}
          </p>
          <div className="mt-4 border-t border-[#ece7d8] pt-4">
            <CreditPlanActions
              action={updateCreditPlanCancelation}
              canCancel={!activeSub.cancelAtPeriodEnd}
              canRestart={activeSub.cancelAtPeriodEnd}
              periodEndLabel={periodEndLabel}
            />
          </div>
        </div>

        {otherCreditPlans.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">Switch to a different plan</h2>
            <p className="mt-1 text-sm text-gray-500">
              Takes effect immediately -- Stripe prorates the difference on your next invoice.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {otherCreditPlans.map((p) => (
                <form
                  key={p.id}
                  action={switchCreditPlan}
                  className="flex flex-col justify-between bg-white p-5 ring-1 ring-[#ece7d8]"
                >
                  <input type="hidden" name="price_id" value={p.id} />
                  <div>
                    <p className="font-semibold text-gray-900">{p.name}</p>
                    <p className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-semibold text-gray-900">{money(p.amount)}</span>
                      <span className="text-sm text-gray-500">/{p.interval}</span>
                    </p>
                    <p className="mt-1 text-sm text-gray-500">{p.creditsPerCycle} credits/cycle</p>
                  </div>
                  <SubmitButton
                    pendingText="Switching…"
                    className="mt-4 bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Switch to this plan
                  </SubmitButton>
                </form>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
