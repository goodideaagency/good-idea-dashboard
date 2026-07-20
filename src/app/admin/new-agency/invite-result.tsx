'use client'

import { useState } from 'react'

export function InviteResult({
  url,
  agency,
  email,
}: {
  url: string
  agency: string
  email: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard may be unavailable; the field is selectable as a fallback
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4">
      <p className="text-sm font-semibold text-green-900">Agency “{agency}” created ✓</p>
      <p className="mt-1 text-sm text-green-800">
        Send this link to <span className="font-medium">{email}</span> so they can set their
        password and log in:
      </p>
      <div className="mt-3 flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-lg border border-green-300 bg-white px-3 py-2 font-mono text-xs text-gray-800 outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded-lg bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-xs text-green-700">
        The link can be used once. If it expires, create the agency again to generate a new one
        (it will reuse the same login).
      </p>
    </div>
  )
}
