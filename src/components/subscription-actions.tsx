'use client'

import { useTransition } from 'react'

type Props = {
  // Server action (bound per-side: agency or admin). Reads subscription_id,
  // account_id and intent from the submitted FormData.
  action: (formData: FormData) => void | Promise<void>
  subscriptionId: string
  accountId: string
  canCancel: boolean
  canRestart: boolean
  periodEndLabel: string | null
}

export function SubscriptionActions({
  action,
  subscriptionId,
  accountId,
  canCancel,
  canRestart,
  periodEndLabel,
}: Props) {
  const [pending, startTransition] = useTransition()

  if (!canCancel && !canRestart) return null

  function submit(intent: 'cancel' | 'restart') {
    if (
      intent === 'cancel' &&
      !window.confirm(
        'Cancel this subscription? It stays active until the end of the current billing period, then stops. You can undo this any time before then.'
      )
    ) {
      return
    }
    const fd = new FormData()
    fd.set('subscription_id', subscriptionId)
    fd.set('account_id', accountId)
    fd.set('intent', intent)
    startTransition(() => action(fd))
  }

  return (
    <div className="mt-4 border-t border-[#f0ecdf] pt-4">
      {canRestart ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-amber-700">
            Scheduled to cancel{periodEndLabel ? ` on ${periodEndLabel}` : ' at period end'}.
          </p>
          <button
            onClick={() => submit('restart')}
            disabled={pending}
            className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:opacity-60"
          >
            {pending ? 'Working…' : 'Keep subscription'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => submit('cancel')}
          disabled={pending}
          className="border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {pending ? 'Working…' : 'Cancel subscription'}
        </button>
      )}
    </div>
  )
}
