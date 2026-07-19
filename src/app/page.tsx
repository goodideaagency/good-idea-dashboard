import { redirect } from 'next/navigation'

export default function Home() {
  // Logged-in visitors reach the dashboard; the proxy sends the rest to /login.
  redirect('/dashboard')
}
