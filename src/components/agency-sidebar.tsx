'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from './logo'
import { ProfileMenu } from './profile-menu'

function navCls(active: boolean) {
  return `block px-3 py-2 text-sm font-medium ${
    active ? 'bg-[#ece7d8] text-gray-900' : 'text-gray-700 hover:bg-[#f6f1e4]'
  }`
}

export function AgencySidebar({
  agencyName,
  userEmail,
  signout,
  unreadCount,
  creditBalance,
}: {
  agencyName: string
  userEmail: string
  signout: () => void | Promise<void>
  unreadCount: number
  creditBalance?: number
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Close the drawer whenever navigation happens (mobile only -- desktop
  // never opens it in the first place).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const nav = (
    <nav className="mt-6 space-y-1">
      <Link href="/dashboard/projects" className={navCls(pathname.startsWith('/dashboard/projects'))}>
        Projects
      </Link>
      <Link
        href="/dashboard/notifications"
        className={`flex items-center justify-between ${navCls(
          pathname.startsWith('/dashboard/notifications')
        )}`}
      >
        Notifications
        {unreadCount > 0 && <span className="text-sm font-bold">{unreadCount}</span>}
      </Link>
      <Link href="/dashboard/request" className={navCls(pathname.startsWith('/dashboard/request'))}>
        Services
      </Link>
      <Link
        href="/dashboard/credits"
        className={`flex items-center justify-between ${navCls(pathname.startsWith('/dashboard/credits'))}`}
      >
        Credits
        <span className="text-sm font-bold">{creditBalance ?? 0}</span>
      </Link>
      <Link href="/dashboard/clients" className={navCls(pathname.startsWith('/dashboard/clients'))}>
        My Clients
      </Link>
    </nav>
  )

  return (
    <>
      {/* Mobile top bar -- stays in normal document flow, so it pushes page
          content down; the sidebar itself is fixed/off-canvas below lg. */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#ece7d8] bg-[#f9f5f1] px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center text-gray-700"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
        <Logo height={24} />
        <div className="w-9" />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-[#ece7d8] bg-[#f9f5f1] px-4 py-6 transition-transform duration-200 ease-in-out lg:sticky lg:top-0 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <Link href="/dashboard">
            <Logo height={28} />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center text-gray-500 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <Link
          href="/dashboard/request"
          className="mt-8 bg-[#f7cf4a] px-3 py-2.5 text-center text-sm font-semibold text-black hover:brightness-95 font-mono uppercase tracking-wide"
        >
          + Add new service
        </Link>

        {nav}

        <div className="mt-auto border-t border-[#ece7d8] pt-4">
          <ProfileMenu agencyName={agencyName} userEmail={userEmail} signout={signout} />
        </div>
      </aside>
    </>
  )
}
