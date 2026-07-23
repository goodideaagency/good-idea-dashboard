import crypto from 'crypto'

// ClickUp signs each webhook POST body with the webhook's own secret (HMAC
// SHA256, hex), sent as the X-Signature header. Verifying this stops anyone
// who finds the endpoint URL from injecting fake task changes.
export function verifyClickUpSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.CLICKUP_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

// One-time setup: registers a SINGLE webhook scoped to the whole "Good Idea
// Clients" Space, so every client Folder/List under it is covered
// automatically -- including new clients added later -- with no per-list
// registration. Run once (see scripts/register-clickup-webhook.ts); the
// returned `secret` must then be saved as CLICKUP_WEBHOOK_SECRET.
export async function registerSpaceWebhook(teamId: string, spaceId: string, endpointUrl: string) {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
    method: 'POST',
    headers: {
      Authorization: process.env.CLICKUP_API_TOKEN!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      endpoint: endpointUrl,
      events: ['taskCommentPosted', 'taskStatusUpdated', 'taskDueDateUpdated', 'taskAttachmentUpdated'],
      space_id: spaceId,
    }),
  })
  return res.json()
}
