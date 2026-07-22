'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'

// Archiving/unarchiving is purely a visibility flag on the agencies row —
// nothing in Stripe or Supabase auth is touched, so it's always reversible.
export async function setAgencyArchived(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const agencyId = String(formData.get('agency_id') || '').trim()
  const archived = formData.get('archived') === 'true'
  if (!agencyId) redirect('/admin')

  const admin = createAdminClient()
  await admin.from('agencies').update({ archived }).eq('id', agencyId)

  revalidatePath('/admin')
  revalidatePath('/admin/archived')
}

// One-time backfill for MRR: fills amount_cents/interval on any subscription
// row that predates those columns (migrated/legacy rows), by looking up its
// stored stripe_price_id in Stripe. New/updated subscriptions already get
// these fields from upsertSubscriptionFromStripe, so this is safe to re-run.
export async function syncSubscriptionAmounts() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('subscriptions')
    .select('id, stripe_price_id')
    .is('amount_cents', null)
    .not('stripe_price_id', 'is', null)

  const priceCache = new Map<string, { amount: number | null; interval: string | null }>()

  for (const row of rows ?? []) {
    const priceId = row.stripe_price_id as string
    if (!priceCache.has(priceId)) {
      try {
        const price = await stripe.prices.retrieve(priceId)
        priceCache.set(priceId, {
          amount: price.unit_amount,
          interval: price.recurring?.interval ?? null,
        })
      } catch {
        priceCache.set(priceId, { amount: null, interval: null })
      }
    }
    const info = priceCache.get(priceId)!
    await admin
      .from('subscriptions')
      .update({ amount_cents: info.amount, interval: info.interval })
      .eq('id', row.id)
  }

  revalidatePath('/admin')
}
