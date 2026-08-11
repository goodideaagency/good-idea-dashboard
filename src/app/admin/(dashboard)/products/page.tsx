import { redirect } from 'next/navigation'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'
import { updateProductVisibility, updateTopupCredits } from './actions'

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    cents / 100
  )
}

// Stripe's live and test dashboards are different URLs -- detect which mode
// the configured key is in so the link actually lands on the right one.
const isTestMode = (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_')
function stripeProductUrl(productId: string) {
  return `https://dashboard.stripe.com/${isTestMode ? 'test/' : ''}products/${productId}`
}

type ProductRow = { product: Stripe.Product; prices: Stripe.Price[] }

function ProductCard({
  product,
  prices,
  agencyNames,
}: {
  product: Stripe.Product
  prices: Stripe.Price[]
  agencyNames: string[]
}) {
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
    <form action={updateProductVisibility} className="bg-white p-5 ring-1 ring-[#ece7d8]">
      <input type="hidden" name="product_id" value={product.id} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{product.name}</p>
          <p className="text-sm text-gray-500">{priceLabel}</p>
          <a
            href={stripeProductUrl(product.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-mono text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
          >
            {product.id}
          </a>
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
          className="mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
        />
        <p className="mt-1 text-xs text-gray-400">
          Where buyers land after paying for this plan. Leave blank to send them to their dashboard.
        </p>
      </div>

      <div className="mt-4">
        <label
          className="block text-xs uppercase tracking-wide text-gray-400"
          htmlFor={`credits-${product.id}`}
        >
          Credits per cycle <span className="lowercase tracking-normal">(optional)</span>
        </label>
        <input
          id={`credits-${product.id}`}
          type="number"
          min={0}
          name="credits_per_cycle"
          defaultValue={meta.credits_per_cycle ?? ''}
          placeholder="e.g. 10"
          className="mt-1 w-32 border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
        />
        <p className="mt-1 text-xs text-gray-400">
          Agency credits granted on signup and every successful renewal. Leave blank if this plan
          doesn&apos;t grant credits.
        </p>
      </div>

      <button className="mt-4 bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
        Save
      </button>
    </form>
  )
}

function TopupCard({ product, prices }: { product: Stripe.Product; prices: Stripe.Price[] }) {
  const meta = product.metadata ?? {}
  const priceLabel = prices
    .map((p) => money(p.unit_amount ?? 0, (p.currency ?? 'usd').toUpperCase()))
    .join(' · ')

  return (
    <form action={updateTopupCredits} className="bg-white p-5 ring-1 ring-[#ece7d8]">
      <input type="hidden" name="product_id" value={product.id} />

      <p className="font-semibold text-gray-900">{product.name}</p>
      <p className="text-sm text-gray-500">{priceLabel}</p>
      <a
        href={stripeProductUrl(product.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block font-mono text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
      >
        {product.id}
      </a>

      <div className="mt-4">
        <label
          className="block text-xs uppercase tracking-wide text-gray-400"
          htmlFor={`topup-${product.id}`}
        >
          Credits granted
        </label>
        <input
          id={`topup-${product.id}`}
          type="number"
          min={0}
          name="credit_amount"
          defaultValue={meta.credit_amount ?? ''}
          placeholder="e.g. 5"
          className="mt-1 w-32 border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
        />
        <p className="mt-1 text-xs text-gray-400">
          Blank or 0 hides this from the credit top-up list.
        </p>
      </div>

      <button className="mt-4 bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
        Save
      </button>
    </form>
  )
}

export default async function ProductsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')
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

  // One-time (non-recurring) prices -- credit top-ups live here, not in the
  // recurring plan list above.
  const oneTimePrices: Stripe.Price[] = []
  let onceP = await stripe.prices.list({ active: true, type: 'one_time', expand: ['data.product'], limit: 100 })
  oneTimePrices.push(...onceP.data)
  while (onceP.has_more) {
    onceP = await stripe.prices.list({
      active: true,
      type: 'one_time',
      expand: ['data.product'],
      limit: 100,
      starting_after: oneTimePrices[oneTimePrices.length - 1].id,
    })
    oneTimePrices.push(...onceP.data)
  }
  const byTopupProduct = new Map<string, ProductRow>()
  for (const p of oneTimePrices) {
    const product = p.product as Stripe.Product
    if (!product || (product as unknown as { deleted?: boolean }).deleted) continue
    if (!byTopupProduct.has(product.id)) byTopupProduct.set(product.id, { product, prices: [] })
    byTopupProduct.get(product.id)!.prices.push(p)
  }
  const topupProducts = [...byTopupProduct.values()].sort(
    (a, b) => (a.prices[0]?.unit_amount ?? 0) - (b.prices[0]?.unit_amount ?? 0)
  )

  // Active = shown to at least someone (all agencies, or a restricted list).
  // Inactive = neither billing_visible nor billing_agency set, so it's
  // hidden from every agency's plan picker.
  const activeProducts = products.filter(({ product }) => {
    const meta = product.metadata ?? {}
    return meta.billing_visible === 'true' || Boolean((meta.billing_agency ?? '').trim())
  })
  const inactiveProducts = products.filter((p) => !activeProducts.includes(p))

  return (
    <div>
      <h1 className="text-3xl font-semibold text-gray-900">Products</h1>
      <p className="mt-1 text-sm text-gray-500">Choose which plans appear in the billing platform</p>

      <div className="mt-6">
        <p className="text-sm text-gray-500">
          A product only appears in an agency&apos;s &ldquo;Add account&rdquo; plan list if you show it
          here. Turn everything off to hide it completely.
        </p>

        {products.length === 0 && (
          <div className="mt-5 border border-dashed border-[#e7e2d3] bg-white p-8 text-center text-sm text-gray-500">
            No active recurring products found in Stripe.
          </div>
        )}

        {activeProducts.length > 0 && (
          <>
            <p className="mt-8 text-xs font-mono uppercase tracking-wide text-gray-400">Active</p>
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {activeProducts.map(({ product, prices }) => (
                <ProductCard key={product.id} product={product} prices={prices} agencyNames={agencyNames} />
              ))}
            </div>
          </>
        )}

        {inactiveProducts.length > 0 && (
          <>
            <p className="mt-8 text-xs font-mono uppercase tracking-wide text-gray-400">Inactive</p>
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {inactiveProducts.map(({ product, prices }) => (
                <ProductCard key={product.id} product={product} prices={prices} agencyNames={agencyNames} />
              ))}
            </div>
          </>
        )}

        {topupProducts.length > 0 && (
          <>
            <p className="mt-8 text-xs font-mono uppercase tracking-wide text-gray-400">
              Credit Top-Ups (one-time)
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Shown to any agency with an active credit-granting subscription, regardless of the
              visibility settings above.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {topupProducts.map(({ product, prices }) => (
                <TopupCard key={product.id} product={product} prices={prices} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
