'use client'

import { useState } from 'react'

// A one-time link an admin needs to copy and send somewhere themselves (an
// invite, a login link) -- same green box + copyable field + button
// everywhere it shows up.
export function CopyLinkResult({
  url,
  heading,
  description,
  note,
}: {
  url: string
  heading: string
  description: React.ReactNode
  note?: string
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
    <div className="mt-6 border border-green-200 bg-green-50 p-4">
      <p className="text-sm font-semibold text-green-900">{heading}</p>
      <p className="mt-1 text-sm text-green-800">{description}</p>
      <div className="mt-3 flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 border border-green-300 bg-white px-3 py-2 font-mono text-xs text-gray-800 outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="bg-[#f7cf4a] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-green-700">{note}</p>}
    </div>
  )
}
