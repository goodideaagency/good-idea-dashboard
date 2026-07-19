// Is this email allowed to see the admin area? Controlled by ADMIN_EMAILS
// (comma-separated) in the environment.
export function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(email.toLowerCase())
}
