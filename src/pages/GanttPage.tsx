import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTareasByParada } from '../lib/api'
import type { Tarea, TaskStatus } from '../types'

interface Row {
  t: Tarea
  start: number
  end: number
  dur: number
}

const BAR_COLOR: Record<TaskStatus, string> = {
  Por_Hacer: 'bg-slate-400',
  En_Progreso: 'bg-blue-500',
  En_Revision: 'bg-violet-500',
  Completada: 'bg-emerald-500',
  Bloqueada: 'bg-red-500',
  Cancelada: 'bg-slate-300',
}

export function GanttPage() {
  const { id } = useParams<{ id: string }>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getTareasByParada(id)
      .then(setTareas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const { rows, total } = useMemo(() => {
    const byId = new Map(tareas.map((t) => [t.id, t]))
    const cache = new Map<string, number>()
    // Inicio más temprano (h) según la cadena de bloqueos.
    function start(t: Tarea, stack = new Set<string>()): number {
      if (cache.has(t.id)) return cache.get(t.id)!
      const blockerId = t.bloqueado_por
      if (!blockerId || !byId.has(blockerId) || stack.has(t.id)) {
        cache.set(t.id, 0)
        return 0
      }
      stack.add(t.id)
      const blocker = byId.get(blockerId)!
      const s = start(blocker, stack) + Number(blocker.duracion_estimada_horas ?? 0)
      stack.delete(t.id)
      cache.set(t.id, s)
      return s
    }
    const rows: Row[] = tareas
      .map((t) => {
        const s = start(t)
        const dur = Number(t.duracion_estimada_horas ?? 1)
        return { t, start: s, end: s + dur, dur }
      })
      .sort((a, b) => a.start - b.start || (a.t.secuencia ?? 0) - (b.t.secuencia ?? 0))
    const total = Math.max(1, ...rows.map((r) => r.end))
    return { rows, total }
  }, [tareas])

  const step = total <= 12 ? 2 : total <= 24 ? 4 : 8
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step)

  if (loading) return <p className="text-sm text-slate-400">Cargando Gantt…</p>
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Error: {error}
      </div>
    )
  if (rows.length === 0)
    return <p className="text-sm text-slate-400">No hay tareas para graficar.</p>

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Línea de tiempo (Gantt) · {total}h totales
        </h3>
        <div className="flex gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" />
            Completada
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-blue-500" />
            En progreso
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-red-500" />
            Bloqueada
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm ring-2 ring-red-500" />
            Crítica
          </span>
        </div>
      </div>

      {/* Eje de tiempo */}
      <div className="grid grid-cols-[180px_1fr] gap-x-3">
        <div />
        <div className="relative mb-1 h-5 border-b border-slate-200">
          {ticks.map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2 text-[10px] text-slate-400"
              style={{ left: `${(h / total) * 100}%` }}
            >
              {h}h
            </span>
          ))}
        </div>

        {/* Filas */}
        {rows.map(({ t, start, dur }) => (
          <Fragment key={t.id}>
            <div className="flex items-center gap-1 py-1.5 pr-2">
              {t.es_critica && (
                <span className="text-[10px] font-bold text-red-600">●</span>
              )}
              <span
                className="truncate text-sm text-slate-700"
                title={t.nombre}
              >
                {t.nombre}
              </span>
            </div>
            <div className="relative flex items-center py-1.5">
              <div className="absolute inset-x-0 top-1/2 h-px bg-slate-100" />
              <div
                className={`absolute h-5 rounded ${BAR_COLOR[t.status]} ${
                  t.es_critica ? 'ring-2 ring-red-500 ring-offset-1' : ''
                }`}
                style={{
                  left: `${(start / total) * 100}%`,
                  width: `${Math.max((dur / total) * 100, 2)}%`,
                }}
                title={`${t.nombre} · ${start}h → ${start + dur}h · ${t.porcentaje_completado}%`}
              >
                {/* relleno de avance */}
                <div
                  className="h-full rounded-l bg-white/35"
                  style={{ width: `${100 - t.porcentaje_completado}%`, marginLeft: 'auto' }}
                />
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
