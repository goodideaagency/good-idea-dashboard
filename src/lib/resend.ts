// Sends a notification email via Resend. If RESEND_API_KEY isn't set yet,
// this silently no-ops -- in-app notifications still get written either way.
export async function sendNotificationEmail(to: string, subject: string, bodyHtml: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) return

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html: bodyHtml }),
    })
    // A non-2xx here (bad/restricted key, unverified from-domain, rate
    // limit) previously vanished completely -- fetch doesn't throw on an
    // HTTP error status, so this always silently "succeeded" from the
    // caller's point of view even when Resend rejected the send outright.
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`sendNotificationEmail: Resend returned ${res.status} for ${to}: ${body}`)
    }
  } catch (err) {
    // Still best-effort -- the in-app notification is the source of truth,
    // so a delivery failure here must never break the notification
    // pipeline. Logged so it's at least visible instead of invisible.
    console.error('sendNotificationEmail: request failed:', err)
  }
}
