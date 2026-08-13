import Stripe from 'stripe'

// Server-side Stripe client. Pinned to the API version this account's
// webhook events are actually delivered in (confirmed live via Stripe's
// event inspector) -- NOT left to "the account's default," which is
// actually the installed SDK's own bundled default and silently changes on
// every `npm install` (currently a full major version ahead of this pin).
// The invoice.paid credit-granting bug fixed earlier this session was
// exactly this: code written against one API version's field shapes,
// running against a different one, with zero errors. Bump this
// deliberately, together with re-checking every Stripe object field access
// in this codebase, rather than letting it drift.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // The SDK's own types only allow its bundled "latest" version here --
  // pinning to an older, deliberately-chosen version needs this cast
  // (Stripe's own documented workaround).
  apiVersion: '2025-03-31.basil' as Stripe.LatestApiVersion,
})
