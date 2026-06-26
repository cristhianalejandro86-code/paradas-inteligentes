import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'
import { getParadas } from '../lib/api'
import type { Parada, ParadaStatus } from '../types'

export function Dashboard() {
  const [paradas, setParadas] = useState<Parada[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('Falta configurar .env.local con las credenciales de Supabase.')
      setLoading(false)
      return
    }
    getParadas()
      .then(setParadas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <h2 className="mb-1 text-2xl font-bold text-slate-900">Paradas</h2>
      <p className="mb-6 text-sm text-slate-500">
        Selecciona una parada para ver su tablero.
      </p>

      {loading && <p className="text-sm text-slate-400">Cargando paradas…</p>}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {error}
        </div>
      )}
      {!loading && !error && paradas.length === 0 && (
        <p className="text-sm text-slate-400">No hay paradas todavía.</p>
      )}

      <div className="grid gap-4">
        {paradas.map((p) => (
          <ParadaCard key={p.id} parada={p} />
        ))}
      </div>
    </>
  )
}

function ParadaCard({ parada }: { parada: Parada }) {
  const tareas = parada.tarea ?? []
  const total = tareas.length
  const completadas = tareas.filter((t) => t.status === 'Completada').length
  const criticas = tareas.filter((t) => t.es_critica).length
  const avance = total ? Math.round((completadas / total) * 100) : 0

  return (
    <Link
      to={`/parada/${parada.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {parada.nombre}
          </h3>
          {parada.equipo_afectado && (
            <p className="text-sm text-slate-500">{parada.equipo_afectado}</p>
          )}
        </div>
        <ParadaBadge status={parada.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        <span>
          📅 {parada.fecha_inicio_planeada} → {parada.fecha_fin_planeada}
        </span>
        {parada.duracion_planeada_horas != null && (
          <span>⏱️ {parada.duracion_planeada_horas}h planeadas</span>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>
            {completadas}/{total} tareas · {criticas} críticas
          </span>
          <span>{avance}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${avance}%` }}
          />
        </div>
      </div>
    </Link>
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
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${map[status]}`}
    >
      {status}
    </span>
  )
}
