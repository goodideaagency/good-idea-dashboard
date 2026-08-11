'use server'

import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'
import { IMPERSONATION_COOKIE } from '@/lib/impersonation'

// Logs the calling admin into a real session as the target agency user --
// full read/write access, exactly what that user would see. Works by
// minting a Supabase magic-link token server-side (never emailed) and
// following it via /auth/confirm, so every existing RLS/auth check in the
// app keeps working unmodified -- there's no special-cased "impersonating"
// branch anywhere except the return trip.
export async function impersonateUser(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user: adminUser },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(adminUser?.email))) redirect('/dashboard')

  const targetUserId = String(formData.get('user_id') || '').trim()
  if (!targetUserId) redirect('/admin')

  const admin = createAdminClient()
  const { data: targetUser } = await admin.auth.admin.getUserById(targetUserId)
  const targetEmail = targetUser.user?.email
  if (!targetEmail) redirect('/admin')

  // A random, unguessable token is the ONLY thing the cookie carries -- the
  // admin's actual email lives server-side, keyed by this token, so a
  // tampered cookie value can't be used to impersonate an arbitrary admin
  // on the way back (see returnToAdmin in dashboard/actions.ts).
  const token = randomUUID()
  await admin.from('admin_impersonation_sessions').insert({
    token,
    admin_email: adminUser!.email,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })

  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  })

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
  })
  if (error || !link) redirect('/admin')

  redirect(
    `/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent('/dashboard')}`
  )
}

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

// One-time backfill: writes agency/account id + name metadata onto every
// existing Stripe subscription (and its customer), matching what new
// checkouts already set (see dashboard/actions.ts). Only touches the
// `metadata` field -- Stripe explicitly does not treat that as a billing
// change, so this never affects proration, invoicing, or subscription
// status. Safe to re-run any time (e.g. after renaming an agency/account).
export async function backfillSubscriptionMetadata() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, account_id, agency_id, accounts(name), agencies(name)')
    .not('stripe_subscription_id', 'is', null)

  const customersDone = new Set<string>()
  let updated = 0
  let failed = 0

  for (const s of subs ?? []) {
    const subId = s.stripe_subscription_id as string
    const accountName = (s.accounts as { name?: string } | null)?.name
    const agencyName = (s.agencies as { name?: string } | null)?.name
    if (!accountName || !agencyName || !s.account_id || !s.agency_id) {
      failed++
      continue
    }
    const metadata = {
      account_id: s.account_id,
      account_name: accountName,
      agency_id: s.agency_id,
      agency_name: agencyName,
    }
    try {
      const subscription = await stripe.subscriptions.update(subId, { metadata })
      updated++

      // Also tag the customer once per unique customer id.
      const customerId =
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
      if (!customersDone.has(customerId)) {
        customersDone.add(customerId)
        await stripe.customers.update(customerId, {
          metadata: { agency_id: s.agency_id, agency_name: agencyName },
        })
      }
    } catch {
      failed++
    }
  }

  revalidatePath('/admin')
  redirect(`/admin?backfilled=${updated}&backfillFailed=${failed}`)
}
