import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import type { Parada, ParadaStatus, TaskStatus } from './types'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center gap-3">
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
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <h2 className="mb-1 text-2xl font-bold text-slate-900">Paradas</h2>
        <p className="mb-6 text-sm text-slate-500">
          Datos en vivo desde Supabase.
        </p>
        <ParadasList />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Plantas de Beneficio · Minería — Fase 4 Construcción · Incremento 2
      </footer>
    </div>
  )
}

function ParadasList() {
  const [paradas, setParadas] = useState<Parada[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('Falta configurar .env.local con las credenciales de Supabase.')
      setLoading(false)
      return
    }
    supabase
      .from('parada')
      .select(
        'id, nombre, descripcion, equipo_afectado, fecha_inicio_planeada, fecha_fin_planeada, status, status_aprobacion, duracion_planeada_horas, tarea(id, nombre, status, es_critica, porcentaje_completado)',
      )
      .order('fecha_inicio_planeada', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setParadas((data as unknown as Parada[]) ?? [])
        setLoading(false)
      })
  }, [])

  if (loading)
    return <p className="text-sm text-slate-400">Cargando paradas…</p>
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Error: {error}
      </div>
    )
  if (paradas.length === 0)
    return <p className="text-sm text-slate-400">No hay paradas todavía.</p>

  return (
    <div className="grid gap-4">
      {paradas.map((p) => (
        <ParadaCard key={p.id} parada={p} />
      ))}
    </div>
  )
}

function ParadaCard({ parada }: { parada: Parada }) {
  const tareas = parada.tarea ?? []
  const total = tareas.length
  const completadas = tareas.filter((t) => t.status === 'Completada').length
  const criticas = tareas.filter((t) => t.es_critica).length
  const avance = total ? Math.round((completadas / total) * 100) : 0

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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

      {parada.descripcion && (
        <p className="mt-2 text-sm text-slate-600">{parada.descripcion}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        <span>📅 {parada.fecha_inicio_planeada} → {parada.fecha_fin_planeada}</span>
        {parada.duracion_planeada_horas != null && (
          <span>⏱️ {parada.duracion_planeada_horas}h planeadas</span>
        )}
        <span>✅ Aprobación: {parada.status_aprobacion}</span>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>
            Avance: {completadas}/{total} tareas · {criticas} críticas
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

      {total > 0 && (
        <ul className="mt-4 grid gap-1.5">
          {tareas.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm"
            >
              {t.es_critica && (
                <span
                  title="Tarea crítica"
                  className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
                >
                  CRÍTICA
                </span>
              )}
              <span className="flex-1 text-slate-700">{t.nombre}</span>
              <span className="text-xs text-slate-400">
                {t.porcentaje_completado}%
              </span>
              <TaskBadge status={t.status} />
            </li>
          ))}
        </ul>
      )}
    </article>
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

function TaskBadge({ status }: { status: TaskStatus }) {
  const map: Record<TaskStatus, string> = {
    Por_Hacer: 'bg-slate-100 text-slate-600',
    En_Progreso: 'bg-blue-50 text-blue-700',
    En_Revision: 'bg-violet-50 text-violet-700',
    Completada: 'bg-emerald-50 text-emerald-700',
    Bloqueada: 'bg-red-50 text-red-700',
    Cancelada: 'bg-slate-100 text-slate-400',
  }
  return (
    <span
      className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${map[status]}`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

export default App
