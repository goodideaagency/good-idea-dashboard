import { NextResponse } from 'next/server'
import { quickLivenessCheck } from '@/lib/health'

// Public liveness probe for an external uptime pinger. Deliberately reveals
// nothing beyond up/down: 200 when the app can reach its database, 503 if not.
export async function GET() {
  const ok = await quickLivenessCheck()
  return NextResponse.json({ status: ok ? 'ok' : 'down' }, { status: ok ? 200 : 503 })
}
