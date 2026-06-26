import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { Login } from '../pages/Login'

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-400">
        Cargando…
      </div>
    )
  }

  if (!session) return <Login />

  return <>{children}</>
}
