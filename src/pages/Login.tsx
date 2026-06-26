import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Credenciales inválidas. Verifica tu correo y contraseña.')
      setLoading(false)
    }
    // Si entra bien, onAuthStateChange actualiza la sesión y se muestra la app.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500 text-xl font-bold text-white">
            P
          </span>
          <h1 className="text-xl font-semibold text-slate-900">
            Paradas Inteligentes
          </h1>
          <p className="text-sm text-slate-500">Ingresa con tu cuenta</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Correo
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="tucorreo@planta.pe"
          />

          <label className="mb-1 block text-sm font-medium text-slate-700">
            Contraseña
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="••••••••"
          />

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          ¿No tienes cuenta? Solicítala al administrador de la parada.
        </p>
      </div>
    </div>
  )
}
