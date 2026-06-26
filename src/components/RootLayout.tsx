import { Link, Outlet } from 'react-router-dom'

export function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-3">
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
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Plantas de Beneficio · Minería — Fase 4 Construcción
      </footer>
    </div>
  )
}
