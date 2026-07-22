'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from './logo'

function navCls(active: boolean) {
  return `block px-3 py-2 text-sm font-medium ${
    active ? 'bg-[#ece7d8] text-gray-900' : 'text-gray-700 hover:bg-[#f6f1e4]'
  }`
}

export function AdminSidebar({
  email,
  isSuperadmin,
  archivedCount,
  signout,
}: {
  email: string
  isSuperadmin: boolean
  archivedCount: number
  signout: () => void | Promise<void>
}) {
  const pathname = usePathname()
  const initial = email.trim().charAt(0).toUpperCase() || '?'

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[#ece7d8] bg-[#f9f5f1] px-4 py-6">
      <Link href="/admin" className="px-2">
        <Logo height={28} />
      </Link>

      <Link
        href="/admin/new-agency"
        className="mt-8 bg-[#f7cf4a] px-3 py-2.5 text-center text-sm font-semibold text-black hover:brightness-95 font-mono uppercase tracking-wide"
      >
        + New agency
      </Link>

      <nav className="mt-6 space-y-1">
        <Link
          href="/admin"
          className={navCls(pathname === '/admin' || pathname.startsWith('/admin/agencies'))}
        >
          Agencies
        </Link>
        <Link
          href="/admin/products"
          className={navCls(pathname.startsWith('/admin/products'))}
        >
          Products
        </Link>
        <Link
          href="/admin/transactions"
          className={navCls(pathname.startsWith('/admin/transactions'))}
        >
          All Transactions
        </Link>
        {isSuperadmin && (
          <Link
            href="/admin/admins"
            className={navCls(pathname.startsWith('/admin/admins'))}
          >
            Admins
          </Link>
        )}
        <Link
          href="/admin/archived"
          className={navCls(pathname.startsWith('/admin/archived'))}
        >
          Archived Accounts{archivedCount > 0 ? ` (${archivedCount})` : ''}
        </Link>
      </nav>

      <div className="mt-auto space-y-3 border-t border-[#ece7d8] pt-4">
        <div className="flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#f7cf4a] text-sm font-semibold text-black">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">Admin</p>
            <p className="truncate text-xs text-gray-500">{email}</p>
          </div>
        </div>
        <form action={signout}>
          <button className="px-2 text-xs font-mono uppercase tracking-wide text-gray-500 hover:text-gray-800">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
