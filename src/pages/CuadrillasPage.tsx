import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { getTareasByParada, updateTareaEspec, updateTareaSchedule, getCuadrillasConfig, setCuadrillasConfig, getUsuarios } from '../lib/api'
import { balancearCuadrillas, resolverCuadrillas, choquesPersona, choquesCuadrilla, especialidadRequerida, tramosTrabajo, tieneEspera } from '../lib/resourceLeveling'
import type { Tecnico } from '../lib/resourceLeveling'
import { colorGrupo } from '../lib/palette'
import { useRefreshOnFocus } from '../lib/useRefreshOnFocus'
import { PuenteGruaPanel } from '../components/PuenteGruaPanel'
import { useColWidth, ColResizeHandle } from '../components/ColResize'
import type { Parada, Tarea } from '../types'

type CrewCfg = { cap?: number; turno?: string; tecnicos?: Tecnico[] }

const H = 3600000
const DAY = 86400000
const SUB = 22
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const sysOf = (t: Tarea) => (t.especificaciones_tecnicas?.sistema as string) || 'General'
const grpOf = (t: Tarea) => (t.especificaciones_tecnicas?.grupo as string) || '—'
const turnoOf = (t: Tarea): 'D' | 'N' => { const dn = (t.especificaciones_tecnicas?.turno_dn as string) || ''; return (dn ? dn.toUpperCase().startsWith('N') : (t.turno_asignado || '').toLowerCase().startsWith('n')) ? 'N' : 'D' }
const lineaOf = (t: Tarea) => String(t.especificaciones_tecnicas?.linea ?? '').trim()
const tecOf = (t: Tarea) => { const n = Number((t.especificaciones_tecnicas?.tec as number) ?? 0); return Number.isFinite(n) ? Math.max(0, n) : 0 }
const pad = (n: number) => String(n).padStart(2, '0')

interface Item { t: Tarea; s: number; e: number; lane: number; conflict: boolean }
interface Crew { nombre: string; items: Item[]; nSub: number; util: number; hh: number; peak: number; conflictos: number }

