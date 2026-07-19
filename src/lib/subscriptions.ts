import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

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
