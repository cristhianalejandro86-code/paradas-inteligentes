import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from './lib/supabase'
import { getPrimeraParada } from './lib/api'
import { KanbanBoard } from './components/KanbanBoard'
import type { Parada, ParadaStatus } from './types'

function App() {
  const [parada, setParada] = useState<Parada | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('Falta configurar .env.local con las credenciales de Supabase.')
      setLoading(false)
      return
    }
    getPrimeraParada()
      .then(setParada)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500 text-white font-bold">
            P
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-slate-900">
              Paradas Inteligentes
            </h1>
            <p className="text-xs text-slate-500">
              Tablero Kanban · arrastra las tarjetas entre columnas
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {loading && <p className="text-sm text-slate-400">Cargando…</p>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error: {error}
          </div>
        )}
        {!loading && !error && !parada && (
          <p className="text-sm text-slate-400">No hay paradas todavía.</p>
        )}
        {parada && (
          <>
            <ParadaHeader parada={parada} />
            <KanbanBoard paradaId={parada.id} />
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Plantas de Beneficio · Minería — Fase 4 Construcción · Incremento 3
      </footer>
    </div>
  )
}

function ParadaHeader({ parada }: { parada: Parada }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{parada.nombre}</h2>
        <p className="text-sm text-slate-500">
          {parada.equipo_afectado} · {parada.fecha_inicio_planeada} →{' '}
          {parada.fecha_fin_planeada}
        </p>
      </div>
      <ParadaBadge status={parada.status} />
    </div>
  )
}

function ParadaBadge({ status }: { status: ParadaStatus }) {
  const map: Record<ParadaStatus, string> = {
    Planificada: 'bg-slate-100 text-slate-600',
    Aprobada: 'bg-blue-50 text-blue-700',
    Activa: 'bg-emerald-50 text-emerald-700',
    Suspendida: 'bg-amber-50 text-amber-700',
    Cerrada: 'bg-slate-100 text-slate-500',
    Cancelada: 'bg-red-50 text-red-700',
  }
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${map[status]}`}
    >
      {status}
    </span>
  )
}

export default App
