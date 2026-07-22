// A ClickUp task's own status, rendered in its own status color.
export function ClickUpStatusPill({ status, color }: { status: string; color: string }) {
  return (
    <span
      className="inline-block rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide text-white"
      style={{ backgroundColor: color }}
    >
      {status}
    </span>
  )
}
