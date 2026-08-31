import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'

// TEMPORARY -- for the Pixan -> Pixsan agency rename data-fix (2026-08-27).
// Delete this route once that's done. Admin-gated read/write on a specific
// product's metadata and name, used because local dev only has a test-mode
// Stripe key and can't see live objects directly.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const { action, priceId, productId, metadata, name } = body as {
    action: 'read' | 'update'
    priceId?: string
    productId?: string
    metadata?: Record<string, string>
    name?: string
  }

  if (action === 'read' && priceId) {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
    return NextResponse.json({ price: { id: price.id, product: price.product } })
  }

  if (action === 'update' && productId) {
    const updated = await stripe.products.update(productId, {
      ...(metadata ? { metadata } : {}),
      ...(name ? { name } : {}),
    })
    return NextResponse.json({ updated })
  }

  return NextResponse.json({ error: 'bad request' }, { status: 400 })
}
