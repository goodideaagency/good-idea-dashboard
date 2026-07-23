import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Polled by the sidebar's notification bell to refresh the unread count and
// recent list without a full page reload. RLS scopes this to the caller.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ notifications: [], unreadCount: 0 })

  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, title, body, url, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),
  ])

  return NextResponse.json({ notifications: notifications ?? [], unreadCount: unreadCount ?? 0 })
}
