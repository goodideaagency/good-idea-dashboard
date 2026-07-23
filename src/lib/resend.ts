// Sends a notification email via Resend. If RESEND_API_KEY isn't set yet,
// this silently no-ops -- in-app notifications still get written either way.
export async function sendNotificationEmail(to: string, subject: string, bodyHtml: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) return

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html: bodyHtml }),
    })
  } catch {
    // Best-effort -- the in-app notification is the source of truth.
  }
}
