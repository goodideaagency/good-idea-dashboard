import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// Every agency has exactly ONE Stripe customer, created lazily on first
// purchase (subscription or credit top-up) and reused after that.
export async function ensureAgencyStripeCustomer(
  admin: SupabaseClient,
  agency: { id: string; name: string; stripe_customer_id: string | null },
  email: string | undefined
): Promise<string> {
  if (agency.stripe_customer_id) return agency.stripe_customer_id

  const customer = await stripe.customers.create({
    name: agency.name,
    email,
    metadata: { agency_id: agency.id, agency_name: agency.name },
  })
  await admin.from('agencies').update({ stripe_customer_id: customer.id }).eq('id', agency.id)
  return customer.id
}

// Writes/updates our record of a Stripe subscription. Used both by the
// checkout return handler (initial purchase) and the webhook (ongoing changes
// like renewals, cancellations, and failed payments), so the two can never
// drift apart. Returns the product's name + onboarding URL for the caller.
export async function upsertSubscriptionFromStripe(sub: Stripe.Subscription) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item: any = sub.items.data[0]
  const price = item?.price
  const priceId: string | null = price?.id ?? null
  const productId =
    price && typeof price.product === 'string' ? price.product : price?.product?.id
  const amountCents: number | null = price?.unit_amount ?? null
  const interval: string | null = price?.recurring?.interval ?? null

  let productName: string | null = null
  let onboardingUrl: string | null = null
  if (productId) {
    const product = await stripe.products.retrieve(productId)
    productName = product.name
    onboardingUrl = product.metadata?.onboarding_url || null
  }

  // `current_period_end` is on the item in newer Stripe API versions, on the
  // subscription in older ones — read whichever is present.
  const periodEnd: number | undefined =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end

  const admin = createAdminClient()
  await admin.from('subscriptions').upsert(
    {
      stripe_subscription_id: sub.id,
      account_id: sub.metadata?.account_id ?? null,
      agency_id: sub.metadata?.agency_id ?? null,
      stripe_customer_id:
        typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripe_price_id: priceId,
      amount_cents: amountCents,
      interval,
      product_name: productName,
      status: sub.status,
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    },
    { onConflict: 'stripe_subscription_id' }
  )

  return { productName, onboardingUrl }
}

// Which of these price ids are credit-granting plans (Agency Support etc.),
// per the same `credits_per_cycle` product metadata used everywhere else
// (see addServiceAndCheckout, plans.ts) -- NOT the same thing as checking
// against the current MANAGED_SERVICES catalog, which only lists prices
// still open for new purchases and is missing several real, still-active
// legacy/discounted managed prices from migrated agencies. A subscription
// tied to an account is a real managed service unless this explicitly
// marks its price as a credits plan.
export async function getCreditsPriceIds(priceIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(priceIds)]
  const results = await Promise.all(
    unique.map(async (priceId) => {
      try {
        const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
        const product = price.product as Stripe.Product
        return Number(product?.metadata?.credits_per_cycle ?? 0) > 0 ? priceId : null
      } catch {
        return null
      }
    })
  )
  return new Set(results.filter((id): id is string => id !== null))
}

// Schedules a subscription to cancel at the end of the current billing period
// (cancelAtPeriodEnd = true), or undoes that (false). The client keeps service
// until the paid-through date either way; nothing is charged or refunded now.
// Syncs our DB immediately so the UI updates without waiting for the webhook.
export async function setSubscriptionCancelation(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean
) {
  const sub = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: cancelAtPeriodEnd,
  })
  await upsertSubscriptionFromStripe(sub)
  return sub
}
