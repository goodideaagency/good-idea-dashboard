import Link from 'next/link'
import { redirect } from 'next/navigation'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'
import { updateProductVisibility } from './actions'

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    cents / 100
  )
}

type ProductRow = { product: Stripe.Product; prices: Stripe.Price[] }

export default async function ProductsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isAdmin(user.email))) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: agencyRows } = await admin.from('agencies').select('name').order('name')
  const agencyNames = [...new Set((agencyRows ?? []).map((a) => a.name as string))]

  // All active recurring prices, grouped by product.
  const allPrices: Stripe.Price[] = []
  let page = await stripe.prices.list({ active: true, type: 'recurring', expand: ['data.product'], limit: 100 })
  allPrices.push(...page.data)
  while (page.has_more) {
    page = await stripe.prices.list({
      active: true,
      type: 'recurring',
      expand: ['data.product'],
      limit: 100,
      starting_after: allPrices[allPrices.length - 1].id,
    })
    allPrices.push(...page.data)
  }

  const byProduct = new Map<string, ProductRow>()
  for (const p of allPrices) {
    const product = p.product as Stripe.Product
    if (!product || (product as unknown as { deleted?: boolean }).deleted) continue
    if (!byProduct.has(product.id)) byProduct.set(product.id, { product, prices: [] })
    byProduct.get(product.id)!.prices.push(p)
  }
  const products = [...byProduct.values()].sort((a, b) =>
    (a.product.name || '').localeCompare(b.product.name || '')
  )

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[#ece7d8] bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">Choose which plans appear in the billing platform</p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border border-[#e7e2d3] px-3 py-1.5 text-sm text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide"
        >
          ← Back to admin
        </Link>
      </header>

      <section className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-gray-500">
          A product only appears in an agency&apos;s &ldquo;Add account&rdquo; plan list if you show it
          here. Turn everything off to hide it completely.
        </p>

        <div className="mt-5 space-y-4">
          {products.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#e7e2d3] bg-white p-8 text-center text-sm text-gray-500">
              No active recurring products found in Stripe.
            </div>
          )}

          {products.map(({ product, prices }) => {
            const meta = product.metadata ?? {}
            const visibleAll = meta.billing_visible === 'true'
            const restricted = (meta.billing_agency ?? '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
            const restrictedLower = restricted.map((s) => s.toLowerCase())
            const state = visibleAll
              ? { text: 'Visible to all', cls: 'bg-green-100 text-green-800' }
              : restricted.length
                ? { text: `Only: ${restricted.join(', ')}`, cls: 'bg-amber-100 text-amber-800' }
                : { text: 'Hidden', cls: 'bg-gray-100 text-gray-600' }
            const priceLabel = prices
              .map((p) => `${money(p.unit_amount ?? 0, (p.currency ?? 'usd').toUpperCase())}/${p.recurring?.interval ?? 'mo'}`)
              .join(' · ')

            return (
              <form
                key={product.id}
                action={updateProductVisibility}
                className="rounded-xl bg-white p-5 ring-1 ring-[#ece7d8]"
              >
                <input type="hidden" name="product_id" value={product.id} />

                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{product.name}</p>
                    <p className="text-sm text-gray-500">{priceLabel}</p>
                  </div>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${state.cls}`}>
                    {state.text}
                  </span>
                </div>

                <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-900">
                  <input type="checkbox" name="visible" defaultChecked={visibleAll} />
                  Show to <strong>all</strong> agencies
                </label>

                {agencyNames.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Or only these agencies</p>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                      {agencyNames.map((name) => (
                        <label key={name} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            name="agency"
                            value={name}
                            defaultChecked={restrictedLower.includes(name.toLowerCase())}
                          />
                          {name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <label
                    className="block text-xs uppercase tracking-wide text-gray-400"
                    htmlFor={`onboarding-${product.id}`}
                  >
                    Redirect after purchase <span className="lowercase tracking-normal">(optional)</span>
                  </label>
                  <input
                    id={`onboarding-${product.id}`}
                    type="url"
                    name="onboarding_url"
                    defaultValue={meta.onboarding_url ?? ''}
                    placeholder="https://itsgoodidea.com/onboarding"
                    className="mt-1 w-full rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Where buyers land after paying for this plan. Leave blank to send them to their dashboard.
                  </p>
                </div>

                <button className="mt-4 rounded-lg bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
                  Save
                </button>
              </form>
            )
          })}
        </div>
      </section>
    </main>
  )
}
