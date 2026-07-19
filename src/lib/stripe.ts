import Stripe from 'stripe'

// Server-side Stripe client. Uses the account's default API version.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
