'use client'

import { useTransition } from 'react'

// Unlike archiving, this is genuinely irreversible -- the confirm spells out
// exactly what's attached (subscriptions get unlinked, never canceled) so an
// admin can't delete a client profile that's still actively billing without
// realizing it. Same confirm + useTransition pattern as ArchiveAgencyButton.
export function DeleteAccountButton({
  accountId,
  accountName,
  activeSubscriptionSummary,
  action,
}: {
  accountId: string
  accountName: string
  // e.g. "1 active subscription (Agency Support (10 Credits), $500/mo)" --
  // omitted entirely from the message when there's nothing attached.
  activeSubscriptionSummary?: string
  action: (formData: FormData) => void | Promise<void>
}) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    const warning = activeSubscriptionSummary
      ? ` This account has ${activeSubscriptionSummary} -- it will be unlinked (not canceled) and keep billing at the agency level.`
      : ''
    if (
      !window.confirm(
        `Permanently delete "${accountName}"? This cannot be undone.${warning} Their ClickUp List will also be deleted if it still exists.`
      )
    ) {
      return
    }
    const fd = new FormData()
    fd.set('account_id', accountId)
    startTransition(() => action(fd))
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Deleting…' : 'Delete client profile'}
    </button>
  )
}
