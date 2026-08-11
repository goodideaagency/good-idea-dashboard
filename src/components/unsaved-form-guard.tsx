'use client'

import { useEffect, useRef } from 'react'

// Warns before leaving an in-progress intake form -- both a real tab
// close/refresh/external nav (beforeunload) and in-app link clicks (the App
// Router has no router-level "confirm navigation" hook, so this captures
// clicks on <a> tags directly). Disarms itself the moment the form is
// actually submitted, so finishing the form navigates away with no prompt.
// There's no draft-saving yet, so an abandoned form loses everything --
// this is the stopgap until there is.
export function UnsavedFormGuard({ formId }: { formId: string }) {
  const submittingRef = useRef(false)

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    const onSubmit = () => {
      submittingRef.current = true
    }
    form?.addEventListener('submit', onSubmit)

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (submittingRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    const onClick = (e: MouseEvent) => {
      if (submittingRef.current) return
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement)?.closest('a')
      if (!anchor?.href) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return

      const leave = window.confirm("You haven't finished this form yet. Leave without submitting?")
      if (!leave) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('click', onClick, true)

    return () => {
      form?.removeEventListener('submit', onSubmit)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [formId])

  return null
}
