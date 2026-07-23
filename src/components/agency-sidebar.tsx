'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
}: {
  agencyName: string
  userEmail: string
  signout: () => void | Promise<void>
  unreadCount: number
}) {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-[#ece7d8] bg-[#f9f5f1] px-4 py-6">
      <Link href="/dashboard" className="px-2">
        <Logo height={28} />
      </Link>

      <Link
        href="/dashboard/request"
        className="mt-8 bg-[#f7cf4a] px-3 py-2.5 text-center text-sm font-semibold text-black hover:brightness-95 font-mono uppercase tracking-wide"
      >
        + Add new service
      </Link>

      <nav className="mt-6 space-y-1">
        <Link href="/dashboard" className={navCls(pathname === '/dashboard')}>
          Dashboard
        </Link>
        <Link
          href="/dashboard/notifications"
          className={`flex items-center justify-between ${navCls(
            pathname.startsWith('/dashboard/notifications')
          )}`}
        >
          Notifications
          {unreadCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center bg-red-600 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
        <Link
          href="/dashboard/projects"
          className={navCls(pathname.startsWith('/dashboard/projects'))}
        >
          Projects
        </Link>
        <Link
          href="/dashboard/clients"
          className={navCls(pathname.startsWith('/dashboard/clients'))}
        >
          My Clients
        </Link>
        <Link
          href="/dashboard/accounts"
          className={navCls(pathname.startsWith('/dashboard/accounts'))}
        >
          Managed Accounts
        </Link>
        <Link
          href="/dashboard/transactions"
          className={navCls(pathname.startsWith('/dashboard/transactions'))}
        >
          Transactions
        </Link>
      </nav>

      <div className="mt-auto border-t border-[#ece7d8] pt-4">
        <ProfileMenu agencyName={agencyName} userEmail={userEmail} signout={signout} />
      </div>
    </aside>
  )
}
