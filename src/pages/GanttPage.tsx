import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { getTareasByParada, updateTareaSchedule } from '../lib/api'
import { colorGrupo, disciplina as discDe } from '../lib/palette'
import { rutaCritica } from '../lib/criticalPath'
import type { Parada, Tarea, TaskStatus } from '../types'

const H = 3600000
const DAY = 86400000
const ROW = 32
const HEAD = 46
const LEFT = 694

const COLOR: Record<TaskStatus, string> = {
  Por_Hacer: '#64748b', En_Progreso: '#2563eb', En_Revision: '#7c3aed',
  Completada: '#059669', Bloqueada: '#dc2626', Cancelada: '#cbd5e1',
}
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DISCIPLINAS = ['Todas', 'Mecánica', 'Eléctrica', 'Instrumentación'] as const

const sysOf = (t: Tarea) => (t.especificaciones_tecnicas?.sistema as string) || 'General'
const grpOf = (t: Tarea) => (t.especificaciones_tecnicas?.grupo as string) || '—'
const tecOf = (t: Tarea) => (t.especificaciones_tecnicas?.tec as number) ?? ''
const wbsOf = (t: Tarea) => (t.especificaciones_tecnicas?.wbs as string) || ''
const discOf = (t: Tarea) => discDe(`${t.nombre} ${sysOf(t)}`)
const pad = (n: number) => String(n).padStart(2, '0')

