import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Handles email action links (invite / password recovery). Verifies the
// one-time token, which logs the user in (sets the session cookie), then
// forwards them to `next` (e.g. the set-password page).
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = url.searchParams.get('next') ?? '/dashboard'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  return NextResponse.redirect(
    new URL('/login?error=' + encodeURIComponent('That link is invalid or has expired.'), request.url)
  )
}
