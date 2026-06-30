import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function RootLayout() {
  const { perfil, session, signOut } = useAuth()
  const nombre = perfil?.nombre ?? session?.user?.email ?? '?'
  const iniciales = nombre.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto flex w-full max-w-none items-center justify-between gap-3 px-6 py-3 2xl:px-10">
          <Link to="/" className="group flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 font-bold text-white shadow-sm ring-1 ring-amber-600/20 transition-transform group-hover:scale-105">
              P
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-slate-900">
                Paradas Inteligentes
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                Gestión de paradas mecánicas · v1 (MVP)
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="max-w-[40vw] truncate text-sm font-medium text-slate-700">
                {perfil?.nombre ?? session?.user?.email}
              </p>
              {perfil?.rol && (
                <p className="text-xs text-slate-400">
                  {perfil.rol.replace('_', ' ')}
                </p>
              )}
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-xs font-bold text-slate-600 ring-1 ring-slate-200" title={nombre}>
              {iniciales}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-none flex-1 px-6 py-8 2xl:px-10">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white/60 py-4 text-center text-xs text-slate-400">
        Plantas de Beneficio · Minería — Fase 4 Construcción
      </footer>
    </div>
  )
}
