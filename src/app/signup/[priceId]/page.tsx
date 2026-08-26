import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listSignupPlans } from '@/lib/plans'
import { Logo } from '@/components/logo'
import { startSignupCheckout } from '../actions'

const inputCls =
  'mt-1 w-full border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

export default async function SignupInfoPage({
  params,
  searchParams,
}: {
  params: Promise<{ priceId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { priceId } = await params
  const { error } = await searchParams

  const plans = await listSignupPlans()
  const plan = plans.find((p) => p.id === priceId)
  if (!plan) redirect('/signup')

  return (
    <main className="min-h-screen bg-[#f9f5f1] px-4 py-10">
      <div className="mx-auto max-w-md">
        <Logo height={24} />

        <div className="mt-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Create your agency</h1>
          <Link
            href="/signup"
            className="text-xs text-gray-700 hover:text-gray-900 font-mono uppercase tracking-wide"
          >
            Change plan
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-500">{plan.label}</p>

        <div className="mt-6 bg-white p-6 ring-1 ring-[#ece7d8]">
          {error && <p className="mb-4 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <form action={startSignupCheckout} className="space-y-4">
            <input type="hidden" name="price_id" value={priceId} />
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="agency_name">
                Agency name
              </label>
              <input
                id="agency_name"
                name="agency_name"
                type="text"
                required
                placeholder="Acme Marketing"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="owner_name">
                Your name
              </label>
              <input
                id="owner_name"
                name="owner_name"
                type="text"
                required
                placeholder="Jane Smith"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="owner_email">
                Your email
              </label>
              <input
                id="owner_email"
                name="owner_email"
                type="email"
                required
                placeholder="jane@acmemarketing.com"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-400">You&apos;ll set a password after payment.</p>
            </div>

            <button className="w-full bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
              Continue to payment
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
