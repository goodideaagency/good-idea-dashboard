'use client'

import { useTransition } from 'react'

// Cancel / restart for the agency's own credit plan -- same shape as
// SubscriptionActions (managed services) but the server action resolves
// WHICH subscription from the caller's own agency membership, not a
// submitted id, so no subscriptionId/accountId props are needed here.
export function CreditPlanActions({
  action,
  canCancel,
  canRestart,
  periodEndLabel,
}: {
  action: (formData: FormData) => void | Promise<void>
  canCancel: boolean
  canRestart: boolean
  periodEndLabel: string | null
}) {
  const [pending, startTransition] = useTransition()

  if (!canCancel && !canRestart) return null

  function submit(intent: 'cancel' | 'restart') {
    if (
      intent === 'cancel' &&
      !window.confirm(
        'Cancel this credit plan? It stays active until the end of the current billing period, then stops granting credits. You can undo this any time before then.'
      )
    ) {
      return
    }
    const fd = new FormData()
    fd.set('intent', intent)
    startTransition(() => action(fd))
  }

  return canRestart ? (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-amber-700">
        Scheduled to cancel{periodEndLabel ? ` on ${periodEndLabel}` : ' at period end'}.
      </p>
      <button
        onClick={() => submit('restart')}
        disabled={pending}
        className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:opacity-60"
      >
        {pending ? 'Working…' : 'Keep plan'}
      </button>
    </div>
  ) : (
    <button
      onClick={() => submit('cancel')}
      disabled={pending}
      className="border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
    >
      {pending ? 'Working…' : 'Cancel plan'}
    </button>
  )
}
