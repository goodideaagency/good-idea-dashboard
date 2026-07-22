'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from './logo'

function navCls(active: boolean) {
  return `block px-3 py-2 text-sm font-medium ${
    active ? 'bg-[#ece7d8] text-gray-900' : 'text-gray-700 hover:bg-[#f6f1e4]'
  }`
}

export function AgencySidebar({
  agencyName,
  userEmail,
  signout,
}: {
  agencyName: string
  userEmail: string
  signout: () => void | Promise<void>
}) {
  const pathname = usePathname()
  const initial = agencyName.trim().charAt(0).toUpperCase() || '?'

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-[#ece7d8] bg-[#f9f5f1] px-4 py-6">
      <Link href="/dashboard" className="px-2">
        <Logo height={28} />
      </Link>

      <Link
        href="/dashboard/add"
        className="mt-8 bg-[#f7cf4a] px-3 py-2.5 text-center text-sm font-semibold text-black hover:brightness-95 font-mono uppercase tracking-wide"
      >
        + Add new account
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
          className={navCls(
            pathname.startsWith('/dashboard/clients') || pathname.startsWith('/dashboard/accounts')
          )}
        >
          My Clients
        </Link>
        <Link
          href="/dashboard/transactions"
          className={navCls(pathname.startsWith('/dashboard/transactions'))}
        >
          Transactions
        </Link>
      </nav>

      <div className="mt-auto space-y-3 border-t border-[#ece7d8] pt-4">
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-3 px-2 py-1 -mx-2 ${
            pathname.startsWith('/dashboard/settings') ? 'bg-[#ece7d8]' : 'hover:bg-[#f6f1e4]'
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#f7cf4a] text-sm font-semibold text-black">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{agencyName}</p>
            <p className="truncate text-xs text-gray-500">{userEmail}</p>
          </div>
        </Link>
        <form action={signout}>
          <button className="px-2 text-xs font-mono uppercase tracking-wide text-gray-500 hover:text-gray-800">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
