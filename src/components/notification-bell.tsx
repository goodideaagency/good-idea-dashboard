'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { markAllNotificationsRead, markNotificationRead } from '@/app/dashboard/notifications/actions'

type Notification = {
  id: string
  title: string
  body: string | null
  url: string | null
  read_at: string | null
  created_at: string
}

const POLL_MS = 30_000

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
}: {
  initialNotifications: Notification[]
  initialUnreadCount: number
}) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/notifications/mine')
        if (!res.ok) return
        const data = await res.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      } catch {
        // Best-effort -- the bell just won't update until the next tick.
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function handleOpenNotification(n: Notification) {
    if (!n.read_at) {
      setNotifications((prev) =>
        prev.map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
      await markNotificationRead(n.id)
    }
    setOpen(false)
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((p) => ({ ...p, read_at: p.read_at ?? new Date().toISOString() })))
    setUnreadCount(0)
    await markAllNotificationsRead()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center hover:bg-[#f6f1e4]"
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-80 border border-[#ece7d8] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#ece7d8] px-3 py-2">
            <p className="text-xs font-mono uppercase tracking-wide text-gray-400">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-400">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.url ?? '/dashboard'}
                  onClick={() => handleOpenNotification(n)}
                  className={`block border-b border-[#f3efe4] px-3 py-3 text-sm hover:bg-[#f6f1e4] ${
                    n.read_at ? '' : 'bg-[#fdf8ec]'
                  }`}
                >
                  <p className="font-medium text-gray-900">{n.title}</p>
                  {n.body && (
                    <p className="mt-1 whitespace-pre-line text-xs text-gray-500 line-clamp-3">{n.body}</p>
                  )}
                  <p className="mt-1 text-[11px] text-gray-400">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
