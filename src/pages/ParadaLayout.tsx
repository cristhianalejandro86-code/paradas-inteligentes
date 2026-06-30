import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams, Link } from 'react-router-dom'
import { getParadaById } from '../lib/api'
import type { Parada, ParadaStatus } from '../types'

const TABS = [
  { to: '', label: 'Kanban', end: true },
  { to: 'lista', label: 'Lista', end: false },
  { to: 'gantt', label: 'Gantt', end: false },
  { to: 'cuadrillas', label: 'Cuadrillas', end: false },
  { to: 'preparacion', label: '✅ Preparación', end: false },
  { to: 'ruta-critica', label: 'Ruta crítica', end: false },
  { to: 'recursos', label: 'Recursos', end: false },
]

export function ParadaLayout() {
  const { id } = useParams<{ id: string }>()
  const [parada, setParada] = useState<Parada | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getParadaById(id)
      .then(setParada)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-sm text-slate-400">Cargando parada…</p>
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Error: {error}
      </div>
    )
  if (!parada) return <p className="text-sm text-slate-400">Parada no encontrada.</p>

  return (
    <>
      <Link
        to="/"
        className="group mb-3 inline-flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-slate-700"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">←</span> Todas las paradas
      </Link>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{parada.nombre}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
            {parada.equipo_afectado && <span>{parada.equipo_afectado}</span>}
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
              🗓 {fmtFecha(parada.fecha_inicio_planeada)} → {fmtFecha(parada.fecha_fin_planeada)}
            </span>
          </p>
        </div>
        <ParadaBadge status={parada.status} />
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `-mb-px whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-amber-500 bg-amber-50/70 text-amber-700'
                  : 'border-transparent text-slate-500 hover:bg-slate-100/70 hover:text-slate-700'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={parada} />
    </>
  )
}

const fmtFecha = (s?: string | null) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

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
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  )
}
