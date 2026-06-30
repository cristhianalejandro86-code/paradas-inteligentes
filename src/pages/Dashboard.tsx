import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'
import { getParadas } from '../lib/api'
import { NuevaParadaModal } from '../components/NuevaParadaModal'
import type { Parada, ParadaStatus } from '../types'

export function Dashboard() {
  const [paradas, setParadas] = useState<Parada[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const navigate = useNavigate()

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Paradas</h2>
          <p className="text-sm text-slate-500">
            Selecciona una parada para ver su tablero.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-amber-600/20 transition-all hover:shadow-md hover:brightness-105"
        >
          + Nueva parada
        </button>
      </div>

      {creando && (
        <NuevaParadaModal
          onClose={() => setCreando(false)}
          onCreated={(p) => navigate(`/parada/${p.id}`)}
        />
      )}

      {loading && <p className="text-sm text-slate-400">Cargando paradas…</p>}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {error}
        </div>
      )}
      {!loading && !error && paradas.length === 0 && (
        <p className="text-sm text-slate-400">No hay paradas todavía.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {paradas.map((p) => (
          <ParadaCard key={p.id} parada={p} />
        ))}
      </div>
    </>
  )
}

const fmtFecha = (s?: string | null) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function ParadaCard({ parada }: { parada: Parada }) {
  const tareas = parada.tarea ?? []
  const total = tareas.length
  const completadas = tareas.filter((t) => t.status === 'Completada').length
  const criticas = tareas.filter((t) => t.es_critica).length
  const avance = total ? Math.round((completadas / total) * 100) : 0

  const barColor = avance >= 80 ? 'bg-emerald-500' : avance >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <Link
      to={`/parada/${parada.id}`}
      className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 transition-colors group-hover:text-amber-700">
            {parada.nombre}
          </h3>
          {parada.equipo_afectado && (
            <p className="line-clamp-1 text-sm text-slate-500">{parada.equipo_afectado}</p>
          )}
        </div>
        <ParadaBadge status={parada.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200">
          🗓 {fmtFecha(parada.fecha_inicio_planeada)} → {fmtFecha(parada.fecha_fin_planeada)}
        </span>
        {parada.duracion_planeada_horas != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200">⏱️ {parada.duracion_planeada_horas}h planeadas</span>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-slate-500">
            {completadas}/{total} tareas{criticas > 0 && <span className="ml-1 text-red-600">· {criticas} críticas</span>}
          </span>
          <span className="font-semibold text-slate-700">{avance}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${avance}%` }}
          />
        </div>
      </div>
    </Link>
  )
}

function ParadaBadge({ status }: { status: ParadaStatus }) {
  const map: Record<ParadaStatus, { cls: string; dot: string }> = {
    Planificada: { cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
    Aprobada: { cls: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
    Activa: { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
    Suspendida: { cls: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
    Cerrada: { cls: 'bg-slate-100 text-slate-500 ring-slate-200', dot: 'bg-slate-400' },
    Cancelada: { cls: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  }
  const s = map[status]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  )
}
