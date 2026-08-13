'use client'

// Catches any error thrown while rendering a page under /admin -- same
// reasoning as dashboard/error.tsx, scoped to the admin team's own tools.
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-lg font-semibold text-gray-900">Something went wrong loading this page.</p>
      <p className="max-w-sm text-sm text-gray-500">
        This is usually temporary. Give it another try in a moment.
      </p>
      <button
        onClick={() => reset()}
        className="mt-2 bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
      >
        Try again
      </button>
    </div>
  )
}
