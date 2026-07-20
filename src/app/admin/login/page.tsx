import Link from 'next/link'
import { adminLogin } from './actions'
import { Logo } from '@/components/logo'

const inputCls =
  'mt-1 w-full rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-[#ece7d8]">
        <div className="flex items-center gap-2">
          <Logo height={22} />
          <span className="rounded-full border border-[#e7e2d3] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-gray-500">
            Admin
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-500">Sign in to the admin area.</p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form className="mt-6 space-y-4" action={adminLogin}>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputCls}
            />
          </div>
          <button className="w-full rounded-lg bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
            Log in
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-500">
          Not an admin?{' '}
          <Link href="/login" className="text-gray-900 underline underline-offset-2">
            Agency login
          </Link>
        </p>
      </div>
    </main>
  )
}
