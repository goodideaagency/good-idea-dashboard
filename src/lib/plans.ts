import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'

export type PlanOption = { id: string; label: string; amount: number }

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
          amount,
          label: `${product.name} — ${money(amount)}/${interval}`,
        }
      })
      .sort((a, b) => a.amount - b.amount)
  } catch {
    return []
  }
}
