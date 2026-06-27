import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function RootLayout() {
  const { perfil, session, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-none px-6 py-4 flex items-center justify-between gap-3 2xl:px-10">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500 text-white font-bold">
              P
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-slate-900">
                Paradas Inteligentes
              </h1>
              <p className="text-xs text-slate-500">
                Gestión de paradas mecánicas · v1 (MVP)
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700">
                {perfil?.nombre ?? session?.user?.email}
              </p>
              {perfil?.rol && (
                <p className="text-xs text-slate-400">
                  {perfil.rol.replace('_', ' ')}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-none flex-1 px-6 py-8 2xl:px-10">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Plantas de Beneficio · Minería — Fase 4 Construcción
      </footer>
    </div>
  )
}
