import { LoginTabs } from './login-tabs'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginTabs error={error} />
    </main>
  )
}
