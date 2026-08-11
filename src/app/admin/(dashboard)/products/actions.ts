'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'

// Saves a product's visibility by writing the same metadata the plan picker
// reads: billing_visible ("true" = everyone) and billing_agency (comma list of
// agency names). Clearing both hides the product from the platform entirely.
export async function updateProductVisibility(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const productId = String(formData.get('product_id') || '')
  if (!productId) redirect('/admin/products')

  const visibleAll = formData.get('visible') === 'on'
  const agencies = formData
    .getAll('agency')
    .map((v) => String(v).trim())
    .filter(Boolean)
  const onboardingUrl = String(formData.get('onboarding_url') || '').trim()
  const creditsPerCycle = String(formData.get('credits_per_cycle') || '').trim()

  await stripe.products.update(productId, {
    metadata: {
      // Empty string tells Stripe to delete the key (→ hidden / no redirect).
      billing_visible: visibleAll ? 'true' : '',
      billing_agency: agencies.length ? agencies.join(', ') : '',
      // Where buyers land after purchasing this product (read by the checkout
      // return handler). Blank clears it → they fall back to the dashboard.
      onboarding_url: onboardingUrl,
      // How many agency credits this subscription grants on signup and on
      // every successful renewal payment (see the Stripe webhook). Blank/0 =
      // not a credit-granting plan.
      credits_per_cycle: creditsPerCycle,
    },
  })

  revalidatePath('/admin/products')
  redirect('/admin/products?saved=' + encodeURIComponent(productId))
}

// Tags a one-time (non-recurring) product as a credit top-up: purchasing it
// grants credit_amount credits immediately. These aren't gated per-agency
// like the recurring plans above -- any agency with an active credit-
// granting subscription can buy any enabled top-up (see /dashboard/credits).
export async function updateTopupCredits(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const productId = String(formData.get('product_id') || '')
  if (!productId) redirect('/admin/products')

  const creditAmount = String(formData.get('credit_amount') || '').trim()

  await stripe.products.update(productId, {
    metadata: { credit_amount: creditAmount },
  })

  revalidatePath('/admin/products')
  redirect('/admin/products?saved=' + encodeURIComponent(productId))
}
