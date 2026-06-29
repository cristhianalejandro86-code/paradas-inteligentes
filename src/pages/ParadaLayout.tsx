import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams, Link } from 'react-router-dom'
import { getParadaById } from '../lib/api'
import type { Parada, ParadaStatus } from '../types'

const TABS = [
  { to: '', label: 'Kanban', end: true },
  { to: 'lista', label: 'Lista', end: false },
  { to: 'gantt', label: 'Gantt', end: false },
  { to: 'cuadrillas', label: 'Cuadrillas', end: false },
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
        className="mb-3 inline-block text-sm text-slate-400 hover:text-slate-600"
      >
        ← Todas las paradas
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{parada.nombre}</h2>
          <p className="text-sm text-slate-500">
            {parada.equipo_afectado} · {parada.fecha_inicio_planeada} →{' '}
            {parada.fecha_fin_planeada}
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
              `-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
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
