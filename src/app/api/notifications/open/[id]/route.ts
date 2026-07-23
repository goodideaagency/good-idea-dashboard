import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Marks a notification read, then redirects to its target -- lets a plain
// <a> both open the linked task and clear the unread state in one click,
// with no client-side JS needed.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: notification } = await supabase
    .from('notifications')
    .select('url')
    .eq('id', id)
    .maybeSingle()

  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.redirect(new URL(notification?.url ?? '/dashboard', req.url))
}
