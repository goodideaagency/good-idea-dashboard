'use client'

// Root-level catch-all for anything not under /dashboard or /admin (signup,
// login, set-password, home) -- without this, an unhandled error on a new
// customer's very first interaction with the platform (signup/payment) fell
// through to Next's bare, unbranded default error screen.
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#fffcf3] px-4 text-center">
      <p className="text-lg font-semibold text-gray-900">Something went wrong.</p>
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
