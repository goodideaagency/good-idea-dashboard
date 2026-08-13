import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listPlansForAgency } from '@/lib/plans'
import { AddServiceForm } from '@/components/add-service-form'
import { addServiceAndCheckout } from '../actions'

export default async function AddAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const { plan } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agencies(name)')
    .eq('user_id', user.id)
    .maybeSingle()
  const agencyName = (membership?.agencies as { name?: string } | null)?.name ?? ''

  const [plans, { data: accounts }] = await Promise.all([
    listPlansForAgency(agencyName),
    supabase.from('accounts').select('id, name').eq('archived', false).order('name'),
  ])

  // Agency Credits plans aren't tied to a client -- skip the account picker
  // entirely and go straight to a payment confirmation.
  const creditPlan = plan ? plans.find((p) => p.id === plan && p.creditsPerCycle > 0) : undefined

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-gray-900">Add a service</h1>
        <Link
          href="/dashboard/request"
          className="text-sm text-gray-700 hover:text-gray-900 font-mono uppercase tracking-wide"
        >
          Back
        </Link>
      </div>

      <div className="mt-6 max-w-xl bg-white p-6 ring-1 ring-[#ece7d8]">
        {creditPlan ? (
          <form action={addServiceAndCheckout} className="space-y-4">
            <input type="hidden" name="priceId" value={creditPlan.id} />
            <div>
              <p className="text-sm font-medium text-gray-700">Plan</p>
              <div className="mt-2 border border-[#e7e2d3] bg-[#f6f1e4] px-3 py-2 text-sm text-gray-900">
                {creditPlan.label} — {creditPlan.creditsPerCycle} credits/cycle
              </div>
            </div>
            <button className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
              Continue to payment
            </button>
          </form>
        ) : (
          <AddServiceForm
            action={addServiceAndCheckout}
            plans={plans}
            accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
            defaultPlanId={plan}
          />
        )}
      </div>
    </div>
  )
}
