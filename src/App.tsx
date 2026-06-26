import { isSupabaseConfigured } from './lib/supabase'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
          </div>
          <ConnBadge ok={isSupabaseConfigured} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          Construcción iniciada 🚧
        </h2>
        <p className="max-w-xl text-slate-600">
          Frontend Vite + React + TypeScript + Tailwind, listo y conectado a
          Supabase. Este es el incremento&nbsp;1: el esqueleto que corre. El
          siguiente paso es aplicar el schema de la base de datos.
        </p>

        <ol className="grid w-full max-w-md gap-2 text-left">
          <Step done label="Scaffold Vite + React + TS" />
          <Step done label="Tailwind CSS v4" />
          <Step done label="Cliente Supabase + variables de entorno" />
          <Step
            done={isSupabaseConfigured}
            label={
              isSupabaseConfigured
                ? 'Variables Supabase configuradas'
                : 'Pendiente: completar .env.local (Supabase)'
            }
          />
          <Step label="Próximo: schema BD en Supabase (incremento 2)" />
        </ol>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Plantas de Beneficio · Minería — Fase 4 Construcción
      </footer>
    </div>
  )
}

function ConnBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ' +
        (ok
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
          : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200')
      }
    >
      <span
        className={
          'h-2 w-2 rounded-full ' + (ok ? 'bg-emerald-500' : 'bg-amber-500')
        }
      />
      {ok ? 'Supabase configurado' : 'Supabase sin configurar'}
    </span>
  )
}

function Step({ label, done }: { label: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">
      <span
        className={
          'grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ' +
          (done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500')
        }
      >
        {done ? '✓' : '•'}
      </span>
      <span className={done ? 'text-slate-700' : 'text-slate-500'}>
        {label}
      </span>
    </li>
  )
}

export default App
