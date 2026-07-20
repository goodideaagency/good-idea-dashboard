import Link from 'next/link'
import { adminLogin } from './actions'

const inputCls =
  'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Good Idea · Admin</h1>
        <p className="mt-1 text-sm text-gray-500">Sign in to the admin area.</p>

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
          <button className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
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
