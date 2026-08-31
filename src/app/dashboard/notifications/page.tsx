import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { markAllNotificationsRead, markNotificationUnread } from './actions'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, title, body, url, read_at, created_at, kind')
    .order('created_at', { ascending: false })
    .limit(100)

  const list = notifications ?? []
  const unreadCount = list.filter((n) => !n.read_at).length

  return (
    <div>
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
        <div className="mt-8 space-y-2">
          {list.map((n) => {
            const isFailedPayment = n.kind === 'payment_failed'
            return (
            <div
              key={n.id}
              className={
                isFailedPayment
                  ? 'border-l-4 border-[#E0521B] bg-[#FDEDE3] px-4 py-3 ring-1 ring-[#F3C7AC]'
                  : `border border-[#ece7d8] px-4 py-3 ${n.read_at ? 'bg-white' : 'bg-[#fdf8ec]'}`
              }
            >
              <Link href={`/api/notifications/open/${n.id}`} className="block hover:opacity-70">
                <div className="flex items-start justify-between gap-3">
                  <p
                    className={`text-sm font-medium ${isFailedPayment ? 'text-[#9A3412]' : 'text-gray-900'}`}
                  >
                    {n.title}
                  </p>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                {n.body && (
                  <p
                    className={`mt-1 whitespace-pre-line text-sm ${isFailedPayment ? 'text-[#9A3412]' : 'text-gray-500'}`}
                  >
                    {n.body}
                  </p>
                )}
                {isFailedPayment && (
                  <span className="mt-3 inline-block bg-[#E0521B] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                    Complete payment →
                  </span>
                )}
              </Link>
              {n.read_at && (
                <form action={markNotificationUnread} className="mt-2">
                  <input type="hidden" name="notification_id" value={n.id} />
                  <button className="text-[11px] text-gray-400 underline underline-offset-2 hover:text-gray-700 font-mono uppercase tracking-wide">
                    Mark as unread
                  </button>
                </form>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
