'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { discardDraft } from '@/app/dashboard/draft-actions'

// Shown above a form when getFormDraft (lib/form-drafts.ts) found a
// previously autosaved draft -- lets someone confirm their progress was
// restored, or bail out and start clean.
export function DraftRestoredBanner({
  kind,
  context,
  updatedAt,
}: {
  kind: 'managed_service_intake' | 'service_request'
  context: Record<string, unknown>
  updatedAt: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  function handleDiscard() {
    const formData = new FormData()
    formData.set('kind', kind)
    formData.set('context', JSON.stringify(context))
    startTransition(async () => {
      await discardDraft(formData)
      setDismissed(true)
      router.refresh()
    })
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 bg-[#f6f1e4] px-3 py-2 text-sm text-gray-700">
      <span>We restored your progress from {new Date(updatedAt).toLocaleString()}.</span>
      <button
        type="button"
        onClick={handleDiscard}
        disabled={pending}
        className="shrink-0 whitespace-nowrap font-mono text-xs uppercase tracking-wide text-gray-500 underline underline-offset-2 hover:text-gray-800 disabled:opacity-50"
      >
        {pending ? 'Discarding…' : 'Discard and start over'}
      </button>
    </div>
  )
}
