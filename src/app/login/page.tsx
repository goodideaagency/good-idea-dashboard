import { login, signup } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Good Idea Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Log in to manage your accounts and subscriptions.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <form className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="agencyName">
              Agency name{' '}
              <span className="font-normal text-gray-400">(new accounts only)</span>
            </label>
            <input
              id="agencyName"
              name="agencyName"
              type="text"
              placeholder="Acme Marketing"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
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
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              formAction={login}
              className="flex-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Log in
            </button>
            <button
              formAction={signup}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Create account
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
