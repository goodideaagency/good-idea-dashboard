import Link from 'next/link'
import { login } from './actions'
import { Logo } from '@/components/logo'
import { SubmitButton } from '@/components/submit-button'

const inputCls =
  'mt-1 w-full rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

// "Sign up" now lives at /signup -- a plan comes first, payment happens
// before any account exists, and details are collected along the way. This
// page is just login for an agency that already exists.
export function LoginTabs({ error }: { error?: string }) {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-[#ece7d8]">
      <Logo height={22} />
      <p className="mt-2 text-sm text-gray-500">Manage your accounts and subscriptions.</p>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form className="mt-6 space-y-4" action={login}>
        <div>
          <label className="block text-sm font-medium text-gray-700" htmlFor="login-email">
            Email
          </label>
          <input id="login-email" name="email" type="email" required autoComplete="email" className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputCls}
          />
        </div>
        <SubmitButton
          pendingText="Logging in…"
          className="w-full rounded-lg bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Log in
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        New here?{' '}
        <Link href="/signup" className="font-medium text-gray-900 underline underline-offset-2">
          Choose a plan to get started
        </Link>
      </p>
    </div>
  )
}
