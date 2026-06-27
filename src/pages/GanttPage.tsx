import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { getTareasByParada, updateTareaSchedule } from '../lib/api'
import type { Parada, Tarea, TaskStatus } from '../types'

const H = 3600000
const DAY = 86400000
const ROW = 32
const HEAD = 46
const LEFT = 540

const COLOR: Record<TaskStatus, string> = {
  Por_Hacer: '#64748b',
  En_Progreso: '#2563eb',
  En_Revision: '#7c3aed',
  Completada: '#059669',
  Bloqueada: '#dc2626',
  Cancelada: '#cbd5e1',
}
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function hsl(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `hsl(${h} 55% 48%)`
}
const sysOf = (t: Tarea) => (t.especificaciones_tecnicas?.sistema as string) || 'General'
const grpOf = (t: Tarea) => (t.especificaciones_tecnicas?.grupo as string) || '—'
const tecOf = (t: Tarea) => (t.especificaciones_tecnicas?.tec as number) ?? ''

export function GanttPage() {
  const { id } = useParams<{ id: string }>()
  const parada = useOutletContext<Parada | undefined>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [colap, setColap] = useState<Set<string>>(new Set())
  const [colorMode, setColorMode] = useState<'sistema' | 'estado'>('sistema')
  const [verDeps, setVerDeps] = useState(true)
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1600)
  const [draft, setDraft] = useState<{ id: string; dS: number; dD: number } | null>(null)
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; x0: number; s0: number; d0: number; dh: number } | null>(null)

  useEffect(() => {
    if (!id) return
    getTareasByParada(id).then(setTareas).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [id])
  useEffect(() => {
    const f = () => setVw(window.innerWidth)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])

  const fechas = useMemo(() => {
    const m: Record<string, { s: number; e: number }> = {}
    for (const t of tareas)
      if (t.fecha_inicio_prog && t.fecha_fin_prog)
        m[t.id] = { s: new Date(t.fecha_inicio_prog).getTime(), e: new Date(t.fecha_fin_prog).getTime() }
    return m
  }, [tareas])

  const { grupos, base, totalDias, hourW } = useMemo(() => {
    const byG: Record<string, Tarea[]> = {}
    for (const t of tareas) (byG[sysOf(t)] ??= []).push(t)
    const grupos = Object.entries(byG).map(([nombre, ts]) => {
      ts.sort((a, b) => (fechas[a.id]?.s ?? 0) - (fechas[b.id]?.s ?? 0))
      const ss = ts.map((t) => fechas[t.id]?.s).filter(Boolean) as number[]
      const ee = ts.map((t) => fechas[t.id]?.e).filter(Boolean) as number[]
      return { nombre, tareas: ts, s: ss.length ? Math.min(...ss) : 0, e: ee.length ? Math.max(...ee) : 0 }
    })
    grupos.sort((a, b) => a.s - b.s)
    const allS = Object.values(fechas).map((f) => f.s)
    const allE = Object.values(fechas).map((f) => f.e)
    const minS = allS.length ? Math.min(...allS) : Date.now()
    const maxE = allE.length ? Math.max(...allE) : minS + DAY
    const base = new Date(minS).setHours(0, 0, 0, 0)
    const totalDias = Math.max(1, Math.ceil((maxE - base) / DAY))
    const disp = vw - LEFT - 120
    const hourW = Math.max(7, Math.min(40, Math.floor(disp / (totalDias * 24))))
    return { grupos, base, totalDias, hourW }
  }, [tareas, fechas, vw])

  const timelineW = totalDias * 24 * hourW
  const x = (ms: number) => ((ms - base) / H) * hourW

  // filas visibles + índice de fila por tarea
  const filas: { tipo: 'g' | 't'; g: typeof grupos[number]; t?: Tarea }[] = []
  const rowOf: Record<string, number> = {}
  for (const g of grupos) {
    filas.push({ tipo: 'g', g })
    if (!colap.has(g.nombre)) for (const t of g.tareas) { rowOf[t.id] = filas.length; filas.push({ tipo: 't', g, t }) }
  }
  const bodyH = filas.length * ROW

  // dependencias visibles
  const deps = tareas
    .filter((t) => t.bloqueado_por && rowOf[t.id] != null && rowOf[t.bloqueado_por] != null && fechas[t.id] && fechas[t.bloqueado_por])
    .map((t) => ({ from: t.bloqueado_por as string, to: t.id }))

  function onDown(e: React.PointerEvent, t: Tarea, mode: 'move' | 'resize') {
    e.preventDefault(); e.stopPropagation()
    const f = fechas[t.id]
    dragRef.current = { id: t.id, mode, x0: e.clientX, s0: f.s, d0: (f.e - f.s) / H, dh: 0 }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }
  function onMove(e: PointerEvent) {
    const d = dragRef.current; if (!d) return
    d.dh = Math.round((e.clientX - d.x0) / hourW)
    setDraft({ id: d.id, dS: d.mode === 'move' ? d.dh : 0, dD: d.mode === 'resize' ? d.dh : 0 })
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
    const d = dragRef.current; dragRef.current = null; setDraft(null)
    if (!d || d.dh === 0) return
    let s = d.s0, dur = d.d0
    if (d.mode === 'move') s = d.s0 + d.dh * H; else dur = Math.max(1, d.d0 + d.dh)
    const eMs = s + dur * H
    const sI = new Date(s).toISOString(), eI = new Date(eMs).toISOString()
    setTareas((ts) => ts.map((t) => (t.id === d.id ? { ...t, fecha_inicio_prog: sI, fecha_fin_prog: eI, duracion_estimada_horas: dur } : t)))
    updateTareaSchedule(d.id, sI, eI, dur).catch((e) => setError(String(e)))
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando Gantt…</p>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>
  if (tareas.length === 0) return <p className="text-sm text-slate-400">No hay tareas para graficar.</p>

  const fmtFull = (ms: number) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1} ${pad(d.getHours())}:${pad(d.getMinutes())}` }
  const dias = Array.from({ length: totalDias }, (_, i) => { const d = new Date(base + i * DAY); return { i, d } })
  const horasTick = hourW >= 22 ? 1 : hourW >= 12 ? 2 : hourW >= 9 ? 3 : 6

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          {parada?.nombre} · {tareas.length} act · {grupos.length} sistemas · {totalDias} días
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <button onClick={() => setVerDeps((v) => !v)} className={`rounded-md border px-2 py-0.5 ${verDeps ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500'}`}>Dependencias</button>
          <div className="flex overflow-hidden rounded-md border border-slate-200">
            {(['sistema', 'estado'] as const).map((m) => (
              <button key={m} onClick={() => setColorMode(m)} className={`px-2 py-0.5 capitalize ${colorMode === m ? 'bg-amber-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{m}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: '74vh' }}>
        <div className="relative" style={{ width: LEFT + timelineW, minWidth: '100%' }}>
          {/* ===== HEADER ===== */}
          <div className="sticky top-0 z-30 flex bg-white" style={{ height: HEAD }}>
            <div className="sticky left-0 z-40 flex shrink-0 items-stretch border-b border-r border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-400" style={{ width: LEFT }}>
              <Cell w={232} l>Actividad</Cell><Cell w={46}>Grupo</Cell><Cell w={36}>Téc</Cell><Cell w={40}>Hrs</Cell><Cell w={92}>Inicio</Cell><Cell w={92}>Fin</Cell>
            </div>
            <div className="relative shrink-0 border-b border-slate-200" style={{ width: timelineW }}>
              {dias.map(({ i, d }) => (
                <div key={i} className="absolute top-0 border-l border-slate-200" style={{ left: i * 24 * hourW, width: 24 * hourW, height: HEAD }}>
                  <div className="truncate px-1 pt-0.5 text-[11px] font-semibold text-slate-600">{DIAS[d.getDay()]} {d.getDate()} {MES[d.getMonth()]}</div>
                  <div className="relative" style={{ height: 18 }}>
                    {Array.from({ length: 24 }, (_, h) => h).filter((h) => h % horasTick === 0).map((h) => (
                      <span key={h} className="absolute top-0 text-[8px] text-slate-400" style={{ left: h * hourW + 1 }}>{pad(h)}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ===== BODY ===== */}
          <div className="relative" style={{ height: bodyH }}>
            {/* fondo: bandas de noche + líneas de hora */}
            <div className="absolute top-0" style={{ left: LEFT, width: timelineW, height: bodyH }}>
              {dias.map(({ i }) => (
                <div key={i}>
                  {/* noche 19:00-07:00 */}
                  <div className="absolute top-0 bg-slate-100/70" style={{ left: i * 24 * hourW, width: 7 * hourW, height: bodyH }} />
                  <div className="absolute top-0 bg-slate-100/70" style={{ left: (i * 24 + 19) * hourW, width: 5 * hourW, height: bodyH }} />
                  <div className="absolute top-0 border-l border-slate-200" style={{ left: i * 24 * hourW, height: bodyH }} />
                </div>
              ))}
            </div>

            {/* flechas de dependencia */}
            {verDeps && (
              <svg className="pointer-events-none absolute top-0 z-10" style={{ left: LEFT, width: timelineW, height: bodyH }}>
                <defs>
                  <marker id="ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" /></marker>
                </defs>
                {deps.map(({ from, to }, k) => {
                  const ff = fechas[from], tf = fechas[to]
                  const x1 = x(ff.e), y1 = (rowOf[from] - 0.5) * ROW
                  const x2 = x(tf.s), y2 = (rowOf[to] - 0.5) * ROW
                  const mx = Math.max(x1 + 8, x2 - 10)
                  return <path key={k} d={`M${x1},${y1} H${mx} V${y2} H${x2}`} fill="none" stroke="#f59e0b" strokeWidth="1.3" markerEnd="url(#ah)" opacity="0.8" />
                })}
              </svg>
            )}

            {/* filas */}
            {filas.map((f, idx) => {
              const top = idx * ROW
              if (f.tipo === 'g') {
                const col = colap.has(f.g.nombre)
                return (
                  <div key={'g' + f.g.nombre} className="absolute flex w-full border-b border-slate-100 bg-slate-100/70" style={{ top, height: ROW }}>
                    <button onClick={() => setColap((p) => { const n = new Set(p); n.has(f.g.nombre) ? n.delete(f.g.nombre) : n.add(f.g.nombre); return n })}
                      className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-slate-200 bg-slate-100 px-2 text-left text-xs font-semibold text-slate-700" style={{ width: LEFT }}>
                      <span className="text-slate-400">{col ? '▸' : '▾'}</span>
                      <span className="flex-1 truncate" title={f.g.nombre}>{f.g.nombre}</span>
                      <span className="rounded-full bg-white px-1.5 text-[10px] text-slate-400">{f.g.tareas.length}</span>
                    </button>
                    <div className="relative shrink-0" style={{ width: timelineW }}>
                      <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full" style={{ left: x(f.g.s), width: Math.max(x(f.g.e) - x(f.g.s), 4), background: hsl(f.g.nombre), opacity: 0.55 }} />
                    </div>
                  </div>
                )
              }
              const t = f.t!, fch = fechas[t.id]
              if (!fch) return null
              const dS = draft?.id === t.id ? draft.dS : 0
              const dD = draft?.id === t.id ? draft.dD : 0
              const left = x(fch.s) + dS * hourW
              const width = Math.max(x(fch.e) - x(fch.s) + dD * hourW, 5)
              const bg = colorMode === 'sistema' ? hsl(sysOf(t)) : COLOR[t.status]
              return (
                <div key={t.id} className={`absolute flex w-full border-b border-slate-50 ${idx % 2 ? 'bg-white' : 'bg-slate-50/30'}`} style={{ top, height: ROW }}>
                  <div className="sticky left-0 z-20 flex shrink-0 items-stretch border-r border-slate-200 bg-inherit text-[11px] text-slate-600" style={{ width: LEFT }}>
                    <Cell w={232} l>
                      <span className="mr-1 inline-block h-2 w-2 shrink-0 rounded-full align-middle" style={{ background: COLOR[t.status] }} />
                      <span className="truncate align-middle" title={t.nombre}>{t.nombre}</span>
                    </Cell>
                    <Cell w={46}><span className="rounded px-1 text-white" style={{ background: hsl(grpOf(t)) }}>{grpOf(t)}</span></Cell>
                    <Cell w={36}>{tecOf(t)}</Cell>
                    <Cell w={40}>{t.duracion_estimada_horas}h</Cell>
                    <Cell w={92}>{fmtFull(fch.s)}</Cell>
                    <Cell w={92}>{fmtFull(fch.e)}</Cell>
                  </div>
                  <div className="relative shrink-0" style={{ width: timelineW }}>
                    <div onPointerDown={(e) => onDown(e, t, 'move')} title={`${t.nombre}\n${fmtFull(fch.s)} → ${fmtFull(fch.e)} · ${t.duracion_estimada_horas}h · ${t.porcentaje_completado}%`}
                      className="group absolute top-1/2 z-10 flex h-[18px] -translate-y-1/2 cursor-grab items-center rounded shadow-sm active:cursor-grabbing"
                      style={{ left, width, background: bg, boxShadow: t.es_critica ? '0 0 0 2px #dc2626' : undefined }}>
                      {t.porcentaje_completado > 0 && <div className="absolute left-0 top-0 h-full rounded-l bg-black/25" style={{ width: `${t.porcentaje_completado}%` }} />}
                      <span className="pointer-events-none absolute left-1 truncate text-[9px] font-medium text-white/90" style={{ maxWidth: width - 8 }}>{grpOf(t)}</span>
                      <div onPointerDown={(e) => onDown(e, t, 'resize')} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-black/0 group-hover:bg-white/40" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
        <span>↔ Arrastra una barra para mover · borde derecho para alargar (se guarda)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-slate-100" />Turno noche</span>
        <span className="flex items-center gap-1"><svg width="22" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#f59e0b" strokeWidth="1.5" markerEnd="" /></svg>Dependencia</span>
      </div>
    </div>
  )
}

function Cell({ w, l, children }: { w: number; l?: boolean; children?: React.ReactNode }) {
  return <div className={`flex items-center overflow-hidden border-slate-100 px-1.5 ${l ? '' : 'justify-center border-l'}`} style={{ width: w }}>{children}</div>
}
function pad(n: number) { return String(n).padStart(2, '0') }