export function CuadrillasPage() {
  const { id } = useParams<{ id: string }>()
  const parada = useOutletContext<Parada | undefined>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mover, setMover] = useState<Tarea | null>(null)
  const [config, setConfig] = useState<Record<string, CrewCfg>>({})
  const [snapGrupos, setSnapGrupos] = useState<Record<string, string> | null>(null)
  const [snapFechas, setSnapFechas] = useState<Record<string, { s: number; e: number }> | null>(null)
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1600)
  const [usuarios, setUsuarios] = useState<Tecnico[]>([])
  const [rosterCrew, setRosterCrew] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; x0: number; s0: number; dur: number; dH: number; moved: boolean } | null>(null)
  const [draft, setDraft] = useState<{ id: string; dH: number } | null>(null)
  const [turnoF, setTurnoF] = useState<'Todos' | 'D' | 'N'>('Todos')
  const [lineaF, setLineaF] = useState('Todas')
  // Ancho (arrastrable, recordado) del panel izquierdo de cuadrillas.
  const { w: LEFT, onResize: onLeftResize } = useColWidth('cuad-left-w', 230, 140, 520)

  const reloadTareas = () => {
    if (!id) return Promise.resolve()
    return getTareasByParada(id).then(setTareas).catch((e) => setError(e.message))
  }
  useEffect(() => {
    if (!id) return
    setLoading(true)
    reloadTareas().finally(() => setLoading(false))
    getCuadrillasConfig(id).then(setConfig).catch(() => {})
    getUsuarios().then(setUsuarios).catch(() => {})
  }, [id])
  useRefreshOnFocus(reloadTareas)

  function setCap(crew: string, cap?: number) {
    const next = { ...config, [crew]: { ...config[crew], cap } }
    setConfig(next)
    if (id) setCuadrillasConfig(id, next).catch((e) => setError(String(e)))
  }
  function setRoster(crew: string, tecnicos: Tecnico[]) {
    // El roster define también la capacidad (cuántos frentes en paralelo).
    const next = { ...config, [crew]: { ...config[crew], tecnicos, cap: tecnicos.length || config[crew]?.cap } }
    setConfig(next)
    if (id) setCuadrillasConfig(id, next).catch((e) => setError(String(e)))
  }
  // Operadores del puente grúa (1 por turno), guardados en claves reservadas del
  // config — no se muestran como cuadrillas porque las cuadrillas salen de task.grupo.
  const gruaOps = { D: config['__gruaDia']?.tecnicos?.[0]?.nombre ?? '', N: config['__gruaNoche']?.tecnicos?.[0]?.nombre ?? '' }
  function renombrarOpGrua(turno: 'D' | 'N', nombre: string) {
    const key = turno === 'D' ? '__gruaDia' : '__gruaNoche'
    const next = { ...config, [key]: { tecnicos: nombre ? [{ id: key, nombre, rol: 'Operador grúa' }] : [] } }
    setConfig(next)
    if (id) setCuadrillasConfig(id, next).catch((e) => setError(String(e)))
  }
  function quitarTecnico(crew: string, tid: string) {
    setRoster(crew, (config[crew]?.tecnicos ?? []).filter((u) => u.id !== tid))
  }
  useEffect(() => {
    const f = () => setVw(window.innerWidth)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])

  const lineas = useMemo(() => [...new Set(tareas.map(lineaOf).filter(Boolean))].sort(), [tareas])
  // Personal pico (técnicos en paralelo) y HH por LÍNEA — responde "cuánta gente
  // necesito para L1 y para L2". Ignora el filtro de línea (siempre muestra todas).
  const personalPorLinea = useMemo(() => {
    const fch = (t: Tarea) => ({ s: new Date(t.fecha_inicio_prog!).getTime(), e: new Date(t.fecha_fin_prog!).getTime() })
    const dated = tareas.filter((t) => t.fecha_inicio_prog && t.fecha_fin_prog && (turnoF === 'Todos' || turnoOf(t) === turnoF))
    if (!dated.length || !lineas.length) return []
    const base = Math.min(...dated.map((t) => fch(t).s)), maxE = Math.max(...dated.map((t) => fch(t).e))
    const horas = Math.max(1, Math.ceil((maxE - base) / H))
    return lineas.map((ln) => {
      const ts = dated.filter((t) => lineaOf(t) === ln)
      const arr = new Array(horas).fill(0)
      let hh = 0
      for (const t of ts) {
        const tec = tecOf(t)
        hh += tec * Number(t.duracion_estimada_horas ?? 0)
        for (const tr of (tieneEspera(t) ? tramosTrabajo(t) : [fch(t)]))
          for (let h = Math.max(0, Math.floor((tr.s - base) / H)); h < Math.min(horas, Math.ceil((tr.e - base) / H)); h++) arr[h] += tec
      }
      return { linea: ln, pico: Math.max(0, ...arr), hh: Math.round(hh), tareas: ts.length }
    })
  }, [tareas, turnoF, lineas])

  // Balance de los 2 turnos de 12h (objetivo central de la parada): ¿está la carga
  // repartida entre Día y Noche, o el turno noche está infrautilizado y alarga la
  // parada? Respeta el filtro de línea, ignora el de turno (compara ambos). HH = téc×h.
  const cargaTurno = useMemo(() => {
    const acc = { D: { n: 0, hh: 0 }, N: { n: 0, hh: 0 } }
    for (const t of tareas) {
      if (lineaF !== 'Todas' && lineaOf(t) !== lineaF) continue
      const k = turnoOf(t)
      acc[k].n++
      acc[k].hh += tecOf(t) * Number(t.duracion_estimada_horas ?? 0)
    }
    const total = acc.D.hh + acc.N.hh
    const pctN = total ? Math.round((acc.N.hh / total) * 100) : 0
    return { D: acc.D, N: acc.N, total: Math.round(total), pctN }
  }, [tareas, lineaF])

  const { crews, base, totalDias, hourW, totalConf, histo, peakHisto, totalHH, choquePers, espPeak } = useMemo(() => {
    const dated = tareas.filter((t) => t.fecha_inicio_prog && t.fecha_fin_prog && (turnoF === 'Todos' || turnoOf(t) === turnoF) && (lineaF === 'Todas' || lineaOf(t) === lineaF))
    const fch = (t: Tarea) => ({ s: new Date(t.fecha_inicio_prog!).getTime(), e: new Date(t.fecha_fin_prog!).getTime() })
    const allS = dated.map((t) => fch(t).s), allE = dated.map((t) => fch(t).e)
    const minS = allS.length ? Math.min(...allS) : Date.now()
    const maxE = allE.length ? Math.max(...allE) : minS + DAY
    const base = new Date(minS).setHours(0, 0, 0, 0)
    const totalDias = Math.max(1, Math.ceil((maxE - base) / DAY))
    const winH = Math.max(1, (maxE - minS) / H)
    const hourW = Math.max(5, Math.min(36, Math.floor((vw - LEFT - 120) / (totalDias * 24))))

    const byC: Record<string, Tarea[]> = {}
    for (const t of dated) (byC[grpOf(t)] ??= []).push(t)
    // Choques de cuadrilla (trabajo real, sin contar esperas) — única fuente de verdad,
    // compartida con el control de Ruta crítica.
    const choqueCuad = choquesCuadrilla(dated).ids
    const crews: Crew[] = Object.entries(byC).map(([nombre, ts]) => {
      const its = ts.map((t) => ({ t, ...fch(t) })).sort((a, b) => a.s - b.s)
      // sub-filas (interval partitioning)
      const laneEnd: number[] = []
      const items: Item[] = its.map((it) => {
        let lane = laneEnd.findIndex((end) => end <= it.s)
        if (lane === -1) { lane = laneEnd.length }
        laneEnd[lane] = it.e
        return { ...it, lane, conflict: choqueCuad.has(it.t.id) }
      })
      const conflictos = items.filter((x) => x.conflict).length
      // utilización (unión de intervalos)
      const sorted = [...items].sort((a, b) => a.s - b.s)
      let busy = 0, curS = -1, curE = -1
      for (const it of sorted) {
        if (it.s > curE) { if (curE > curS) busy += curE - curS; curS = it.s; curE = it.e }
        else curE = Math.max(curE, it.e)
      }
      if (curE > curS) busy += curE - curS
      const hh = items.reduce((s, it) => s + tecOf(it.t) * Number(it.t.duracion_estimada_horas ?? 0), 0)
      // pico de técnicos concurrentes en la cuadrilla
      const ev: [number, number][] = []
      for (const it of items) { ev.push([it.s, tecOf(it.t)]); ev.push([it.e, -tecOf(it.t)]) }
      ev.sort((a, b) => a[0] - b[0])
      let cur = 0, peak = 0
      for (const [, d] of ev) { cur += d; if (cur > peak) peak = cur }
      return { nombre, items, nSub: Math.max(1, laneEnd.length), util: Math.round((busy / H / winH) * 100), hh, peak, conflictos }
    })
    crews.sort((a, b) => gnum(a.nombre) - gnum(b.nombre))
    const totalConf = crews.reduce((s, c) => s + c.conflictos, 0)
    // Perfil de técnicos/hora en TODA la parada (suma de téc de tareas solapadas)
    const horas = totalDias * 24
    // Cuenta técnicos solo durante el TRABAJO real (no la espera de tareas con apertura/cierre).
    const tramosDe = (t: Tarea) => (tieneEspera(t) ? tramosTrabajo(t) : [fch(t)])
    const histo = new Array(horas).fill(0)
    for (const t of dated) {
      const tec = tecOf(t)
      for (const tr of tramosDe(t))
        for (let h = Math.max(0, Math.floor((tr.s - base) / H)); h < Math.min(horas, Math.ceil((tr.e - base) / H)); h++) histo[h] += tec
    }
    const totalHH = dated.reduce((s, t) => s + tecOf(t) * Number(t.duracion_estimada_horas ?? 0), 0)
    // P4 — demanda PICO por especialidad (la que infiere cada tarea × nº de téc)
    const espHora: Record<string, number[]> = {}
    for (const t of dated) {
      const esp = especialidadRequerida(t) ?? 'Mecánico', tec = tecOf(t)
      const arr = (espHora[esp] ??= new Array(horas).fill(0))
      for (const tr of tramosDe(t))
        for (let h = Math.max(0, Math.floor((tr.s - base) / H)); h < Math.min(horas, Math.ceil((tr.e - base) / H)); h++) arr[h] += tec
    }
    const espPeak = Object.entries(espHora).map(([esp, arr]) => ({ esp, pico: Math.max(0, ...arr) })).filter((e) => e.pico > 0).sort((a, b) => b.pico - a.pico)
    // S2 — choques de PERSONA (mismo técnico nominado en dos tareas solapadas)
    const choquePers = choquesPersona(dated).ids
    return { crews, base, totalDias, hourW, totalConf, histo, peakHisto: Math.max(1, ...histo), totalHH, choquePers, espPeak }
  }, [tareas, vw, turnoF, lineaF, LEFT])

  const timelineW = totalDias * 24 * hourW
  const x = (ms: number) => ((ms - base) / H) * hourW

  function onBarDown(e: React.PointerEvent, t: Tarea) {
    e.preventDefault()
    const f = { s: new Date(t.fecha_inicio_prog!).getTime(), e: new Date(t.fecha_fin_prog!).getTime() }
    dragRef.current = { id: t.id, x0: e.clientX, s0: f.s, dur: (f.e - f.s) / H, dH: 0, moved: false }
    window.addEventListener('pointermove', onBarMove); window.addEventListener('pointerup', onBarUp)
  }
  function onBarMove(e: PointerEvent) {
    const d = dragRef.current; if (!d) return
    d.dH = Math.round((e.clientX - d.x0) / hourW)
    if (Math.abs(e.clientX - d.x0) > 3) d.moved = true
    setDraft({ id: d.id, dH: d.dH })
  }
  function onBarUp() {
    window.removeEventListener('pointermove', onBarMove); window.removeEventListener('pointerup', onBarUp)
    const d = dragRef.current; dragRef.current = null; setDraft(null)
    if (!d) return
    if (!d.moved) { const t = tareas.find((x) => x.id === d.id); if (t) setMover(t); return } // clic simple → reasignar
    if (d.dH === 0) return
    const s = d.s0 + d.dH * H, sI = new Date(s).toISOString(), eI = new Date(s + d.dur * H).toISOString()
    setTareas((ts) => ts.map((t) => (t.id === d.id ? { ...t, fecha_inicio_prog: sI, fecha_fin_prog: eI } : t)))
    updateTareaSchedule(d.id, sI, eI, Math.max(1, d.dur)).catch((e) => setError(String(e)))
  }

  function balancear() {
    const map = balancearCuadrillas(tareas)
    const cambios = tareas.filter((t) => map[t.id] && map[t.id] !== grpOf(t))
    if (!cambios.length) { setError('Ya está balanceado (sin cambios).'); return }
    const snap: Record<string, string> = {}
    for (const t of cambios) snap[t.id] = grpOf(t)
    setSnapGrupos(snap)
    setTareas((ts) => ts.map((t) => (map[t.id] && map[t.id] !== grpOf(t) ? { ...t, especificaciones_tecnicas: { ...(t.especificaciones_tecnicas ?? {}), grupo: map[t.id] } } : t)))
    Promise.all(cambios.map((t) => updateTareaEspec(t.id, { ...(t.especificaciones_tecnicas ?? {}), grupo: map[t.id] }))).catch((e) => setError(String(e)))
  }
  function resolverChoques() {
    const dated = tareas.filter((t) => t.fecha_inicio_prog && t.fecha_fin_prog)
    if (!dated.length) return
    const baseMs = Math.min(...dated.map((t) => new Date(t.fecha_inicio_prog!).getTime()))
    const capsCfg = Object.fromEntries(Object.entries(config).filter(([, v]) => v.cap).map(([k, v]) => [k, v.cap as number]))
    const snap: Record<string, { s: number; e: number }> = {}
    for (const t of dated) snap[t.id] = { s: new Date(t.fecha_inicio_prog!).getTime(), e: new Date(t.fecha_fin_prog!).getTime() }
    const res = resolverCuadrillas(dated, capsCfg, baseMs)
    setSnapFechas(snap)
    setTareas((ts) => ts.map((t) => (res[t.id] ? { ...t, fecha_inicio_prog: new Date(res[t.id].s).toISOString(), fecha_fin_prog: new Date(res[t.id].e).toISOString() } : t)))
    Promise.all(dated.map((t) => updateTareaSchedule(t.id, new Date(res[t.id].s).toISOString(), new Date(res[t.id].e).toISOString(), Math.max(1, (res[t.id].e - res[t.id].s) / 3600000)))).catch((e) => setError(String(e)))
  }
  function deshacerFechas() {
    if (!snapFechas) return
    const snap = snapFechas
    setTareas((ts) => ts.map((t) => (snap[t.id] ? { ...t, fecha_inicio_prog: new Date(snap[t.id].s).toISOString(), fecha_fin_prog: new Date(snap[t.id].e).toISOString() } : t)))
    Promise.all(Object.entries(snap).map(([idt, v]) => updateTareaSchedule(idt, new Date(v.s).toISOString(), new Date(v.e).toISOString(), Math.max(1, (v.e - v.s) / 3600000)))).catch((e) => setError(String(e)))
    setSnapFechas(null)
  }
  function deshacerBalance() {
    if (!snapGrupos) return
    const snap = snapGrupos
    setTareas((ts) => ts.map((t) => (snap[t.id] ? { ...t, especificaciones_tecnicas: { ...(t.especificaciones_tecnicas ?? {}), grupo: snap[t.id] } } : t)))
    Promise.all(Object.entries(snap).map(([idt, g]) => { const t = tareas.find((x) => x.id === idt); return t ? updateTareaEspec(idt, { ...(t.especificaciones_tecnicas ?? {}), grupo: g }) : Promise.resolve() })).catch((e) => setError(String(e)))
    setSnapGrupos(null)
  }

  async function reasignar(g: string) {
    if (!mover) return
    const espec = { ...(mover.especificaciones_tecnicas ?? {}), grupo: g }
    setTareas((ts) => ts.map((t) => (t.id === mover.id ? { ...t, especificaciones_tecnicas: espec } : t)))
    updateTareaEspec(mover.id, espec).catch((e) => setError(String(e)))
    setMover(null)
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando cuadrillas…</p>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>

  const dias = Array.from({ length: totalDias }, (_, i) => ({ i, d: new Date(base + i * DAY) }))
  const hTick = hourW >= 18 ? 2 : hourW >= 10 ? 3 : 6
  const crewList = [...new Set(tareas.map(grpOf))].filter((g) => g !== '—').sort((a, b) => gnum(a) - gnum(b))

  return (
    <div className="grid gap-4">
      <PuenteGruaPanel tareas={tareas} opDia={gruaOps.D} opNoche={gruaOps.N} onRename={renombrarOpGrua} />
      {personalPorLinea.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">👷 Personal necesario por línea {turnoF !== 'Todos' && <span className="text-xs font-normal text-indigo-600">(turno {turnoF === 'D' ? 'Día' : 'Noche'})</span>}</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {personalPorLinea.map((l) => (
              <div key={l.linea} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">{l.linea}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span title="Técnicos máximos trabajando a la vez (lo que debes movilizar)"><b className="text-base text-amber-600">{l.pico}</b> téc pico</span>
                  <span className="text-slate-400">{l.hh.toLocaleString()} HH · {l.tareas} act</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">«Téc pico» = máximo de técnicos trabajando en paralelo en esa línea (la dotación que necesitas movilizar). HH = horas-hombre totales.</p>
        </div>
      )}
      {cargaTurno.total > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">🕑 Balance de los 2 turnos {lineaF !== 'Todas' && <span className="text-xs font-normal text-indigo-600">({lineaF})</span>}</h3>
          <div className="grid gap-1.5">
            {([['D', '☀ Día', 'bg-amber-400'], ['N', '🌙 Noche', 'bg-indigo-500']] as const).map(([k, label, color]) => {
              const c = cargaTurno[k], pct = cargaTurno.total ? Math.round((c.hh / cargaTurno.total) * 100) : 0
              return (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 font-semibold text-slate-600">{label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                    <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-32 shrink-0 text-right text-slate-500"><b className="text-slate-700">{c.hh.toLocaleString()} HH</b> · {c.n} act · {pct}%</span>
                </div>
              )
            })}
          </div>
          {cargaTurno.pctN < 25 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">⚠ El turno noche concentra solo {cargaTurno.pctN}% de las HH — está infrautilizado. Mover trabajo a la noche puede acortar la parada.</p>
          )}
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">Distribución por cuadrilla · {crews.length} grupos</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex overflow-hidden rounded-md border border-slate-200" title="Filtra por turno (Día 07–22 / Noche 19–10)">
            {(['Todos', 'D', 'N'] as const).map((tt) => <button key={tt} onClick={() => setTurnoF(tt)} className={`px-2 py-1 ${turnoF === tt ? 'bg-indigo-500 text-white' : 'bg-white text-slate-500'}`}>{tt === 'D' ? '☀ Día' : tt === 'N' ? '🌙 Noche' : 'Turno'}</button>)}
          </div>
          {lineas.length > 0 && (
            <label className="flex items-center gap-1" title="Filtra las cuadrillas por línea">Línea:
              <select value={lineaF} onChange={(e) => setLineaF(e.target.value)} className="rounded border border-slate-200 px-1 py-1">
                <option value="Todas">Todas</option>
                {lineas.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          )}
          <span className={totalConf ? 'font-semibold text-red-600' : 'text-emerald-600'}>{totalConf ? `${totalConf} choque cuadrilla` : 'sin choque grupo'}</span>
          {choquePers.size > 0 && <span className="rounded bg-orange-100 px-1.5 py-0.5 font-semibold text-orange-700" title="El mismo técnico nominado quedó en dos tareas a la vez">⛔ {choquePers.size} choque persona</span>}
          <span className="text-slate-400">Arrastra una barra para mover · clic para reasignar</span>
          <button onClick={resolverChoques} title="Re-secuencia para que NINGUNA cuadrilla haga trabajos en paralelo (1 frente, o según su capacidad de personas)" className="rounded bg-rose-600 px-2 py-1 font-semibold text-white hover:bg-rose-700">Resolver choques</button>
          {snapFechas && <button onClick={deshacerFechas} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50">Deshacer fechas</button>}
          <button onClick={balancear} title="Reasigna cada tarea a la cuadrilla más libre de su disciplina: equilibra la carga" className="rounded bg-teal-600 px-2 py-1 font-semibold text-white hover:bg-teal-700">Auto-balancear</button>
          {snapGrupos && <button onClick={deshacerBalance} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50">Deshacer grupos</button>}
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: '74vh' }}>
        <div className="relative" style={{ width: LEFT + timelineW, minWidth: '100%' }}>
          {/* header eje */}
          <div className="sticky top-0 z-20 flex bg-white" style={{ height: 34 }}>
            <div className="sticky left-0 z-30 relative shrink-0 border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase text-slate-400" style={{ width: LEFT }}>Cuadrilla<ColResizeHandle onResize={onLeftResize} /></div>
            <div className="relative shrink-0 border-b border-slate-200" style={{ width: timelineW }}>
              {dias.map(({ i, d }) => (
                <div key={i} className="absolute top-0 border-l border-slate-200" style={{ left: i * 24 * hourW, width: 24 * hourW, height: 34 }}>
                  <div className="truncate px-1 text-[10px] font-semibold text-slate-600">{DIAS[d.getDay()]} {d.getDate()} {MES[d.getMonth()]}</div>
                  <div className="relative" style={{ height: 14 }}>
                    {Array.from({ length: 24 }, (_, h) => h).filter((h) => h % hTick === 0).map((h) => <span key={h} className="absolute top-0 text-[8px] text-slate-400" style={{ left: h * hourW + 1 }}>{pad(h)}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* lanes por cuadrilla */}
          {crews.map((c) => {
            const laneH = c.nSub * SUB + 8
            return (
              <div key={c.nombre} className="flex border-b border-slate-200" style={{ minHeight: laneH }}>
                <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-0.5 border-r border-slate-200 bg-white px-2 py-1" style={{ width: LEFT }}>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: colorGrupo(c.nombre) }}>{c.nombre}</span>
                    {c.conflictos > 0 && <span className="rounded bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">{c.conflictos} choques</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                    <span>Util <b className={c.util > 85 ? 'text-red-600' : c.util < 35 ? 'text-amber-600' : 'text-slate-700'}>{c.util}%</b></span>
                    <span>{c.hh} HH</span>
                    <span>pico {c.peak}</span>
                    <span className="flex items-center gap-0.5">cap
                      <input type="number" min={0} value={config[c.nombre]?.cap ?? ''} onChange={(e) => { const v = Number(e.target.value); setCap(c.nombre, e.target.value && Number.isFinite(v) && v >= 0 ? v : undefined) }} className="w-12 rounded border border-slate-300 px-0.5 text-center" />
                    </span>
                    {config[c.nombre]?.cap != null && c.peak > (config[c.nombre]!.cap as number) && <span className="rounded bg-red-100 px-1 font-semibold text-red-700">pico &gt; cap</span>}
                    <button onClick={() => setRosterCrew(c.nombre)} title="Asignar los técnicos de esta cuadrilla (su roster). Define la gente que el nivelador reparte entre las tareas." className="rounded border border-violet-300 bg-violet-50 px-1.5 font-semibold text-violet-700 hover:bg-violet-100">
                      👤 {config[c.nombre]?.tecnicos?.length ? `${config[c.nombre]!.tecnicos!.length} téc` : 'asignar'}
                    </button>
                  </div>
                  {config[c.nombre]?.tecnicos?.length ? (
                    <div className="flex flex-wrap gap-0.5">
                      {config[c.nombre]!.tecnicos!.map((u) => (
                        <span key={u.id} className="group/chip inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 text-[9px] text-slate-600" title={`${u.nombre} · ${u.especialidad || (u.cargo || u.rol).replace('_', ' ')}`}>
                          {u.nombre.split(' ').slice(0, 2).join(' ')}
                          <button onClick={() => quitarTecnico(c.nombre, u.id)} title="Quitar de la cuadrilla" className="text-slate-400 hover:text-red-600">×</button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="relative shrink-0" style={{ width: timelineW, height: laneH }}>
                  {dias.map(({ i }) => (
                    <div key={i}>
                      <div className="absolute top-0 bg-slate-100/60" style={{ left: i * 24 * hourW, width: 7 * hourW, height: laneH }} />
                      <div className="absolute top-0 bg-slate-100/60" style={{ left: (i * 24 + 19) * hourW, width: 5 * hourW, height: laneH }} />
                      <div className="absolute top-0 border-l border-slate-100" style={{ left: i * 24 * hourW, height: laneH }} />
                    </div>
                  ))}
                  {c.items.map((it) => {
                    const dH = draft && draft.id === it.t.id ? draft.dH : 0
                    const pc = choquePers.has(it.t.id) // S2: mismo técnico en dos tareas a la vez
                    return (
                      <button key={it.t.id} onPointerDown={(e) => onBarDown(e, it.t)} title={`${it.t.nombre}\n${tecOf(it.t)} téc · ${it.t.duracion_estimada_horas}h${it.conflict ? '\n⚠ choque de cuadrilla (grupo en 2 tareas a la vez)' : ''}${pc ? '\n⛔ CHOQUE DE PERSONA: un técnico nominado está en dos tareas a la vez' : ''}\n(arrastra para mover en el tiempo · clic para reasignar)`}
                        className="absolute flex touch-none cursor-grab items-center gap-0.5 overflow-hidden rounded px-1 text-[9px] font-medium text-white shadow-sm active:cursor-grabbing" style={{
                          left: x(it.s) + dH * hourW, width: Math.max(x(it.e) - x(it.s), 5), top: 4 + it.lane * SUB, height: SUB - 4,
                          background: it.conflict ? '#b91c1c' : colorGrupo(sysOf(it.t)),
                          boxShadow: dH ? '0 0 0 2px #1e293b' : pc ? '0 0 0 2px #f97316' : it.conflict ? '0 0 0 1px #7f1d1d' : undefined,
                          opacity: dH ? 0.85 : 1, zIndex: dH ? 30 : pc ? 20 : undefined,
                        }}>
                        {pc && <span className="shrink-0" title="Choque de persona">⛔</span>}
                        <span className="truncate">{tecOf(it.t)}t · {it.t.nombre}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {crews.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-400">Ninguna tarea tiene fechas programadas (inicio y fin) todavía.</div>}
          {crews.length > 0 && (
            <div className="flex border-t-2 border-slate-300 bg-slate-50/60" style={{ minHeight: 62 }}>
              <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-1 border-r border-slate-200 bg-slate-50 px-2 py-1" style={{ width: LEFT }}>
                <div className="text-[11px] font-bold text-slate-700">Σ Técnicos / hora</div>
                <div className="text-[10px] text-slate-500">Pico <b className="text-amber-600">{peakHisto} téc</b> · {totalHH.toLocaleString()} HH</div>
                <div className="flex flex-wrap gap-0.5" title="Demanda pico simultánea por especialidad (la que infiere cada tarea)">
                  {espPeak.slice(0, 6).map((e) => <span key={e.esp} className="rounded bg-violet-100 px-1 text-[8px] font-medium text-violet-700">{e.esp.replace(' 3G/4G', '').replace('Operador puente grúa', 'Op.grúa')} {e.pico}</span>)}
                </div>
              </div>
              <div className="relative shrink-0" style={{ width: timelineW, height: 56 }}>
                {dias.map(({ i }) => <div key={i} className="absolute top-0 border-l border-slate-100" style={{ left: i * 24 * hourW, height: 56 }} />)}
                {histo.map((c: number, h: number) => c > 0 ? (
                  <div key={h} className="group/bar absolute bottom-3" style={{ left: h * hourW, width: Math.max(hourW - 1, 2) }} title={`${c} téc · hora ${h % 24}:00`}>
                    <div className="mx-auto w-[78%] rounded-t" style={{ height: Math.max((c / peakHisto) * 44, 2), background: c >= peakHisto * 0.85 ? '#dc2626' : c >= peakHisto * 0.5 ? '#f59e0b' : '#10b981' }} />
                  </div>
                ) : null)}
                <div className="absolute bottom-0 left-0 text-[8px] text-slate-400">pico {peakHisto}</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-red-600" /> Conflicto (cuadrilla trabajando 2 tareas a la vez · la espera de apertura/cierre no cuenta)</span>
        <span>Util &lt;35% = ociosa (ámbar) · &gt;85% = saturada (rojo)</span>
      </div>

      {mover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMover(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Mover a otra cuadrilla</h3>
            <p className="mb-3 truncate text-xs text-slate-500" title={mover.nombre}>{mover.nombre}</p>
            <div className="grid grid-cols-4 gap-2">
              {crewList.map((g) => (
                <button key={g} onClick={() => reasignar(g)} disabled={g === grpOf(mover)}
                  className="rounded-md px-2 py-1.5 text-xs font-bold text-white disabled:opacity-30" style={{ background: colorGrupo(g) }}>{g}</button>
              ))}
            </div>
            <button onClick={() => setMover(null)} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          </div>
        </div>
      )}

      {rosterCrew && (
        <RosterModal
          crew={rosterCrew}
          area={parada?.area ?? null}
          usuarios={usuarios}
          seleccionados={config[rosterCrew]?.tecnicos ?? []}
          onClose={() => setRosterCrew(null)}
          onSave={(tecs) => { setRoster(rosterCrew, tecs); setRosterCrew(null) }}
        />
      )}
      </div>
    </div>
  )
}

function RosterModal({ crew, area, usuarios, seleccionados, onClose, onSave }: {
  crew: string; area: string | null; usuarios: Tecnico[]; seleccionados: Tecnico[]; onClose: () => void; onSave: (t: Tecnico[]) => void
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(seleccionados.map((s) => s.id)))
  const [q, setQ] = useState('')
  const [soloArea, setSoloArea] = useState(true)
  const [linea, setLinea] = useState('')
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const lineas = [...new Set(usuarios.map((u) => u.linea).filter(Boolean))] as string[]
  const lista = usuarios.filter((u) =>
    (!q || u.nombre.toLowerCase().includes(q.toLowerCase()) || (u.especialidad ?? '').toLowerCase().includes(q.toLowerCase())) &&
    (!soloArea || !area || !u.area || u.area === area) &&
    (!linea || u.linea === linea))
  const seleccionadosObj = usuarios.filter((u) => sel.has(u.id))
  return (
    <div role="dialog" aria-modal="true" onKeyDown={(e) => e.key === 'Escape' && onClose()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-slate-900">Técnicos de la cuadrilla <span className="rounded px-1.5 py-0.5 text-white" style={{ background: colorGrupo(crew) }}>{crew}</span></h3>
        <p className="mb-2 mt-1 text-xs text-slate-500">El nivelador «Por persona» repartirá estas personas entre las tareas del grupo, sin que nadie haga dos a la vez.</p>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o especialidad…" className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          {area && <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" checked={soloArea} onChange={(e) => setSoloArea(e.target.checked)} className="accent-violet-500" />Solo personal de {area}</label>}
          {lineas.length > 0 && (
            <span className="flex items-center gap-1 text-slate-500">Línea
              <select value={linea} onChange={(e) => setLinea(e.target.value)} className="rounded border border-slate-300 px-1 py-0.5"><option value="">todas</option>{lineas.map((l) => <option key={l} value={l}>{l}</option>)}</select>
            </span>
          )}
        </div>
        {sel.size > 0 && (
          <div className="mb-2 flex flex-wrap gap-1 rounded-lg bg-violet-50 p-1.5">
            {seleccionadosObj.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-700 shadow-sm">{u.nombre.split(' ').slice(0, 2).join(' ')}<button onClick={() => toggle(u.id)} className="text-slate-400 hover:text-red-600">×</button></span>
            ))}
          </div>
        )}
        <div className="grid gap-0.5 overflow-y-auto">
          {lista.map((u) => (
            <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} className="accent-violet-500" />
              <span className="flex-1 truncate">{u.nombre}{u.linea ? <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] text-slate-400">{u.linea}</span> : null}</span>
              {u.especialidad && <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">{u.especialidad}</span>}
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{(u.cargo || u.rol).replace('_', ' ')}</span>
            </label>
          ))}
          {lista.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">Sin coincidencias.</p>}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">{sel.size} técnico{sel.size === 1 ? '' : 's'} · cap = {sel.size}</span>
          <div className="flex gap-2">
            <button onClick={() => onSave(seleccionadosObj)} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700">Guardar roster</button>
            <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function gnum(g: string) { const m = g.match(/\d+/); return m ? Number(m[0]) : 999 }
