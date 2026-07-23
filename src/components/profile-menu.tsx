'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export function ProfileMenu({
  agencyName,
  userEmail,
  signout,
}: {
  agencyName: string
  userEmail: string
  signout: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const initial = agencyName.trim().charAt(0).toUpperCase() || '?'

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full border border-[#ece7d8] bg-white shadow-sm">
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-gray-700 hover:bg-[#f6f1e4]"
          >
            Account details
          </Link>
          <Link
            href="/dashboard/accounts"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-gray-700 hover:bg-[#f6f1e4]"
          >
            Billing
          </Link>
          <form action={signout}>
            <button className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-[#f6f1e4]">
              Sign out
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-2 py-1 -mx-2 hover:bg-[#f6f1e4]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#f7cf4a] text-sm font-semibold text-black">
          {initial}
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-gray-900">{agencyName}</p>
          <p className="truncate text-xs text-gray-500">{userEmail}</p>
        </div>
      </button>
    </div>
  )
}
