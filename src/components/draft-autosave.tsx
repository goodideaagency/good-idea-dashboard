'use client'

import { useEffect, useRef, useState } from 'react'
import { autosaveDraft } from '@/app/dashboard/draft-actions'

type Status = 'idle' | 'saving' | 'saved'

// Autosaves a long intake form a couple seconds after the user stops
// typing/checking a box -- protects against exactly the kind of
// interruption a manual "Save Draft" button can't (closing the tab,
// stepping away, a session dying) without needing them to remember
// anything. See lib/form-drafts.ts for where this lands and
// app/dashboard/onboarding/[priceId]/page.tsx (or request/[key]/page.tsx)
// for how a saved draft gets restored on the next visit.
export function DraftAutosave({
  formId,
  kind,
  context,
}: {
  formId: string
  kind: 'managed_service_intake' | 'service_request'
  context: Record<string, unknown>
}) {
  const [status, setStatus] = useState<Status>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contextJson = JSON.stringify(context)

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return

    function scheduleSave() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(async () => {
        if (!form) return
        const snapshot = new FormData(form)
        // Files aren't worth autosaving -- see formDataToPlainObject, which
        // already drops them; stripping here too keeps the request small.
        for (const [key, value] of Array.from(snapshot.entries())) {
          if (value instanceof File) snapshot.delete(key)
        }
        snapshot.set('__draft_kind', kind)
        snapshot.set('__draft_context', contextJson)
        setStatus('saving')
        try {
          await autosaveDraft(snapshot)
          setStatus('saved')
        } catch {
          setStatus('idle')
        }
      }, 2000)
    }

    form.addEventListener('input', scheduleSave)
    form.addEventListener('change', scheduleSave)
    return () => {
      form.removeEventListener('input', scheduleSave)
      form.removeEventListener('change', scheduleSave)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [formId, kind, contextJson])

  if (status === 'idle') return null
  return (
    <p className="text-xs text-gray-400" aria-live="polite">
      {status === 'saving' ? 'Saving draft…' : 'Draft saved'}
    </p>
  )
}