export function GanttPage() {
  const { id } = useParams<{ id: string }>()
  const parada = useOutletContext<Parada | undefined>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [colap, setColap] = useState<Set<string>>(new Set())
  const [colorMode, setColorMode] = useState<'sistema' | 'estado'>('sistema')
  const [groupBy, setGroupBy] = useState<'sistema' | 'disciplina'>('sistema')
  const [filtro, setFiltro] = useState<(typeof DISCIPLINAS)[number]>('Todas')
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

  const { criticas, holgura } = useMemo(() => rutaCritica(tareas), [tareas])
  const vis = useMemo(() => (filtro === 'Todas' ? tareas : tareas.filter((t) => discOf(t) === filtro)), [tareas, filtro])
  const keyDe = (t: Tarea) => (groupBy === 'disciplina' ? discOf(t) : sysOf(t))

  const fechas = useMemo(() => {
    const m: Record<string, { s: number; e: number }> = {}
    for (const t of vis)
      if (t.fecha_inicio_prog && t.fecha_fin_prog)
        m[t.id] = { s: new Date(t.fecha_inicio_prog).getTime(), e: new Date(t.fecha_fin_prog).getTime() }
    return m
  }, [vis])

  const { grupos, base, totalDias, hourW } = useMemo(() => {
    const byG: Record<string, Tarea[]> = {}
    for (const t of vis) (byG[keyDe(t)] ??= []).push(t)
    const grupos = Object.entries(byG).map(([nombre, ts]) => {
      ts.sort((a, b) => (fechas[a.id]?.s ?? 0) - (fechas[b.id]?.s ?? 0))
      const ss = ts.map((t) => fechas[t.id]?.s).filter(Boolean) as number[]
      const ee = ts.map((t) => fechas[t.id]?.e).filter(Boolean) as number[]
      return { nombre, tareas: ts, s: ss.length ? Math.min(...ss) : 0, e: ee.length ? Math.max(...ee) : 0 }
    })
    grupos.sort((a, b) => a.s - b.s)
    const allS = Object.values(fechas).map((f) => f.s), allE = Object.values(fechas).map((f) => f.e)
    const minS = allS.length ? Math.min(...allS) : Date.now()
    const maxE = allE.length ? Math.max(...allE) : minS + DAY
    const base = new Date(minS).setHours(0, 0, 0, 0)
    const totalDias = Math.max(1, Math.ceil((maxE - base) / DAY))
    const hourW = Math.max(7, Math.min(40, Math.floor((vw - LEFT - 120) / (totalDias * 24))))
    return { grupos, base, totalDias, hourW }
  }, [vis, fechas, vw, groupBy])

  const timelineW = totalDias * 24 * hourW
  const x = (ms: number) => ((ms - base) / H) * hourW

  const filas: { tipo: 'g' | 't'; g: typeof grupos[number]; t?: Tarea }[] = []
  const rowOf: Record<string, number> = {}
  for (const g of grupos) {
    filas.push({ tipo: 'g', g })
    if (!colap.has(g.nombre)) for (const t of g.tareas) { rowOf[t.id] = filas.length; filas.push({ tipo: 't', g, t }) }
  }
  const bodyH = filas.length * ROW
  const secById: Record<string, number> = {}
  for (const t of tareas) secById[t.id] = t.secuencia ?? 0
  const deps = vis
    .filter((t) => t.bloqueado_por && rowOf[t.id] != null && rowOf[t.bloqueado_por] != null && fechas[t.id] && fechas[t.bloqueado_por])
    .map((t) => ({ from: t.bloqueado_por as string, to: t.id, crit: criticas.has(t.id) && criticas.has(t.bloqueado_por as string) }))

  const horas = totalDias * 24
  const histo = new Array(horas).fill(0)
  for (const t of vis) {
    const f = fechas[t.id]; if (!f) continue
    const tec = Number((t.especificaciones_tecnicas?.tec as number) ?? 0)
    for (let h = Math.max(0, Math.floor((f.s - base) / H)); h < Math.min(horas, Math.ceil((f.e - base) / H)); h++) histo[h] += tec
  }
  const peak = Math.max(1, ...histo)

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
    const eMs = s + dur * H, sI = new Date(s).toISOString(), eI = new Date(eMs).toISOString()
    setTareas((ts) => ts.map((t) => (t.id === d.id ? { ...t, fecha_inicio_prog: sI, fecha_fin_prog: eI, duracion_estimada_horas: dur } : t)))
    updateTareaSchedule(d.id, sI, eI, dur).catch((e) => setError(String(e)))
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando Gantt…</p>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>
  if (tareas.length === 0) return <p className="text-sm text-slate-400">No hay tareas para graficar.</p>

  const fmt = (ms: number) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1} ${pad(d.getHours())}:${pad(d.getMinutes())}` }
  const dias = Array.from({ length: totalDias }, (_, i) => { const d = new Date(base + i * DAY); return { i, d } })
  const hTick = hourW >= 22 ? 1 : hourW >= 12 ? 2 : hourW >= 9 ? 3 : 6
  const colBar = (t: Tarea) => (colorMode === 'sistema' ? colorGrupo(keyDe(t)) : COLOR[t.status])

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">{parada?.nombre} · {vis.length} act · {criticas.size} críticas</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <label className="flex items-center gap-1">Agrupar:
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'sistema' | 'disciplina')} className="rounded border border-slate-200 px-1 py-0.5">
              <option value="sistema">Área</option><option value="disciplina">Disciplina</option>
            </select>
          </label>
          <label className="flex items-center gap-1">Disciplina:
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as (typeof DISCIPLINAS)[number])} className="rounded border border-slate-200 px-1 py-0.5">
              {DISCIPLINAS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <button onClick={() => setVerDeps((v) => !v)} className={`rounded-md border px-2 py-0.5 ${verDeps ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white'}`}>Dependencias</button>
          <div className="flex overflow-hidden rounded-md border border-slate-200">
            {(['sistema', 'estado'] as const).map((m) => <button key={m} onClick={() => setColorMode(m)} className={`px-2 py-0.5 capitalize ${colorMode === m ? 'bg-amber-500 text-white' : 'bg-white text-slate-500'}`}>{m}</button>)}
          </div>
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: '74vh' }}>
        <div className="relative" style={{ width: LEFT + timelineW, minWidth: '100%' }}>
          {/* HEADER */}
          <div className="sticky top-0 z-30 flex bg-white" style={{ height: HEAD }}>
            <div className="sticky left-0 z-40 flex shrink-0 items-stretch border-b border-r border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-400" style={{ width: LEFT }}>
              <Cell w={32}>#</Cell><Cell w={178} l>Actividad</Cell><Cell w={52}>WBS</Cell><Cell w={86}>Disciplina</Cell><Cell w={42}>Grp</Cell><Cell w={30}>Téc</Cell><Cell w={32}>Hrs</Cell><Cell w={82}>Comienzo</Cell><Cell w={82}>Fin</Cell><Cell w={44}>Pred</Cell><Cell w={34}>%</Cell>
            </div>
            <div className="relative shrink-0 border-b border-slate-200" style={{ width: timelineW }}>
              {dias.map(({ i, d }) => (
                <div key={i} className="absolute top-0 border-l border-slate-200" style={{ left: i * 24 * hourW, width: 24 * hourW, height: HEAD }}>
                  <div className="truncate px-1 pt-0.5 text-[11px] font-semibold text-slate-600">{DIAS[d.getDay()]} {d.getDate()} {MES[d.getMonth()]}</div>
                  <div className="relative" style={{ height: 18 }}>
                    {Array.from({ length: 24 }, (_, h) => h).filter((h) => h % hTick === 0).map((h) => <span key={h} className="absolute top-0 text-[8px] text-slate-400" style={{ left: h * hourW + 1 }}>{pad(h)}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* BODY */}
          <div className="relative" style={{ height: bodyH }}>
            <div className="absolute top-0" style={{ left: LEFT, width: timelineW, height: bodyH }}>
              {dias.map(({ i }) => (
                <div key={i}>
                  <div className="absolute top-0 bg-slate-100/70" style={{ left: i * 24 * hourW, width: 7 * hourW, height: bodyH }} />
                  <div className="absolute top-0 bg-slate-100/70" style={{ left: (i * 24 + 19) * hourW, width: 5 * hourW, height: bodyH }} />
                  <div className="absolute top-0 border-l border-slate-200" style={{ left: i * 24 * hourW, height: bodyH }} />
                </div>
              ))}
            </div>

            {verDeps && (
              <svg className="pointer-events-none absolute top-0 z-10" style={{ left: LEFT, width: timelineW, height: bodyH }}>
                <defs><marker id="ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" /></marker>
                  <marker id="ahc" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#dc2626" /></marker></defs>
                {deps.map(({ from, to, crit }, k) => {
                  const ff = fechas[from], tf = fechas[to]
                  const x1 = x(ff.e), y1 = (rowOf[from] - 0.5) * ROW, x2 = x(tf.s), y2 = (rowOf[to] - 0.5) * ROW
                  const mx = Math.max(x1 + 8, x2 - 10)
                  return <path key={k} d={`M${x1},${y1} H${mx} V${y2} H${x2}`} fill="none" stroke={crit ? '#dc2626' : '#f59e0b'} strokeWidth={crit ? 1.8 : 1.3} markerEnd={`url(#${crit ? 'ahc' : 'ah'})`} opacity="0.85" />
                })}
              </svg>
            )}

            {filas.map((f, idx) => {
              const top = idx * ROW
              if (f.tipo === 'g') {
                const col = colap.has(f.g.nombre)
                return (
                  <div key={'g' + f.g.nombre} className="absolute flex w-full border-b border-slate-100 bg-slate-100/70" style={{ top, height: ROW }}>
                    <button onClick={() => setColap((p) => { const n = new Set(p); n.has(f.g.nombre) ? n.delete(f.g.nombre) : n.add(f.g.nombre); return n })}
                      className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-slate-200 bg-slate-100 px-2 text-left text-xs font-semibold text-slate-700" style={{ width: LEFT }}>
                      <span className="h-3 w-1 rounded" style={{ background: colorGrupo(f.g.nombre) }} />
                      <span className="text-slate-400">{col ? '▸' : '▾'}</span>
                      <span className="flex-1 truncate" title={f.g.nombre}>{f.g.nombre}</span>
                      <span className="rounded-full bg-white px-1.5 text-[10px] text-slate-400">{f.g.tareas.length}</span>
                    </button>
                    <div className="relative shrink-0" style={{ width: timelineW }}>
                      <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded" style={{ left: x(f.g.s), width: Math.max(x(f.g.e) - x(f.g.s), 4), background: colorGrupo(f.g.nombre), opacity: 0.45 }} />
                    </div>
                  </div>
                )
              }
              const t = f.t!, fch = fechas[t.id]; if (!fch) return null
              const crit = criticas.has(t.id)
              const hito = Number(t.duracion_estimada_horas ?? 0) <= 0
              const dS = draft?.id === t.id ? draft.dS : 0, dD = draft?.id === t.id ? draft.dD : 0
              const left = x(fch.s) + dS * hourW
              const width = Math.max(x(fch.e) - x(fch.s) + dD * hourW, 5)
              return (
                <div key={t.id} className={`absolute flex w-full border-b border-slate-50 ${idx % 2 ? 'bg-white' : 'bg-slate-50/30'}`} style={{ top, height: ROW }}>
                  <div className="sticky left-0 z-20 flex shrink-0 items-stretch border-r border-slate-200 bg-inherit text-[11px] text-slate-600" style={{ width: LEFT }}>
                    <Cell w={32}><span className="text-slate-400">{t.secuencia}</span></Cell>
                    <Cell w={178} l>
                      {crit && <span className="mr-1 text-[10px] font-bold text-red-600" title="Ruta crítica">◆</span>}
                      <span className="mr-1 inline-block h-2 w-2 shrink-0 rounded-full align-middle" style={{ background: COLOR[t.status] }} />
                      <span className="truncate align-middle" title={t.nombre}>{t.nombre}</span>
                    </Cell>
                    <Cell w={52}>{wbsOf(t)}</Cell>
                    <Cell w={86}><span className="text-[10px]">{discOf(t)}</span></Cell>
                    <Cell w={42}><span className="rounded px-1 text-white" style={{ background: colorGrupo(sysOf(t)) }}>{grpOf(t)}</span></Cell>
                    <Cell w={30}>{tecOf(t)}</Cell>
                    <Cell w={32}>{t.duracion_estimada_horas}h</Cell>
                    <Cell w={82}>{fmt(fch.s)}</Cell>
                    <Cell w={82}>{fmt(fch.e)}</Cell>
                    <Cell w={44}>{t.bloqueado_por ? `#${secById[t.bloqueado_por]}` : ''}</Cell>
                    <Cell w={34}>{t.porcentaje_completado}%</Cell>
                  </div>
                  <div className="relative shrink-0" style={{ width: timelineW }}>
                    {hito ? (
                      <div onPointerDown={(e) => onDown(e, t, 'move')} title={`${t.nombre} (hito)`} className="absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab bg-slate-800" style={{ left }} />
                    ) : (
                      <div onPointerDown={(e) => onDown(e, t, 'move')} title={`${t.nombre}\n${fmt(fch.s)} → ${fmt(fch.e)} · ${t.duracion_estimada_horas}h · ${t.porcentaje_completado}%\nHolgura: ${holgura[t.id] ?? '?'}h${crit ? ' · CRÍTICA' : ''}`}
                        className="group absolute top-1/2 z-10 flex h-[18px] -translate-y-1/2 cursor-grab items-center rounded shadow-sm active:cursor-grabbing"
                        style={{ left, width, background: colBar(t), boxShadow: crit ? '0 0 0 2px #dc2626' : undefined }}>
                        {t.porcentaje_completado > 0 && <div className="absolute left-0 top-0 h-full rounded-l bg-black/25" style={{ width: `${t.porcentaje_completado}%` }} />}
                        <span className="pointer-events-none absolute left-1 truncate text-[9px] font-medium text-white/90" style={{ maxWidth: width - 8 }}>{grpOf(t)}</span>
                        <div onPointerDown={(e) => onDown(e, t, 'resize')} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-black/0 group-hover:bg-white/40" />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* HISTOGRAMA */}
          <div className="sticky bottom-0 z-30 flex border-t-2 border-slate-300 bg-white" style={{ height: 70 }}>
            <div className="sticky left-0 z-40 flex shrink-0 flex-col justify-center border-r border-slate-200 bg-slate-50 px-2 text-[10px] font-semibold uppercase leading-tight text-slate-500" style={{ width: LEFT }}>
              <span>Técnicos / hora</span><span className="text-[11px] font-bold text-amber-600">Pico: {peak} téc</span>
              <span className="text-[9px] font-normal normal-case text-slate-400">rojo = supera 21 (cuadrilla C4)</span>
            </div>
            <div className="relative shrink-0" style={{ width: timelineW }}>
              {histo.map((c, h) => c > 0 ? <div key={h} className="absolute bottom-3.5" style={{ left: h * hourW, width: Math.max(hourW - 1, 2) }}><div className="mx-auto w-[80%] rounded-t" style={{ height: Math.max((c / peak) * 46, 2), background: c > 21 ? '#dc2626' : c > peak * 0.66 ? '#f59e0b' : '#10b981' }} /></div> : null)}
              {histo.map((c, h) => h % hTick === 0 && c > 0 ? <span key={'n' + h} className="absolute bottom-0 text-[8px] font-medium text-slate-500" style={{ left: h * hourW + 1 }}>{c}</span> : null)}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
        <span>↔ Arrastra para mover · borde derecho para alargar (se guarda)</span>
        <span className="flex items-center gap-1"><span className="text-red-600">◆</span> Ruta crítica</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rotate-45 bg-slate-800" /> Hito</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-slate-100" /> Turno noche</span>
      </div>
    </div>
  )
}

function Cell({ w, l, children }: { w: number; l?: boolean; children?: React.ReactNode }) {
  return <div className={`flex items-center overflow-hidden border-slate-100 px-1.5 ${l ? '' : 'justify-center border-l'}`} style={{ width: w }}>{children}</div>
}
