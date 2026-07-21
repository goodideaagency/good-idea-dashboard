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

  await stripe.products.update(productId, {
    metadata: {
      // Empty string tells Stripe to delete the key (→ hidden).
      billing_visible: visibleAll ? 'true' : '',
      billing_agency: agencies.length ? agencies.join(', ') : '',
    },
  })

  revalidatePath('/admin/products')
  redirect('/admin/products?saved=' + encodeURIComponent(productId))
}
