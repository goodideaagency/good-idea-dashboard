'use client'

import { useFormStatus } from 'react-dom'

// A plain <button> inside a form action gave no feedback between click and
// the page actually changing -- every one of these triggers a real
// ClickUp/Stripe round trip, so that gap was long enough to look broken and
// invite a second click (see the double-submit guards elsewhere in this
// codebase). useFormStatus picks up this button's own enclosing <form>
// automatically, no wiring needed at the call site.
export function SubmitButton({
  children,
  pendingText = 'Loading…',
  className,
  disabled,
}: {
  children: React.ReactNode
  pendingText?: string
  className?: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={disabled || pending} className={className}>
      {pending ? pendingText : children}
    </button>
  )
}
