import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { grantTopupCredits } from '@/lib/credits'

// Stripe sends a completed credit top-up purchase back here. The webhook is
// the primary path (checkout.session.completed); grantTopupCredits is
// idempotent on the session id, so calling it again here is a safe fallback
// if that event is delayed or never delivered -- same reasoning as the
// signup flow's return page.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')
  const dest = new URL('/dashboard/credits', request.url)
  if (!sessionId) return NextResponse.redirect(dest)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const paid = session.status === 'complete' || session.payment_status === 'paid'
    if (paid) await grantTopupCredits(session)
  } catch (err) {
    console.error('topup return error:', err)
  }

  return NextResponse.redirect(dest)
}
