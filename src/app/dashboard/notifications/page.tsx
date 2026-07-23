import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { markAllNotificationsRead } from './actions'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, title, body, url, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const list = notifications ?? []
  const unreadCount = list.filter((n) => !n.read_at).length

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-4xl font-semibold text-gray-900">Notifications</h1>
        {unreadCount > 0 && (
          <form action={markAllNotificationsRead}>
            <button className="border border-[#e7e2d3] px-3 py-1.5 text-xs text-gray-700 hover:bg-[#f6f1e4] font-mono uppercase tracking-wide">
              Mark all read
            </button>
          </form>
        )}
      </div>

      {list.length === 0 ? (
        <div className="mt-10 border border-dashed border-[#e7e2d3] bg-white p-8 text-center">
          <p className="text-sm text-gray-500">No notifications yet.</p>
        </div>
      ) : (
        <div className="mt-8 max-w-2xl space-y-2">
          {list.map((n) => (
            <Link
              key={n.id}
              href={`/api/notifications/open/${n.id}`}
              className={`block border border-[#ece7d8] px-4 py-3 hover:bg-[#f6f1e4] ${
                n.read_at ? 'bg-white' : 'bg-[#fdf8ec]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-gray-900">{n.title}</p>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </div>
              {n.body && (
                <p className="mt-1 whitespace-pre-line text-sm text-gray-500">{n.body}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
