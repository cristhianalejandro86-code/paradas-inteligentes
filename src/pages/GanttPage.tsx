import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTareasByParada } from '../lib/api'
import type { Tarea, TaskStatus } from '../types'

interface Row {
  t: Tarea
  leftPct: number
  widthPct: number
  sub: string
}

const BAR_COLOR: Record<TaskStatus, string> = {
  Por_Hacer: 'bg-slate-400',
  En_Progreso: 'bg-blue-500',
  En_Revision: 'bg-violet-500',
  Completada: 'bg-emerald-500',
  Bloqueada: 'bg-red-500',
  Cancelada: 'bg-slate-300',
}

const MS_H = 3600000

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

  const { rows, ticks, mode, totalH } = useMemo(() => {
    const conFecha = tareas.filter((t) => t.fecha_inicio_prog && t.fecha_fin_prog)

    // --- Modo fechas reales (datos programados) ---
    if (conFecha.length > 0) {
      const items = conFecha.map((t) => ({
        t,
        s: new Date(t.fecha_inicio_prog as string).getTime(),
        e: new Date(t.fecha_fin_prog as string).getTime(),
      }))
      const t0 = Math.min(...items.map((i) => i.s))
      const t1 = Math.max(...items.map((i) => i.e))
      const span = Math.max(1, t1 - t0)
      const rows: Row[] = items
        .sort((a, b) => a.s - b.s)
        .map(({ t, s, e }) => ({
          t,
          leftPct: ((s - t0) / span) * 100,
          widthPct: Math.max(((e - s) / span) * 100, 0.6),
          sub: fechaCorta(s),
        }))
      const totalH = span / MS_H
      const stepH = totalH <= 30 ? 4 : totalH <= 72 ? 6 : 12
      const ticks: { left: number; label: string }[] = []
      const startTick = Math.ceil(t0 / (stepH * MS_H)) * (stepH * MS_H)
      for (let m = startTick; m <= t1; m += stepH * MS_H) {
        ticks.push({ left: ((m - t0) / span) * 100, label: fechaCorta(m) })
      }
      return { rows, ticks, mode: 'real' as const, totalH }
    }

    // --- Modo relativo (sin fechas): cadena de bloqueos ---
    const byId = new Map(tareas.map((t) => [t.id, t]))
    const cache = new Map<string, number>()
    function start(t: Tarea, stack = new Set<string>()): number {
      if (cache.has(t.id)) return cache.get(t.id)!
      const bid = t.bloqueado_por
      if (!bid || !byId.has(bid) || stack.has(t.id)) {
        cache.set(t.id, 0)
        return 0
      }
      stack.add(t.id)
      const b = byId.get(bid)!
      const s = start(b, stack) + Number(b.duracion_estimada_horas ?? 0)
      stack.delete(t.id)
      cache.set(t.id, s)
      return s
    }
    const raw = tareas
      .map((t) => ({ t, s: start(t), d: Number(t.duracion_estimada_horas ?? 1) }))
      .sort((a, b) => a.s - b.s)
    const total = Math.max(1, ...raw.map((r) => r.s + r.d))
    const rows: Row[] = raw.map(({ t, s, d }) => ({
      t,
      leftPct: (s / total) * 100,
      widthPct: Math.max((d / total) * 100, 1),
      sub: `${s}h`,
    }))
    const step = total <= 12 ? 2 : total <= 24 ? 4 : 8
    const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => ({
      left: ((i * step) / total) * 100,
      label: `${i * step}h`,
    }))
    return { rows, ticks, mode: 'rel' as const, totalH: total }
  }, [tareas])

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Gantt · {rows.length} tareas ·{' '}
          {mode === 'real'
            ? `${Math.round(totalH)}h (fechas programadas)`
            : `${totalH}h (relativo por bloqueos)`}
        </h3>
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          <Leg c="bg-slate-400" t="Por hacer" />
          <Leg c="bg-blue-500" t="En progreso" />
          <Leg c="bg-emerald-500" t="Completada" />
          <Leg c="bg-red-500" t="Bloqueada" />
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <div className="grid grid-cols-[200px_1fr] gap-x-3">
          {/* Eje */}
          <div className="sticky top-0 z-10 bg-white" />
          <div className="sticky top-0 z-10 mb-1 h-6 border-b border-slate-200 bg-white">
            <div className="relative h-full">
              {ticks.map((tk, i) => (
                <span
                  key={i}
                  className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-400"
                  style={{ left: `${tk.left}%` }}
                >
                  {tk.label}
                </span>
              ))}
            </div>
          </div>

          {/* Filas */}
          {rows.map(({ t, leftPct, widthPct }) => (
            <Fragment key={t.id}>
              <div className="flex items-center gap-1 py-1 pr-2">
                {t.es_critica && (
                  <span className="text-[10px] font-bold text-red-600">●</span>
                )}
                <span className="truncate text-xs text-slate-700" title={t.nombre}>
                  {t.nombre}
                </span>
              </div>
              <div className="relative flex items-center py-1">
                <div className="absolute inset-x-0 top-1/2 h-px bg-slate-100" />
                <div
                  className={`absolute h-4 rounded ${BAR_COLOR[t.status]} ${
                    t.es_critica ? 'ring-2 ring-red-500' : ''
                  }`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  title={`${t.nombre} · ${t.duracion_estimada_horas ?? '?'}h · ${t.porcentaje_completado}%`}
                >
                  <div
                    className="ml-auto h-full rounded-r bg-white/35"
                    style={{ width: `${100 - t.porcentaje_completado}%` }}
                  />
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

function fechaCorta(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function Leg({ c, t }: { c: string; t: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2 w-3 rounded-sm ${c}`} />
      {t}
    </span>
  )
}
