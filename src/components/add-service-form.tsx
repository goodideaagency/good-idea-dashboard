'use client'

import { useState } from 'react'

type Plan = { id: string; label: string }
type Acct = { id: string; name: string }

function pill(active: boolean) {
  return `rounded-lg px-3 py-1.5 text-sm font-mono uppercase tracking-wide ${
    active
      ? 'bg-gray-900 text-white'
      : 'border border-[#e7e2d3] text-gray-700 hover:bg-[#f6f1e4]'
  }`
}

const inputCls =
  'mt-1 w-full rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900'

function NewClientFields() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="name">
          Business name
        </label>
        <input id="name" name="name" type="text" required placeholder="Joe's Plumbing" className={inputCls} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="website">
          Website <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input id="website" name="website" type="text" placeholder="joesplumbing.com" className={inputCls} />
      </div>
    </div>
  )
}

// Adds a service. On the dashboard the user picks an existing client or creates
// a new one; on an account page the account is fixed (fixedAccountId) so only a
// plan is chosen. Submits to a checkout server action passed by the parent.
export function AddServiceForm({
  action,
  plans,
  accounts,
  fixedAccountId,
}: {
  action: (formData: FormData) => void | Promise<void>
  plans: Plan[]
  accounts: Acct[]
  fixedAccountId?: string
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(
    accounts.length > 0 ? 'existing' : 'new'
  )

  if (plans.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No plans available for your account yet. Contact Good Idea to get set up.
      </p>
    )
  }

  const showToggle = !fixedAccountId && accounts.length > 0
  const showExisting = !fixedAccountId && accounts.length > 0 && mode === 'existing'
  const showNew = !fixedAccountId && !showExisting

  return (
    <form action={action} className="space-y-4">
      {fixedAccountId && <input type="hidden" name="account_id" value={fixedAccountId} />}

      {showToggle && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode('existing')} className={pill(mode === 'existing')}>
            Existing client
          </button>
          <button type="button" onClick={() => setMode('new')} className={pill(mode === 'new')}>
            New client
          </button>
        </div>
      )}

      {showExisting && (
        <div>
          <label className="block text-sm font-medium text-gray-700" htmlFor="account_id">
            Client
          </label>
          <select
            id="account_id"
            name="account_id"
            required
            defaultValue={accounts[0].id}
            className={inputCls}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {showNew && <NewClientFields />}

      <div>
        <p className="text-sm font-medium text-gray-700">Choose a plan</p>
        <div className="mt-2 space-y-2">
          {plans.map((plan, i) => (
            <label
              key={plan.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#e7e2d3] px-3 py-2 text-sm has-[:checked]:border-gray-900 has-[:checked]:bg-gray-50"
            >
              <input type="radio" name="priceId" value={plan.id} defaultChecked={i === 0} required />
              <span className="text-gray-900">{plan.label}</span>
            </label>
          ))}
        </div>
      </div>

      <button className="rounded-lg bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95">
        Add &amp; continue to payment
      </button>
    </form>
  )
}
