import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { getTareasByParada, updateTareaSchedule } from '../lib/api'
import type { Parada, Tarea, TaskStatus } from '../types'

const H = 3600000
const DAY = 86400000
const ROW = 30 // alto de fila px
const LEFT = 290 // ancho panel izquierdo px

const COLOR: Record<TaskStatus, string> = {
  Por_Hacer: '#94a3b8',
  En_Progreso: '#3b82f6',
  En_Revision: '#8b5cf6',
  Completada: '#10b981',
  Bloqueada: '#ef4444',
  Cancelada: '#cbd5e1',
}

interface Dates {
  s: number
  e: number
}
interface Grupo {
  nombre: string
  tareas: Tarea[]
  s: number
  e: number
}

export function GanttPage() {
  const { id } = useParams<{ id: string }>()
  const parada = useOutletContext<Parada | undefined>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<{ id: string; dS: number; dD: number } | null>(null)
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; x0: number; s0: number; d0: number; dh: number } | null>(null)

  useEffect(() => {
    if (!id) return
    getTareasByParada(id)
      .then(setTareas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  // --- Fechas por tarea (reales o sintetizadas secuencialmente) ---
  const fechas = useMemo(() => {
    const map: Record<string, Dates> = {}
    const hayReales = tareas.some((t) => t.fecha_inicio_prog && t.fecha_fin_prog)
    let cursor = parada?.fecha_inicio_planeada
      ? new Date(parada.fecha_inicio_planeada + 'T07:00:00').getTime()
      : Date.now()
    const orden = [...tareas].sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0))
    for (const t of orden) {
      if (t.fecha_inicio_prog && t.fecha_fin_prog) {
        map[t.id] = {
          s: new Date(t.fecha_inicio_prog).getTime(),
          e: new Date(t.fecha_fin_prog).getTime(),
        }
      } else if (!hayReales) {
        const dur = Number(t.duracion_estimada_horas ?? 1) * H
        map[t.id] = { s: cursor, e: cursor + dur }
        cursor += dur
      } else {
        map[t.id] = { s: cursor, e: cursor + Number(t.duracion_estimada_horas ?? 1) * H }
      }
    }
    return map
  }, [tareas, parada])

  // --- Agrupar por sistema ---
  const { grupos, base, totalDias, hourW } = useMemo(() => {
    const byG: Record<string, Tarea[]> = {}
    for (const t of tareas) {
      const g = (t.especificaciones_tecnicas?.sistema as string) || 'General'
      ;(byG[g] ??= []).push(t)
    }
    const grupos: Grupo[] = Object.entries(byG).map(([nombre, ts]) => {
      const ss = ts.map((t) => fechas[t.id]?.s).filter(Boolean) as number[]
      const ee = ts.map((t) => fechas[t.id]?.e).filter(Boolean) as number[]
      ts.sort((a, b) => (fechas[a.id]?.s ?? 0) - (fechas[b.id]?.s ?? 0))
      return { nombre, tareas: ts, s: Math.min(...ss), e: Math.max(...ee) }
    })
    grupos.sort((a, b) => a.s - b.s)
    const allS = Object.values(fechas).map((f) => f.s)
    const allE = Object.values(fechas).map((f) => f.e)
    const minS = allS.length ? Math.min(...allS) : Date.now()
    const maxE = allE.length ? Math.max(...allE) : minS + DAY
    const base = new Date(minS).setHours(0, 0, 0, 0)
    const totalDias = Math.max(1, Math.ceil((maxE - base) / DAY))
    const totalH = (totalDias * DAY) / H
    const hourW = Math.max(6, Math.min(24, Math.round(1500 / totalH)))
    return { grupos, base, totalDias, hourW }
  }, [tareas, fechas])

  const timelineW = totalDias * 24 * hourW
  const x = (ms: number) => ((ms - base) / H) * hourW

  // --- Drag editar ---
  function onDown(e: React.PointerEvent, t: Tarea, mode: 'move' | 'resize') {
    e.preventDefault()
    e.stopPropagation()
    const f = fechas[t.id]
    dragRef.current = { id: t.id, mode, x0: e.clientX, s0: f.s, d0: (f.e - f.s) / H, dh: 0 }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  function onMove(e: PointerEvent) {
    const d = dragRef.current
    if (!d) return
    d.dh = Math.round((e.clientX - d.x0) / hourW)
    setDraft({ id: d.id, dS: d.mode === 'move' ? d.dh : 0, dD: d.mode === 'resize' ? d.dh : 0 })
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const d = dragRef.current
    dragRef.current = null
    setDraft(null)
    if (!d || d.dh === 0) return
    let s = d.s0
    let dur = d.d0
    if (d.mode === 'move') s = d.s0 + d.dh * H
    else dur = Math.max(1, d.d0 + d.dh)
    const eMs = s + dur * H
    const sISO = new Date(s).toISOString()
    const eISO = new Date(eMs).toISOString()
    setTareas((ts) =>
      ts.map((t) =>
        t.id === d.id
          ? { ...t, fecha_inicio_prog: sISO, fecha_fin_prog: eISO, duracion_estimada_horas: dur }
          : t,
      ),
    )
    updateTareaSchedule(d.id, sISO, eISO, dur).catch((e) => setError(String(e)))
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando Gantt…</p>
  if (error)
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>
  if (tareas.length === 0) return <p className="text-sm text-slate-400">No hay tareas para graficar.</p>

  // columnas de día
  const dias = Array.from({ length: totalDias }, (_, i) => {
    const dms = base + i * DAY
    const d = new Date(dms)
    return { i, dms, label: d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }), wknd: [0, 6].includes(d.getDay()) }
  })
  const now = Date.now()
  const showNow = now >= base && now <= base + totalDias * DAY

  const filas: { tipo: 'g' | 't'; grupo: Grupo; tarea?: Tarea }[] = []
  for (const g of grupos) {
    filas.push({ tipo: 'g', grupo: g })
    if (!colapsados.has(g.nombre)) for (const t of g.tareas) filas.push({ tipo: 't', grupo: g, tarea: t })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Gantt · {tareas.length} tareas · {grupos.length} sistemas
        </h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="text-slate-400">Arrastra una barra para mover · borde derecho para alargar</span>
          {(['Por_Hacer', 'En_Progreso', 'Completada', 'Bloqueada'] as TaskStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: COLOR[s] }} />
              {s.replace('_', ' ')}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: '72vh' }}>
        <div style={{ width: LEFT + timelineW, minWidth: '100%' }}>
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
            <div className="sticky left-0 z-30 flex shrink-0 items-end bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400" style={{ width: LEFT }}>
              <span className="flex-1">Tarea</span>
              <span className="w-12 text-right">Dur</span>
              <span className="w-20 text-right">Inicio</span>
            </div>
            <div className="relative shrink-0" style={{ width: timelineW, height: 34 }}>
              {dias.map((d) => (
                <div key={d.i} className={`absolute top-0 h-full border-l ${d.wknd ? 'bg-slate-50' : ''} border-slate-100`} style={{ left: d.i * 24 * hourW, width: 24 * hourW }}>
                  <span className="absolute left-1 top-1 whitespace-nowrap text-[10px] font-medium text-slate-500">{d.label}</span>
                </div>
              ))}
              {showNow && <div className="absolute top-0 z-10 h-full w-px bg-red-400" style={{ left: x(now) }} />}
            </div>
          </div>

          {/* Filas */}
          {filas.map((f, idx) => {
            const yBg = idx % 2 ? 'bg-white' : 'bg-slate-50/40'
            if (f.tipo === 'g') {
              const g = f.grupo
              const col = colapsados.has(g.nombre)
              return (
                <div key={'g-' + g.nombre} className="flex border-b border-slate-100 bg-slate-100/60" style={{ height: ROW }}>
                  <button onClick={() => setColapsados((p) => { const n = new Set(p); n.has(g.nombre) ? n.delete(g.nombre) : n.add(g.nombre); return n })}
                    className="sticky left-0 z-10 flex shrink-0 items-center gap-1 bg-slate-100/95 px-3 text-left text-xs font-semibold text-slate-700" style={{ width: LEFT }}>
                    <span className="text-slate-400">{col ? '▸' : '▾'}</span>
                    <span className="flex-1 truncate" title={g.nombre}>{g.nombre}</span>
                    <span className="rounded-full bg-white px-1.5 text-[10px] text-slate-400">{g.tareas.length}</span>
                  </button>
                  <div className="relative shrink-0" style={{ width: timelineW }}>
                    <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-400/60" style={{ left: x(g.s), width: Math.max(x(g.e) - x(g.s), 4) }} />
                  </div>
                </div>
              )
            }
            const t = f.tarea!
            const fch = fechas[t.id]
            const dS = draft?.id === t.id ? draft.dS : 0
            const dD = draft?.id === t.id ? draft.dD : 0
            const left = x(fch.s) + dS * hourW
            const width = Math.max(x(fch.e) - x(fch.s) + dD * hourW, 6)
            return (
              <div key={t.id} className={`flex border-b border-slate-50 ${yBg}`} style={{ height: ROW }}>
                <div className="sticky left-0 z-10 flex shrink-0 items-center bg-inherit px-3" style={{ width: LEFT }}>
                  {t.es_critica && <span className="mr-1 text-[9px] text-red-500">●</span>}
                  <span className="flex-1 truncate pl-3 text-xs text-slate-700" title={t.nombre}>{t.nombre}</span>
                  <span className="w-12 text-right text-[11px] text-slate-400">{t.duracion_estimada_horas}h</span>
                  <span className="w-20 text-right text-[10px] text-slate-400">{new Date(fch.s).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })}</span>
                </div>
                <div className="relative shrink-0" style={{ width: timelineW }}>
                  {dias.map((d) => d.wknd && <div key={d.i} className="absolute top-0 h-full bg-slate-50" style={{ left: d.i * 24 * hourW, width: 24 * hourW }} />)}
                  <div
                    onPointerDown={(e) => onDown(e, t, 'move')}
                    className="group absolute top-1/2 flex h-4 -translate-y-1/2 cursor-grab items-center rounded active:cursor-grabbing"
                    style={{ left, width, background: COLOR[t.status], boxShadow: t.es_critica ? '0 0 0 2px #ef4444' : undefined }}
                    title={`${t.nombre}\n${new Date(fch.s).toLocaleString('es-PE')} → ${new Date(fch.e).toLocaleString('es-PE')}\n${t.porcentaje_completado}%`}
                  >
                    {t.porcentaje_completado > 0 && (
                      <div className="absolute left-0 top-0 h-full rounded-l bg-black/20" style={{ width: `${t.porcentaje_completado}%` }} />
                    )}
                    <div onPointerDown={(e) => onDown(e, t, 'resize')} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-black/0 group-hover:bg-black/15" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
