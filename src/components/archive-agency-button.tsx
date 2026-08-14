'use client'

import { useTransition } from 'react'

// A destructive-looking action deserves a confirm, even though archiving
// itself is harmless (a visibility flag only -- nothing in Stripe or auth is
// touched, and it can be undone from /admin/archived). Same confirm +
// useTransition pattern as SubscriptionActions/CreditPlanActions.
export function ArchiveAgencyButton({
  agencyId,
  agencyName,
  action,
}: {
  agencyId: string
  agencyName: string
  action: (formData: FormData) => void | Promise<void>
}) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (
      !window.confirm(
        `Archive ${agencyName}? They'll be hidden from the main agencies list until you unarchive them from /admin/archived. Nothing in Stripe or their login access is touched.`
      )
    ) {
      return
    }
    const fd = new FormData()
    fd.set('agency_id', agencyId)
    fd.set('archived', 'true')
    startTransition(() => action(fd))
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Archiving…' : 'Archive agency'}
    </button>
  )
}
