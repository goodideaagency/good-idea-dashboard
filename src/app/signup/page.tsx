import Link from 'next/link'
import { listSignupPlans } from '@/lib/plans'
import { Logo } from '@/components/logo'

export default async function SignupPlanPickerPage() {
  const plans = await listSignupPlans()
  const managed = plans.filter((p) => p.kind === 'managed')
  const credits = plans.filter((p) => p.kind === 'credits')

  return (
    <main className="min-h-screen bg-[#f9f5f1] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2">
          <Logo height={24} />
          <span className="rounded-full border border-[#e7e2d3] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-gray-500">
            Billing
          </span>
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-gray-900">Choose a plan to get started</h1>
        <p className="mt-1 text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="underline underline-offset-2">
            Log in
          </Link>
          .
        </p>

        {plans.length === 0 && (
          <div className="mt-8 border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
            <p className="text-sm text-gray-500">No plans are available for signup right now.</p>
          </div>
        )}

        {credits.length > 0 && (
          <>
            <p className="mt-8 text-xs font-mono uppercase tracking-wide text-gray-400">Agency Credits</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {credits.map((p) => (
                <Link
                  key={p.id}
                  href={`/signup/${p.id}`}
                  className="flex flex-col justify-between bg-white p-5 ring-1 ring-[#ece7d8] hover:ring-gray-900"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{p.label}</p>
                    <p className="mt-1 text-sm text-gray-500">{p.creditsPerCycle} credits/cycle</p>
                  </div>
                  <span className="mt-4 text-sm font-semibold text-gray-900">Get started →</span>
                </Link>
              ))}
            </div>
          </>
        )}

        {managed.length > 0 && (
          <>
            <p className="mt-8 text-xs font-mono uppercase tracking-wide text-gray-400">Managed Services</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {managed.map((p) => (
                <Link
                  key={p.id}
                  href={`/signup/${p.id}`}
                  className="flex flex-col justify-between bg-white p-5 ring-1 ring-[#ece7d8] hover:ring-gray-900"
                >
                  <p className="font-semibold text-gray-900">{p.label}</p>
                  <span className="mt-4 text-sm font-semibold text-gray-900">Get started →</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
