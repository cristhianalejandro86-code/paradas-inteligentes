import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams, Link } from 'react-router-dom'
import { getParadaById, getHistorialParada, deshacerParada, restaurarBaseline } from '../lib/api'
import type { SnapshotInfo } from '../lib/api'
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
  const [historial, setHistorial] = useState<SnapshotInfo[]>([])
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getParadaById(id)
      .then(setParada)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    getHistorialParada(id).then(setHistorial).catch(() => {})
  }, [id])

  const cambios = historial.filter((h) => h.tipo === 'cambio')
  const baseline = historial.find((h) => h.tipo === 'baseline')

  async function onDeshacer() {
    if (!id || ocupado || !cambios.length) return
    setOcupado(true)
    try {
      await deshacerParada(id)
      window.location.reload() // recarga la vista con el estado restaurado
    } catch (e) { setError(String(e)); setOcupado(false) }
  }
  const [eligiendoRestablecer, setEligiendoRestablecer] = useState(false)
  async function onRestablecer(todo: boolean) {
    if (!id || ocupado || !baseline) return
    setEligiendoRestablecer(false)
    setOcupado(true)
    try {
      await restaurarBaseline(id, todo)
      window.location.reload()
    } catch (e) { setError(String(e)); setOcupado(false) }
  }

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
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onDeshacer}
            disabled={ocupado || cambios.length === 0}
            title={cambios.length ? `Deshacer el último cambio (${cambios[0].etiqueta}). Quedan ${cambios.length} nivel(es) de deshacer.` : 'Sin cambios que deshacer'}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↶ Deshacer{cambios.length > 0 && <span className="ml-1 rounded bg-slate-200 px-1.5 text-xs font-semibold text-slate-600">{cambios.length}</span>}
          </button>
          {baseline && (
            <button
              onClick={() => setEligiendoRestablecer(true)}
              disabled={ocupado}
              title={`Vuelve al estado exacto de "${baseline.etiqueta}" y descarta los cambios posteriores (eliges el alcance)`}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ⟲ Restablecer a {baseline.etiqueta.replace('Carga ', '')}
            </button>
          )}
          {eligiendoRestablecer && baseline && (
            <div role="dialog" aria-modal="true" onClick={() => setEligiendoRestablecer(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
                <h3 className="text-sm font-semibold text-slate-900">⟲ Restablecer a {baseline.etiqueta}</h3>
                <p className="mb-4 mt-1 text-xs text-slate-500">Elige el alcance. En ambos casos se descartan los cambios posteriores a la carga y se vacía la pila de Deshacer.</p>
                <div className="grid gap-2">
                  <button onClick={() => onRestablecer(false)} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-left hover:bg-amber-100">
                    <span className="block text-sm font-semibold text-amber-800">Solo actividades</span>
                    <span className="block text-xs text-amber-700">Las 164 tareas vuelven al plan REV029. Se CONSERVAN rosters de cuadrillas, capacidades, operadores de grúa y días por línea.</span>
                  </button>
                  <button onClick={() => onRestablecer(true)} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-left hover:bg-red-100">
                    <span className="block text-sm font-semibold text-red-800">TODO (actividades + cuadrillas)</span>
                    <span className="block text-xs text-red-700">Además de las tareas, también vuelven al estado de la carga los rosters, capacidades, operadores de grúa y días por línea.</span>
                  </button>
                </div>
                <button onClick={() => setEligiendoRestablecer(false)} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              </div>
            </div>
          )}
          <ParadaBadge status={parada.status} />
        </div>
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
