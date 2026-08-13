import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { getManagedServiceByPriceId } from '@/lib/service-catalog'

export type PlanOption = {
  id: string
  name: string
  interval: string
  label: string
  amount: number
  creditsPerCycle: number
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US')}`
}

// The plans an agency may add, opt-in via Stripe product metadata:
//   billing_visible = "true"        -> shown to every agency
//   billing_agency  = "Agency Name" -> shown only to that agency (comma list)
// Untagged products never appear. Returns [] if Stripe can't be reached.
export async function listPlansForAgency(agencyName: string): Promise<PlanOption[]> {
  const agencyKey = agencyName.trim().toLowerCase()
  try {
    const prices = await stripe.prices.list({
      active: true,
      type: 'recurring',
      expand: ['data.product'],
      limit: 100,
    })
    return prices.data
      .filter((p) => {
        const meta = (p.product as Stripe.Product)?.metadata ?? {}
        if (meta.billing_visible === 'true') return true
        const restricted = (meta.billing_agency ?? '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
        return restricted.includes(agencyKey)
      })
      .map((p) => {
        const product = p.product as Stripe.Product
        const amount = p.unit_amount ?? 0
        const interval = p.recurring?.interval ?? 'month'
        return {
          id: p.id,
          name: product.name,
          interval,
          amount,
          label: `${product.name} — ${money(amount)}/${interval}`,
          creditsPerCycle: Number(product.metadata?.credits_per_cycle ?? 0),
        }
      })
      .sort((a, b) => a.amount - b.amount)
  } catch {
    return []
  }
}

export type SignupPlan = PlanOption & { kind: 'managed' | 'credits' }

// Plans a brand-new visitor (no agency yet) can sign up with -- globally
// visible only (agency-specific discounted prices never make sense before an
// agency exists), and restricted to plans we know how to route post-payment:
// a cataloged managed service (-> the existing onboarding intake) or a
// credit-granting plan (-> straight to the dashboard). An arbitrary
// billing_visible product that's neither would have nowhere to send the new
// user after they pay, so it's left off this list (still purchasable later
// as an add-on from the dashboard).
export async function listSignupPlans(): Promise<SignupPlan[]> {
  try {
    const prices = await stripe.prices.list({
      active: true,
      type: 'recurring',
      expand: ['data.product'],
      limit: 100,
    })
    return prices.data
      .filter((p) => (p.product as Stripe.Product)?.metadata?.billing_visible === 'true')
      .map((p) => {
        const product = p.product as Stripe.Product
        const amount = p.unit_amount ?? 0
        const interval: string = p.recurring?.interval ?? 'month'
        const creditsPerCycle = Number(product.metadata?.credits_per_cycle ?? 0)
        const kind: SignupPlan['kind'] | null =
          creditsPerCycle > 0 ? 'credits' : getManagedServiceByPriceId(p.id) ? 'managed' : null
        if (!kind) return null
        return {
          id: p.id,
          name: product.name,
          interval,
          amount,
          label: `${product.name} — ${money(amount)}/${interval}`,
          creditsPerCycle,
          kind,
        }
      })
      .filter((p): p is SignupPlan => p !== null)
      .sort((a, b) => a.amount - b.amount)
  } catch {
    return []
  }
}
