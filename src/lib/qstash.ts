// Schedules a one-off delayed callback via Upstash QStash -- used to flush a
// notification batch at exactly its fires_at time, without polling. If
// QSTASH_TOKEN isn't set yet, this silently no-ops (batches still accumulate
// in the DB, they just won't auto-flush until the token is added).
export async function scheduleFlush(batchId: string, delaySeconds: number): Promise<void> {
  const token = process.env.QSTASH_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!token || !appUrl) return

  // On a Vercel Preview deployment, Deployment Protection blocks unauthenticated
  // requests -- including QStash's own callback -- unless this bypass token is
  // appended. Harmless/no-op once this app URL is a production domain without
  // protection.
  const bypass = process.env.VERCEL_PROTECTION_BYPASS
  const callbackUrl = `${appUrl}/api/notifications/flush${bypass ? `?x-vercel-protection-bypass=${bypass}` : ''}`

  try {
    await fetch(`https://qstash.upstash.io/v2/publish/${callbackUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upstash-Delay': `${delaySeconds}s`,
        // Forwarded verbatim to our flush route by QStash -- a lightweight
        // shared-secret check since the callback URL is otherwise public.
        'Upstash-Forward-X-Internal-Secret': process.env.INTERNAL_FLUSH_SECRET ?? '',
      },
      body: JSON.stringify({ batchId }),
    })
  } catch {
    // Best-effort -- worst case the batch sits open until the next event on
    // the same task re-triggers scheduling logic upstream.
  }
}
