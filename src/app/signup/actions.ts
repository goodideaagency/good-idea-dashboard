'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { stripe } from '@/lib/stripe'
import { listSignupPlans } from '@/lib/plans'

// Starts a signup Checkout Session -- no Supabase user or agency exists yet.
// Everything (agency, ClickUp Folder, subscription, owner login) gets
// created from the successful payment (see lib/signup.ts), not before it.
export async function startSignupCheckout(formData: FormData) {
  const priceId = String(formData.get('price_id') || '').trim()
  const agencyName = String(formData.get('agency_name') || '').trim()
  const ownerName = String(formData.get('owner_name') || '').trim()
  const ownerEmail = String(formData.get('owner_email') || '')
    .trim()
    .toLowerCase()

  const back = (q: string): never => redirect(`/signup/${priceId}?` + q)

  if (!agencyName) back('error=' + encodeURIComponent('Enter your agency name.'))
  if (!ownerName) back('error=' + encodeURIComponent('Enter your name.'))
  if (!ownerEmail || !ownerEmail.includes('@')) {
    back('error=' + encodeURIComponent('Enter a valid email.'))
  }

  // Never trust the price id from the client -- only plans we actually offer
  // at signup (and know how to route post-payment) are valid here.
  const plans = await listSignupPlans()
  const plan = plans.find((p) => p.id === priceId)
  if (!plan) redirect('/signup')

  const origin =
    (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const metadata = {
    signup: 'true',
    price_id: priceId,
    agency_name: agencyName,
    owner_name: ownerName,
    owner_email: ownerEmail,
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: ownerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata },
    metadata,
    success_url: `${origin}/signup/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/signup/${priceId}`,
    allow_promotion_codes: true,
  })

  if (session.url) redirect(session.url)
  redirect('/signup')
}
