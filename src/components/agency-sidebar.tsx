'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from './logo'
import { ProfileMenu } from './profile-menu'
import { NotificationBell } from './notification-bell'

type NotificationRow = {
  id: string
  title: string
  body: string | null
  url: string | null
  read_at: string | null
  created_at: string
}

function navCls(active: boolean) {
  return `block px-3 py-2 text-sm font-medium ${
    active ? 'bg-[#ece7d8] text-gray-900' : 'text-gray-700 hover:bg-[#f6f1e4]'
  }`
}

export function AgencySidebar({
  agencyName,
  userEmail,
  signout,
  notifications,
  unreadCount,
}: {
  agencyName: string
  userEmail: string
  signout: () => void | Promise<void>
  notifications: NotificationRow[]
  unreadCount: number
}) {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-[#ece7d8] bg-[#f9f5f1] px-4 py-6">
      <div className="flex items-center justify-between px-2">
        <Link href="/dashboard">
          <Logo height={28} />
        </Link>
        <NotificationBell initialNotifications={notifications} initialUnreadCount={unreadCount} />
      </div>

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
