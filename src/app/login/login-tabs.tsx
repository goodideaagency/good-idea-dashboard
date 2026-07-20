'use client'

import { useState } from 'react'
import { login, signup } from './actions'
import { Logo } from '@/components/logo'

const inputCls =
  'mt-1 w-full rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

export function LoginTabs({ error }: { error?: string }) {
  const [tab, setTab] = useState<'login' | 'signup'>('login')

  const tabBtn = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
    }`

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-[#ece7d8]">
      <div className="flex items-center gap-2">
        <Logo height={22} />
        <span className="rounded-full border border-[#e7e2d3] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-gray-500">
          Billing
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-500">
        Manage your accounts and subscriptions.
      </p>

      <div className="mt-5 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button type="button" onClick={() => setTab('login')} className={tabBtn(tab === 'login')}>
          Log in
        </button>
        <button type="button" onClick={() => setTab('signup')} className={tabBtn(tab === 'signup')}>
          Sign up
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {tab === 'login' ? (
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
          <button className="w-full rounded-lg bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
            Log in
          </button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" action={signup}>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="signup-agency">
              Agency name
            </label>
            <input
              id="signup-agency"
              name="agencyName"
              type="text"
              required
              placeholder="Acme Marketing"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="signup-email">
              Email
            </label>
            <input id="signup-email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="signup-password">
              Password
            </label>
            <input
              id="signup-password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className={inputCls}
            />
          </div>
          <button className="w-full rounded-lg bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
            Create account
          </button>
        </form>
      )}
    </div>
  )
}
