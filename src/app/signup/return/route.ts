import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { provisionSignupAgency } from '@/lib/signup'
import { createAdminClient } from '@/lib/supabase/admin'

// Stripe sends a new signup back here after payment. The webhook is the
// primary path for turning the checkout into a real agency (provisionSignupAgency
// is idempotent, so calling it again here is a safe fallback if that event is
// delayed or never delivered -- same reasoning as the credits system). Either
// way, this always mints a FRESH magic-link sign-in for the owner (rather than
// reusing whatever link provisioning generated, which may already be
// consumed or stale) and logs them straight in.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')
  const failUrl = new URL('/signup?error=' + encodeURIComponent('Something went wrong. Please try again.'), request.url)
  if (!sessionId) return NextResponse.redirect(failUrl)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const paid = session.status === 'complete' || session.payment_status === 'paid'
    if (!paid) return NextResponse.redirect(failUrl)

    const result = await provisionSignupAgency(session)
    if (!result) return NextResponse.redirect(failUrl)

    const ownerEmail = session.metadata?.owner_email
    if (!ownerEmail) return NextResponse.redirect(failUrl)

    const admin = createAdminClient()
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: ownerEmail,
    })
    if (error || !link) return NextResponse.redirect(failUrl)

    const finalDestination =
      result.kind === 'managed'
        ? `/dashboard/onboarding/new-client?price_id=${encodeURIComponent(result.priceId)}`
        : '/dashboard'

    // A brand-new signup never sets a password (they only ever used Stripe
    // Checkout + this magic link), which would leave them unable to log
    // back in later via the normal email+password form. Route through
    // set-password first, same as the admin-invite flow already does, then
    // continue on to wherever they were originally headed.
    const next = `/set-password?next=${encodeURIComponent(finalDestination)}`

    const confirmUrl = new URL('/auth/confirm', request.url)
    confirmUrl.searchParams.set('token_hash', link.properties.hashed_token)
    confirmUrl.searchParams.set('type', 'magiclink')
    confirmUrl.searchParams.set('next', next)
    return NextResponse.redirect(confirmUrl)
  } catch (err) {
    console.error('signup return error:', err)
    return NextResponse.redirect(failUrl)
  }
}
