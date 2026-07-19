import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

// Stripe sends the customer back here after a successful checkout. We verify
// the session with Stripe (source of truth), record the subscription in our
// database, then forward the buyer to the product's onboarding page (set on
// the Stripe product as metadata `onboarding_url`). If no onboarding URL is
// set, or anything goes wrong, we fall back to the dashboard — the buyer is
// never left on a blank page.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')
  const dashboardUrl = new URL('/dashboard', request.url)
  let destination = dashboardUrl.toString()

  try {
    if (!sessionId) return NextResponse.redirect(dashboardUrl)

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'subscription.items.data.price'],
    })

    const sub = session.subscription
    const paid = session.status === 'complete' || session.payment_status === 'paid'

    if (paid && sub && typeof sub !== 'string') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item: any = sub.items.data[0]
      const price = item?.price

      let productName: string | null = null
      let onboardingUrl: string | null = null
      const productId =
        price && typeof price.product === 'string' ? price.product : price?.product?.id
      if (productId) {
        const product = await stripe.products.retrieve(productId)
        productName = product.name
        onboardingUrl = product.metadata?.onboarding_url || null
      }

      const periodEnd: number | undefined =
        item?.current_period_end ??
        (sub as unknown as { current_period_end?: number }).current_period_end

      const admin = createAdminClient()
      await admin.from('subscriptions').upsert(
        {
          stripe_subscription_id: sub.id,
          account_id: session.metadata?.account_id ?? null,
          agency_id: session.metadata?.agency_id ?? null,
          stripe_customer_id:
            typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
          stripe_price_id: price?.id ?? null,
          product_name: productName,
          status: sub.status,
          current_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
        },
        { onConflict: 'stripe_subscription_id' }
      )

      // Forward to the product's onboarding page, if one is configured.
      if (onboardingUrl) {
        try {
          const url = new URL(onboardingUrl)
          // Pass the checkout session id along so the onboarding page can tie
          // the form back to this purchase (safe to ignore if unused).
          url.searchParams.set('session_id', session.id)
          destination = url.toString()
        } catch {
          // Bad/blank URL in metadata — just use the dashboard.
          destination = dashboardUrl.toString()
        }
      }
    }
  } catch (err) {
    console.error('checkout return error:', err)
  }

  return NextResponse.redirect(destination)
}
