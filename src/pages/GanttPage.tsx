import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { getTareasByParada, updateTareaSchedule, updateTareaEspec, updateTarea, createTarea, guardarLineaBase, restaurarLineaBase, getCuadrillasConfig, setCuadrillasConfig } from '../lib/api'
import { useRefreshOnFocus } from '../lib/useRefreshOnFocus'
import type { Roster, Tecnico } from '../lib/resourceLeveling'
import { colorGrupo, disciplina as discDe } from '../lib/palette'
import { rutaCritica } from '../lib/criticalPath'
import { nivelarPersonal, nivelarSinExtender, nivelarPorCuadrilla, resolverCuadrillas, resolverPorPersona, sugerirPrecedencias, tramosTrabajo, tieneEspera, infoNivel } from '../lib/resourceLeveling'
import type { Parada, Tarea, TaskStatus } from '../types'

const H = 3600000
const DAY = 86400000
const ROW = 32
const HEAD = 46
const LEFT = 824

const COLOR: Record<TaskStatus, string> = {
  Por_Hacer: '#64748b', En_Progreso: '#2563eb', En_Revision: '#7c3aed',
  Completada: '#059669', Bloqueada: '#dc2626', Cancelada: '#cbd5e1',
}
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DISCIPLINAS = ['Todas', 'Mecánica', 'Eléctrica', 'Instrumentación'] as const

const sysOf = (t: Tarea) => (t.especificaciones_tecnicas?.sistema as string) || 'General'
const grpOf = (t: Tarea) => (t.especificaciones_tecnicas?.grupo as string) || '—'
const turnoOf = (t: Tarea): 'D' | 'N' => { const dn = (t.especificaciones_tecnicas?.turno_dn as string) || ''; return (dn ? dn.toUpperCase().startsWith('N') : (t.turno_asignado || '').toLowerCase().startsWith('n')) ? 'N' : 'D' }
const lineaOf = (t: Tarea) => String(t.especificaciones_tecnicas?.linea ?? '').trim()
const tecOf = (t: Tarea) => (t.especificaciones_tecnicas?.tec as number) ?? ''
const wbsOf = (t: Tarea) => (t.especificaciones_tecnicas?.wbs as string) || ''
const discOf = (t: Tarea) => (t.especificaciones_tecnicas?.disciplina as string) || discDe(`${t.nombre} ${sysOf(t)}`)
const pad = (n: number) => String(n).padStart(2, '0')
const toInput = (s?: string | null) => { if (!s) return ''; const d = new Date(s); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }

export function GanttPage() {
  const { id } = useParams<{ id: string }>()
  const parada = useOutletContext<Parada | undefined>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [colap, setColap] = useState<Set<string>>(new Set())
  const [colorMode, setColorMode] = useState<'grupo' | 'sistema' | 'estado'>('grupo')
  const [groupBy, setGroupBy] = useState<'sistema' | 'disciplina'>('sistema')
  const [filtro, setFiltro] = useState<(typeof DISCIPLINAS)[number]>('Todas')
  const [turnoF, setTurnoF] = useState<'Todos' | 'D' | 'N'>('Todos')
  const [lineaF, setLineaF] = useState('Todas')
  const [lineaDias, setLineaDias] = useState<Record<string, number>>({})
  const [cfgRaw, setCfgRaw] = useState<Record<string, { cap?: number; turno?: string; dias?: number; tecnicos?: Tecnico[] }>>({})
  const [turnosOn, setTurnosOn] = useState(true)
  const [gruas, setGruas] = useState(0)
  const [hitoModal, setHitoModal] = useState(false)
  const [hitoArea, setHitoArea] = useState('')
  const [hitoFecha, setHitoFecha] = useState('')
  const [precSnap, setPrecSnap] = useState<Record<string, string | null> | null>(null)
  const [verDeps, setVerDeps] = useState(true)
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1600)
  const [targetC, setTargetC] = useState<number | null>(null)
  const [caps, setCaps] = useState<Record<string, number>>({})
  const [roster, setRoster] = useState<Roster>({})
  const [snapshot, setSnapshot] = useState<Record<string, { s: number; e: number }> | null>(null)
  const [draft, setDraft] = useState<{ id: string; dS: number; dD: number } | null>(null)
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; x0: number; s0: number; d0: number; dh: number } | null>(null)

  const reloadTareas = () => {
    if (!id) return Promise.resolve()
    return getTareasByParada(id).then(setTareas).catch((e) => setError(e.message))
  }
  useEffect(() => {
    if (!id) return
    setLoading(true)
    reloadTareas().finally(() => setLoading(false))
    getCuadrillasConfig(id).then((cfg) => {
      setCfgRaw(cfg)
      setCaps(Object.fromEntries(Object.entries(cfg).filter(([k, v]) => v.cap && !k.startsWith('__')).map(([k, v]) => [k, v.cap as number])))
      setRoster(Object.fromEntries(Object.entries(cfg).filter(([k, v]) => v.tecnicos?.length && !k.startsWith('__')).map(([k, v]) => [k, v.tecnicos as Tecnico[]])))
      // días de ventana de parada por línea (claves reservadas __dias_<linea>)
      setLineaDias(Object.fromEntries(Object.entries(cfg).filter(([k, v]) => k.startsWith('__dias_') && v.dias).map(([k, v]) => [k.slice(7), v.dias as number])))
    }).catch(() => {})
  }, [id])
  useRefreshOnFocus(reloadTareas)
  useEffect(() => {
    const f = () => setVw(window.innerWidth)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])

  const { criticas, holgura } = useMemo(() => rutaCritica(tareas), [tareas])
  // Plan vs ventana COMPROMETIDA: ¿el cronograma completo cabe en la duración planeada
  // de la parada? Visible siempre (no solo al filtrar 1 línea). Usa horas de span del
  // plan vs duracion_planeada_horas (o fin−inicio planeado) para evitar líos de fecha.
  const ventana = useMemo(() => {
    const ini = tareas.map((t) => (t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : Infinity)).filter(Number.isFinite)
    const fin = tareas.map((t) => (t.fecha_fin_prog ? new Date(t.fecha_fin_prog).getTime() : -Infinity)).filter(Number.isFinite)
    if (!ini.length || !fin.length) return null
    const planH = Math.round((Math.max(...fin) - Math.min(...ini)) / H)
    const ventH = parada?.duracion_planeada_horas != null ? Number(parada.duracion_planeada_horas)
      : (parada?.fecha_inicio_planeada && parada?.fecha_fin_planeada ? Math.round((new Date(parada.fecha_fin_planeada).getTime() - new Date(parada.fecha_inicio_planeada).getTime()) / H) : null)
    return ventH && ventH > 0 ? { planH, ventH, overrun: planH - ventH } : { planH, ventH: null as number | null, overrun: null as number | null }
  }, [tareas, parada])
  const nivel = useMemo(() => infoNivel(tareas), [tareas])
  const topeC = targetC ?? nivel?.recC ?? 20
  const lineas = useMemo(() => [...new Set(tareas.map(lineaOf).filter(Boolean))].sort(), [tareas])
  const vis = useMemo(() => tareas.filter((t) => (filtro === 'Todas' || discOf(t) === filtro) && (turnoF === 'Todos' || turnoOf(t) === turnoF) && (lineaF === 'Todas' || lineaOf(t) === lineaF)), [tareas, filtro, turnoF, lineaF])
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
      // Orden estable por secuencia (igual que la Lista, como MSProject): las filas NO
      // se reordenan al cambiar fechas; solo las barras flotan en el tiempo.
      ts.sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0))
      const ss = ts.map((t) => fechas[t.id]?.s).filter(Boolean) as number[]
      const ee = ts.map((t) => fechas[t.id]?.e).filter(Boolean) as number[]
      const seq = Math.min(...ts.map((t) => t.secuencia ?? Infinity))
      return { nombre, tareas: ts, seq, s: ss.length ? Math.min(...ss) : 0, e: ee.length ? Math.max(...ee) : 0 }
    })
    grupos.sort((a, b) => a.seq - b.seq)  // grupos por su secuencia mínima (= orden de la Lista)
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
    .map((t) => ({ from: t.bloqueado_por as string, to: t.id, crit: criticas.has(t.id) && criticas.has(t.bloqueado_por as string), col: colorGrupo(grpOf(t)) }))

  const horas = totalDias * 24
  const histo = new Array(horas).fill(0)
  for (const t of vis) {
    const f = fechas[t.id]; if (!f) continue
    const tecRaw = Number((t.especificaciones_tecnicas?.tec as number) ?? 0)
    const tec = Number.isFinite(tecRaw) ? tecRaw : 0   // un 'tec' no numérico no debe envenenar todo el histograma
    // Cuenta técnicos solo durante el TRABAJO real (no la espera): para tareas con espera
    // usa los tramos; el resto, el span de la barra recolocado al inicio/fin de la fila.
    const tramos = tieneEspera(t) ? tramosTrabajo(t) : [{ s: f.s, e: f.e }]
    for (const tr of tramos)
      for (let h = Math.max(0, Math.floor((tr.s - base) / H)); h < Math.min(horas, Math.ceil((tr.e - base) / H)); h++) histo[h] += tec
  }
  const peak = Math.max(1, ...histo)

  function onDown(e: React.PointerEvent, t: Tarea, mode: 'move' | 'resize') {
    e.preventDefault(); e.stopPropagation()
    const f = fechas[t.id]
    if (!f) return
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

  function persistirFechas(map: Record<string, { s: number; e: number }>) {
    Promise.all(
      Object.entries(map).map(([idt, v]) =>
        updateTareaSchedule(idt, new Date(v.s).toISOString(), new Date(v.e).toISOString(), Math.max(1, (v.e - v.s) / H)),
      ),
    ).catch((e) => setError(String(e)))
  }
  function aplicarFechas(map: Record<string, { s: number; e: number }>) {
    setTareas((ts) => ts.map((t) => (map[t.id] ? { ...t, fecha_inicio_prog: new Date(map[t.id].s).toISOString(), fecha_fin_prog: new Date(map[t.id].e).toISOString() } : t)))
  }
  function nivelar() {
    if (!nivel) return
    const snap: Record<string, { s: number; e: number }> = {}
    for (const t of nivel.dated) snap[t.id] = { s: new Date(t.fecha_inicio_prog!).getTime(), e: new Date(t.fecha_fin_prog!).getTime() }
    const res = nivelarPersonal(nivel.dated, topeC, nivel.baseMs)
    setSnapshot(snap)
    aplicarFechas(res)
    persistirFechas(res)
  }
  function restaurar() {
    if (!snapshot) return
    aplicarFechas(snapshot)
    persistirFechas(snapshot)
    setSnapshot(null)
  }
  function snapActual(): Record<string, { s: number; e: number }> {
    const snap: Record<string, { s: number; e: number }> = {}
    if (nivel) for (const t of nivel.dated) snap[t.id] = { s: new Date(t.fecha_inicio_prog!).getTime(), e: new Date(t.fecha_fin_prog!).getTime() }
    return snap
  }
  function nivelarSE() {
    if (!nivel) return
    setSnapshot(snapActual())
    const { res, C } = nivelarSinExtender(nivel.dated, nivel.baseMs, nivel.winH)
    aplicarFechas(res)
    persistirFechas(res)
    setTargetC(C)
  }
  function nivelarCuad() {
    if (!nivel) return
    setSnapshot(snapActual())
    const res = nivelarPorCuadrilla(nivel.dated, caps, nivel.baseMs)
    aplicarFechas(res)
    persistirFechas(res)
  }
  function resolverChoques() {
    if (!nivel) return
    setSnapshot(snapActual())
    const res = resolverCuadrillas(nivel.dated, caps, nivel.baseMs)
    aplicarFechas(res)
    persistirFechas(res)
  }
  function resolverPersonas() {
    if (!nivel) return
    setSnapshot(snapActual())
    const { schedule, asignaciones } = resolverPorPersona(nivel.dated, nivel.baseMs, roster, { turnos: turnosOn, gruas })
    aplicarFechas(schedule)
    persistirFechas(schedule)
    const ids = Object.keys(asignaciones)
    if (ids.length) {
      // Refleja en pantalla y persiste el técnico auto-asignado a cada tarea.
      setTareas((ts) => ts.map((t) => (asignaciones[t.id]
        ? { ...t, especificaciones_tecnicas: { ...(t.especificaciones_tecnicas ?? {}), asignados: asignaciones[t.id], tec: asignaciones[t.id].length } }
        : t)))
      Promise.all(ids.map((tid) => {
        const t = nivel.dated.find((x) => x.id === tid)!
        return updateTareaEspec(tid, { ...(t.especificaciones_tecnicas ?? {}), asignados: asignaciones[tid], tec: asignaciones[tid].length })
      })).catch((e) => setError(String(e)))
    }
  }
  function sugerirPrec() {
    const sug = sugerirPrecedencias(tareas)
    const ids = Object.keys(sug)
    if (!ids.length) { setError('No hay precedencias nuevas que sugerir (las tareas ya tienen predecesora o falta fecha).'); return }
    const snap: Record<string, string | null> = {}
    for (const tid of ids) snap[tid] = tareas.find((t) => t.id === tid)?.bloqueado_por ?? null
    setPrecSnap(snap)
    setTareas((ts) => ts.map((t) => (sug[t.id] ? { ...t, bloqueado_por: sug[t.id] } : t)))
    Promise.all(ids.map((tid) => updateTarea(tid, { bloqueado_por: sug[tid] }))).catch((e) => setError(String(e)))
  }
  function deshacerPrec() {
    if (!precSnap) return
    const snap = precSnap
    setTareas((ts) => ts.map((t) => (t.id in snap ? { ...t, bloqueado_por: snap[t.id] } : t)))
    Promise.all(Object.entries(snap).map(([tid, v]) => updateTarea(tid, { bloqueado_por: v }))).catch((e) => setError(String(e)))
    setPrecSnap(null)
  }
  // Hito de "entrega de Operaciones": Operaciones para su equipo (celdas / bombas de agua
  // de proceso) a cierta hora y recién ahí pueden iniciar los trabajos de ese sistema.
  // Crea un hito (◆) y bloquea con él las tareas del sistema; las que arrancan antes se
  // empujan a la hora del hito. La hora es editable arrastrando el ◆ o re-creando.
  function abrirHito() {
    const sistemas = [...new Set(tareas.map(sysOf))].filter((s) => s && s !== 'General').sort()
    setHitoArea(sistemas[0] ?? '')
    // por defecto: día de inicio de la parada a las 10:00
    const minMs = Math.min(...tareas.map((t) => (t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : Infinity)).filter((n) => isFinite(n)))
    const d = isFinite(minMs) ? new Date(minMs) : new Date()
    d.setUTCHours(10, 0, 0, 0)
    setHitoFecha(d.toISOString().slice(0, 16))
    setHitoModal(true)
  }
  async function crearHitoEntrega() {
    if (!id || !hitoArea || !hitoFecha) return
    const hMs = new Date(hitoFecha + ':00Z').getTime()
    const iso = new Date(hMs).toISOString()
    const delArea = tareas.filter((t) => sysOf(t) === hitoArea)
    try {
      const minSeq = Math.min(...delArea.map((t) => t.secuencia ?? 0))
      // La BD exige duración > 0; un hito se modela con duración mínima y el flag
      // hito_inicio (se dibuja como ◆, no como barra).
      const hito = await createTarea(id, { nombre: `🛑 ENTREGA OPERACIONES — paro ${hitoArea}`, duracion_estimada_horas: 1, secuencia: minSeq - 1 })
      await updateTareaSchedule(hito.id, iso, new Date(hMs + 3600000).toISOString(), 1)
      await updateTareaEspec(hito.id, { sistema: hitoArea, hito_inicio: true })
      await Promise.all(delArea.map((t) => {
        const patch: Record<string, unknown> = {}
        if (!t.bloqueado_por) patch.bloqueado_por = hito.id
        if (t.fecha_inicio_prog && t.fecha_fin_prog && new Date(t.fecha_inicio_prog).getTime() < hMs) {
          const dur = new Date(t.fecha_fin_prog).getTime() - new Date(t.fecha_inicio_prog).getTime()
          patch.fecha_inicio_prog = iso; patch.fecha_fin_prog = new Date(hMs + dur).toISOString()
        }
        return Object.keys(patch).length ? updateTarea(t.id, patch) : Promise.resolve()
      }))
      setHitoModal(false)
      await reloadTareas()
    } catch (e) { setError(String(e)) }
  }
  // Duración de la ventana de parada por línea (L1 ≈ 3 días, L2 ≈ 5 días). Se guarda
  // en config bajo clave reservada __dias_<linea> y dibuja un deadline en el Gantt.
  function setDiasLinea(linea: string, dias: number | undefined) {
    setLineaDias((d) => { const n = { ...d }; if (dias && dias > 0) n[linea] = dias; else delete n[linea]; return n })
    if (!id) return
    const next = { ...cfgRaw, [`__dias_${linea}`]: { dias: dias && dias > 0 ? dias : undefined } }
    setCfgRaw(next)
    setCuadrillasConfig(id, next).catch((e) => setError(String(e)))
  }
  // Edición inline desde la grilla del Gantt (persiste y se refleja en las otras vistas).
  function editar(id: string, fields: Parameters<typeof updateTarea>[1]) {
    setTareas((ts) => ts.map((t) => (t.id === id ? { ...t, ...fields } : t)))
    updateTarea(id, fields).catch((e) => setError(String(e)))
  }
  function editarTec(t: Tarea, v: number) {
    const next = { ...(t.especificaciones_tecnicas ?? {}), tec: v }
    setTareas((ts) => ts.map((x) => (x.id === t.id ? { ...x, especificaciones_tecnicas: next } : x)))
    updateTareaEspec(t.id, next).catch((e) => setError(String(e)))
  }
  function editarFechaG(t: Tarea, which: 'inicio' | 'fin', v: string) {
    if (!v) return
    const iso = new Date(v).toISOString()
    const s = which === 'inicio' ? new Date(v).getTime() : t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : NaN
    const e = which === 'fin' ? new Date(v).getTime() : t.fecha_fin_prog ? new Date(t.fecha_fin_prog).getTime() : NaN
    if (!Number.isFinite(s) || !Number.isFinite(e)) return
    if (e <= s) { setError('La fecha de fin debe ser posterior al inicio.'); return }
    const dur = Math.round(((e - s) / H) * 10) / 10
    editar(t.id, which === 'inicio' ? { fecha_inicio_prog: iso, duracion_estimada_horas: dur } : { fecha_fin_prog: iso, duracion_estimada_horas: dur })
  }
  function editarHrs(t: Tarea, v: number) {
    // En un Gantt, cambiar las horas debe redimensionar la barra (fin = inicio + horas).
    const ini = t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : null
    const fin = ini != null ? new Date(ini + v * H).toISOString() : t.fecha_fin_prog
    editar(t.id, { duracion_estimada_horas: v, fecha_fin_prog: fin })
  }
  async function guardarBase() {
    if (!id) return
    try {
      await guardarLineaBase(id)
      setTareas((ts) => ts.map((t) => ({ ...t, fecha_inicio_base: t.fecha_inicio_prog, fecha_fin_base: t.fecha_fin_prog })))
    } catch (e) { setError(String(e)) }
  }
  async function volverABase() {
    if (!id) return
    try {
      await restaurarLineaBase(id)
      setTareas((ts) => ts.map((t) => (t.fecha_inicio_base ? { ...t, fecha_inicio_prog: t.fecha_inicio_base, fecha_fin_prog: t.fecha_fin_base } : t)))
      setSnapshot(null)
    } catch (e) { setError(String(e)) }
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando Gantt…</p>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>
  if (tareas.length === 0) return <p className="text-sm text-slate-400">No hay tareas para graficar.</p>

  const fmt = (ms: number) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1} ${pad(d.getHours())}:${pad(d.getMinutes())}` }
  const dias = Array.from({ length: totalDias }, (_, i) => { const d = new Date(base + i * DAY); return { i, d } })
  const hTick = hourW >= 22 ? 1 : hourW >= 12 ? 2 : hourW >= 9 ? 3 : 6
  const colBar = (t: Tarea) => (colorMode === 'estado' ? COLOR[t.status] : colorMode === 'sistema' ? colorGrupo(keyDe(t)) : colorGrupo(grpOf(t)))

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
          <span>{parada?.nombre} · {vis.length} act · {criticas.size} críticas</span>
          {ventana?.overrun != null && (
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ventana.overrun > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}
              title={`Duración del plan ${ventana.planH}h vs ventana comprometida ${ventana.ventH}h`}>
              {ventana.overrun > 0 ? `⚠ Plan +${ventana.overrun}h sobre la ventana (${ventana.ventH}h)` : `✓ dentro de ventana · ${-ventana.overrun}h de margen`}
            </span>
          )}
          {ventana && ventana.overrun == null && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500" title="Define duración planeada en la parada para comparar">Plan {ventana.planH}h · ventana sin definir</span>}
        </h3>
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
          <div className="flex overflow-hidden rounded-md border border-slate-200" title="Filtra por turno (Día 07–22 / Noche 19–10)">
            {(['Todos', 'D', 'N'] as const).map((tt) => <button key={tt} onClick={() => setTurnoF(tt)} className={`px-2 py-0.5 ${turnoF === tt ? 'bg-indigo-500 text-white' : 'bg-white text-slate-500'}`}>{tt === 'D' ? '☀ Día' : tt === 'N' ? '🌙 Noche' : 'Turno'}</button>)}
          </div>
          {lineas.length > 0 && (
            <label className="flex items-center gap-1" title="Separa las actividades por línea (cada línea tiene su propia ventana de parada)">Línea:
              <select value={lineaF} onChange={(e) => setLineaF(e.target.value)} className="rounded border border-slate-200 px-1 py-0.5">
                <option value="Todas">Todas</option>
                {lineas.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          )}
          {lineaF !== 'Todas' && (
            <label className="flex items-center gap-1 rounded-md border border-fuchsia-300 bg-fuchsia-50 px-1.5 py-0.5 text-fuchsia-700" title="Días de duración de la parada para esta línea. Dibuja el fin de ventana y marca en rojo las tareas que se pasan.">⏱ Ventana
              <input type="number" min={0} step={0.5} value={lineaDias[lineaF] ?? ''} placeholder="días" onChange={(e) => setDiasLinea(lineaF, e.target.value ? Number(e.target.value) : undefined)} className="w-12 rounded border border-fuchsia-300 px-1 py-0.5 text-center" />días</label>
          )}
          <button onClick={() => setVerDeps((v) => !v)} className={`rounded-md border px-2 py-0.5 ${verDeps ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white'}`}>Dependencias</button>
          <button onClick={sugerirPrec} title="Encadena en serie las tareas de cada equipo+cuadrilla (orden por fecha) para habilitar la ruta crítica. Solo a las que no tienen predecesora." className="rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 font-medium text-sky-700 hover:bg-sky-100">Sugerir precedencias</button>
          {precSnap && <button onClick={deshacerPrec} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-slate-600 hover:bg-slate-50">Deshacer prec.</button>}
          <button onClick={abrirHito} title="Crea un hito de entrega de Operaciones (paro de equipo) que bloquea el inicio de un sistema hasta cierta hora. Editable arrastrando el ◆." className="rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 font-medium text-rose-700 hover:bg-rose-100">🛑 Hito Operaciones</button>
          <div className="flex overflow-hidden rounded-md border border-slate-200">
            {(['grupo', 'sistema', 'estado'] as const).map((m) => <button key={m} onClick={() => setColorMode(m)} className={`px-2 py-0.5 capitalize ${colorMode === m ? 'bg-amber-500 text-white' : 'bg-white text-slate-500'}`}>{m}</button>)}
          </div>
          {nivel && (
            <div className="flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5">
              <span className="font-medium text-emerald-700">Nivelar a</span>
              <input type="number" min={1} value={topeC} onChange={(e) => setTargetC(Math.max(1, Number(e.target.value)))} className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center" />
              <span className="text-emerald-700">téc/h</span>
              <button onClick={nivelar} title="Re-programa las tareas para que ninguna hora supere el tope (respeta dependencias)" className="rounded bg-emerald-600 px-2 py-0.5 font-semibold text-white hover:bg-emerald-700">Auto-distribuir</button>
              <button onClick={nivelarSE} title="Aplana al máximo SIN alargar la parada (usa solo la holgura disponible)" className="rounded bg-emerald-800 px-2 py-0.5 font-semibold text-white hover:bg-emerald-900">Sin extender</button>
              <button onClick={nivelarCuad} title="Nivela respetando la capacidad (cap) de cada cuadrilla por separado" className="rounded bg-teal-700 px-2 py-0.5 font-semibold text-white hover:bg-teal-800">Por cuadrilla</button>
              <button onClick={resolverChoques} title="Re-secuencia para que NINGUNA cuadrilla haga trabajos en paralelo (1 frente, o según su capacidad de personas)" className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700">Resolver choques</button>
              <button onClick={resolverPersonas} title="Nivela trabajador por trabajador: ningún técnico nominado en dos tareas a la vez, respeta especialidad, fatiga (48h/6h) y ventana de turno" className="rounded bg-violet-600 px-2 py-0.5 font-semibold text-white hover:bg-violet-700">Por persona</button>
              <label className="flex items-center gap-1 text-emerald-700" title="Cada tarea arranca dentro de su turno (Día 07–22 / Noche 19–10); puede extenderse"><input type="checkbox" checked={turnosOn} onChange={(e) => setTurnosOn(e.target.checked)} className="accent-indigo-500" />turnos</label>
              <label className="flex items-center gap-1 text-emerald-700" title="Grúas / puentes grúa disponibles (recurso compartido por toda la planta). 0 = sin límite. El nivelador 'Por persona' no deja más tareas con grúa en paralelo que este número."><span>🏗️</span><input type="number" min={0} value={gruas} onChange={(e) => setGruas(Math.max(0, Number(e.target.value) || 0))} className="w-10 rounded border border-slate-300 px-1 py-0.5 text-center" />grúas</label>
              {snapshot && <button onClick={restaurar} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-600 hover:bg-slate-50">Restaurar</button>}
            </div>
          )}
          <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5">
            <span className="font-medium text-slate-600">Línea base:</span>
            <button onClick={guardarBase} title="Guarda el plan actual como línea base (permanente)" className="rounded bg-slate-700 px-2 py-0.5 font-semibold text-white hover:bg-slate-800">Guardar</button>
            <button onClick={volverABase} title="Vuelve la programación a la línea base guardada" className="rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50">Restaurar</button>
          </div>
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: '74vh' }}>
        <div className="relative" style={{ width: LEFT + timelineW, minWidth: '100%' }}>
          {/* HEADER */}
          <div className="sticky top-0 z-30 flex bg-white" style={{ height: HEAD }}>
            <div className="sticky left-0 z-40 flex shrink-0 items-stretch border-b border-r border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-400" style={{ width: LEFT }}>
              <Cell w={32}>#</Cell><Cell w={240} l>Actividad</Cell><Cell w={52}>WBS</Cell><Cell w={86}>Disciplina</Cell><Cell w={42}>Grp</Cell><Cell w={30}>Téc</Cell><Cell w={32}>Hrs</Cell><Cell w={116}>Comienzo</Cell><Cell w={116}>Fin</Cell><Cell w={44}>Pred</Cell><Cell w={34}>%</Cell>
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
              {Date.now() >= base && Date.now() <= base + totalDias * DAY && (
                <div className="absolute top-0 z-10 w-0.5 bg-red-500/70" style={{ left: x(Date.now()), height: bodyH }} title="Hoy" />
              )}
              {lineaF !== 'Todas' && lineaDias[lineaF] > 0 && (
                <div className="absolute top-0 z-20 w-0.5 bg-fuchsia-600" style={{ left: x(base + lineaDias[lineaF] * DAY), height: bodyH }} title={`Fin de ventana ${lineaF}: ${lineaDias[lineaF]} días`}>
                  <span className="absolute top-1 -translate-x-1/2 whitespace-nowrap rounded bg-fuchsia-600 px-1 text-[9px] font-semibold text-white">fin {lineaF} · {lineaDias[lineaF]}d</span>
                </div>
              )}
            </div>

            {verDeps && (
              <svg className="pointer-events-none absolute top-0 z-20" style={{ left: LEFT, width: timelineW, height: bodyH }}>
                <defs><marker id="ah" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" /></marker></defs>
                {deps.map(({ from, to, col, crit }, k) => {
                  const ff = fechas[from], tf = fechas[to]
                  const x1 = x(ff.e), y1 = (rowOf[from] + 0.5) * ROW, x2 = x(tf.s), y2 = (rowOf[to] + 0.5) * ROW
                  const mx = Math.max(x1 + 8, x2 - 10)
                  return <path key={k} d={`M${x1},${y1} H${mx} V${y2} H${x2}`} fill="none" stroke={col} strokeWidth={crit ? 2 : 1.1} markerEnd="url(#ah)" opacity="0.5" />
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
              // Tarea que se PASA de la ventana de parada de su línea (deadline)
              const overrun = lineaF !== 'Todas' && lineaDias[lineaF] > 0 && fch.e > base + lineaDias[lineaF] * DAY
              const ringBar = crit ? '0 0 0 2px #dc2626' : overrun ? '0 0 0 2px #c026d3' : undefined
              const hito = Number(t.duracion_estimada_horas ?? 0) <= 0 || !!t.especificaciones_tecnicas?.hito_inicio
              const dS = draft?.id === t.id ? draft.dS : 0, dD = draft?.id === t.id ? draft.dD : 0
              const left = x(fch.s) + dS * hourW
              const width = Math.max(x(fch.e) - x(fch.s) + dD * hourW, 5)
              return (
                <div key={t.id} className={`absolute flex w-full border-b border-slate-50 ${idx % 2 ? 'bg-white' : 'bg-slate-50'}`} style={{ top, height: ROW }}>
                  <div className={`sticky left-0 z-30 flex shrink-0 items-stretch border-r border-slate-200 ${idx % 2 ? 'bg-white' : 'bg-slate-50'} text-[11px] text-slate-600`} style={{ width: LEFT }}>
                    <Cell w={32}><span className="text-slate-400">{t.secuencia}</span></Cell>
                    <Cell w={240} l>
                      {crit && <span className="mr-1 text-[10px] font-bold text-red-600" title="Ruta crítica">◆</span>}
                      <span className="mr-1 inline-block h-2 w-2 shrink-0 rounded-full align-middle" style={{ background: COLOR[t.status] }} />
                      <input key={`n-${t.nombre}`} defaultValue={t.nombre} title={t.nombre}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.nombre) editar(t.id, { nombre: v }) }}
                        className="w-full min-w-0 truncate rounded border border-transparent bg-transparent px-0.5 align-middle hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none" />
                    </Cell>
                    <Cell w={52}>{wbsOf(t)}</Cell>
                    <Cell w={86}><span className="text-[10px]">{discOf(t)}</span></Cell>
                    <Cell w={42}><span className="rounded px-1 text-white" style={{ background: colorGrupo(sysOf(t)) }}>{grpOf(t)}</span></Cell>
                    <Cell w={30}><input key={`tec-${tecOf(t)}`} type="number" min={0} defaultValue={tecOf(t)} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v !== tecOf(t)) editarTec(t, v) }} className="w-full min-w-0 rounded border border-transparent bg-transparent text-center [appearance:textfield] hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" /></Cell>
                    <Cell w={32}><input key={`h-${t.duracion_estimada_horas}`} type="number" min={0} step={0.5} defaultValue={Number(t.duracion_estimada_horas ?? 0)} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0 && v !== Number(t.duracion_estimada_horas)) editarHrs(t, v) }} className="w-full min-w-0 rounded border border-transparent bg-transparent text-center [appearance:textfield] hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" /></Cell>
                    <Cell w={116}><input key={`fi-${t.fecha_inicio_prog ?? ''}`} type="datetime-local" defaultValue={toInput(t.fecha_inicio_prog)} onBlur={(e) => editarFechaG(t, 'inicio', e.target.value)} className="w-full min-w-0 rounded border border-transparent bg-transparent text-[10px] hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none" /></Cell>
                    <Cell w={116}><input key={`ff-${t.fecha_fin_prog ?? ''}`} type="datetime-local" defaultValue={toInput(t.fecha_fin_prog)} onBlur={(e) => editarFechaG(t, 'fin', e.target.value)} className="w-full min-w-0 rounded border border-transparent bg-transparent text-[10px] hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none" /></Cell>
                    <Cell w={44}>{t.bloqueado_por ? `#${secById[t.bloqueado_por]}` : ''}</Cell>
                    <Cell w={34}><input key={`p-${t.porcentaje_completado}`} type="number" min={0} max={100} step={5} defaultValue={t.porcentaje_completado} onBlur={(e) => { const v = Math.min(100, Math.max(0, Number(e.target.value))); if (Number.isFinite(v) && v !== t.porcentaje_completado) editar(t.id, { porcentaje_completado: v }) }} className="w-full min-w-0 rounded border border-transparent bg-transparent text-center [appearance:textfield] hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" /></Cell>
                  </div>
                  <div className="relative shrink-0" style={{ width: timelineW }}>
                    {t.fecha_inicio_base && t.fecha_fin_base && Math.abs(new Date(t.fecha_inicio_base).getTime() - fch.s) > 36e5 && (
                      <div className="absolute bottom-0.5 h-1 rounded bg-slate-400/60" title="Línea base (plan original)" style={{ left: x(new Date(t.fecha_inicio_base).getTime()), width: Math.max(x(new Date(t.fecha_fin_base).getTime()) - x(new Date(t.fecha_inicio_base).getTime()), 3) }} />
                    )}
                    {hito ? (
                      <div onPointerDown={(e) => onDown(e, t, 'move')} title={`${t.nombre} (hito)`} className="absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab bg-slate-800" style={{ left }} />
                    ) : tieneEspera(t) ? (() => {
                      // Trabajo al inicio + ESPERA (otra área limpia) + trabajo al final
                      const dur = Number(t.duracion_estimada_horas ?? 0)
                      const iniW = Math.max(Math.ceil(dur / 2) * hourW, 4)
                      const finW = Math.max((dur - Math.ceil(dur / 2)) * hourW, 4)
                      return (
                        <div onPointerDown={(e) => onDown(e, t, 'move')} title={`${t.nombre}\n${fmt(fch.s)} → ${fmt(fch.e)} · trabajo ${dur}h CON ESPERA (otra área)\n${t.porcentaje_completado}%`}
                          className="absolute top-1/2 z-10 h-[18px] -translate-y-1/2 cursor-grab active:cursor-grabbing" style={{ left, width }}>
                          <div className="absolute top-1/2 h-[3px] w-full -translate-y-1/2 rounded bg-slate-300" title="Espera (otra área)" />
                          <div className="absolute left-0 top-0 h-full rounded shadow-sm" style={{ width: iniW, background: colBar(t), boxShadow: ringBar }} />
                          {dur - Math.ceil(dur / 2) > 0 && <div className="absolute right-0 top-0 h-full rounded shadow-sm" style={{ width: finW, background: colBar(t) }} />}
                        </div>
                      )
                    })() : (
                      <div onPointerDown={(e) => onDown(e, t, 'move')} title={`${t.nombre}\n${fmt(fch.s)} → ${fmt(fch.e)} · ${t.duracion_estimada_horas}h · ${t.porcentaje_completado}%\nHolgura: ${holgura[t.id] ?? '?'}h${crit ? ' · CRÍTICA' : ''}`}
                        className="group absolute top-1/2 z-10 flex h-[18px] -translate-y-1/2 cursor-grab items-center rounded shadow-sm active:cursor-grabbing"
                        style={{ left, width, background: colBar(t), boxShadow: ringBar }}>
                        {t.porcentaje_completado > 0 && <div className="absolute left-0 top-0 h-full rounded-l bg-black/25" style={{ width: `${t.porcentaje_completado}%` }} />}
                        <div onPointerDown={(e) => onDown(e, t, 'resize')} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-black/0 group-hover:bg-white/40" />
                      </div>
                    )}
                    {(() => {
                      const asg = (t.especificaciones_tecnicas?.asignados as { nombre: string; rol?: string }[]) ?? []
                      const ini = asg.map((a) => a.nombre.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('')).join(' ')
                      return (
                        <span className="pointer-events-none absolute top-1/2 z-[5] -translate-y-1/2 whitespace-nowrap text-[10px] leading-none text-slate-700"
                          style={{ left: left + (hito ? 10 : width + 6) }}
                          title={asg.length ? asg.map((a) => `${a.nombre} (${(a.rol || '').replace('_', ' ')})`).join('\n') : undefined}>
                          {t.nombre}
                          <span className="ml-1 rounded px-1 text-[9px] font-semibold text-white" style={{ background: colorGrupo(grpOf(t)) }}>{grpOf(t)}</span>
                          {asg.length > 0 ? <span className="ml-1 text-amber-700">👤 {ini}</span> : tecOf(t) ? <span className="ml-1 text-slate-400">· {tecOf(t)} téc</span> : null}
                        </span>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* HISTOGRAMA */}
          <div className="sticky bottom-0 z-30 flex border-t-2 border-slate-300 bg-white" style={{ height: 70 }}>
            <div className="sticky left-0 z-40 flex shrink-0 flex-col justify-center border-r border-slate-200 bg-slate-50 px-2 text-[10px] font-semibold uppercase leading-tight text-slate-500" style={{ width: LEFT }}>
              <span>Técnicos / hora</span><span className="text-[11px] font-bold text-amber-600">Pico: {peak} téc</span>
              <span className="text-[9px] font-normal normal-case text-slate-400">rojo = supera el tope ({topeC} téc)</span>
            </div>
            <div className="relative shrink-0" style={{ width: timelineW }}>
              {histo.map((c, h) => c > 0 ? <div key={h} className="absolute bottom-3.5" style={{ left: h * hourW, width: Math.max(hourW - 1, 2) }}><div className="mx-auto w-[80%] rounded-t" style={{ height: Math.max((c / peak) * 46, 2), background: c > topeC ? '#dc2626' : c > peak * 0.66 ? '#f59e0b' : '#10b981' }} /></div> : null)}
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

      {hitoModal && (
        <div role="dialog" aria-modal="true" onClick={() => setHitoModal(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">🛑 Hito de entrega de Operaciones</h3>
            <p className="mb-3 text-xs text-slate-500">Operaciones para su equipo (celdas / bombas) a esta hora; recién entonces pueden iniciar los trabajos del sistema. El hito bloquea esas tareas y empuja las que arrancan antes.</p>
            <label className="mb-2 block text-xs font-medium text-slate-600">Sistema / equipo
              <select value={hitoArea} onChange={(e) => setHitoArea(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                {[...new Set(tareas.map(sysOf))].filter((s) => s && s !== 'General').sort().map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="mb-3 block text-xs font-medium text-slate-600">Hora de entrega (paro de Operaciones)
              <input type="datetime-local" value={hitoFecha} onChange={(e) => setHitoFecha(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setHitoModal(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={crearHitoEntrega} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700">Crear hito + bloquear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Cell({ w, l, children }: { w: number; l?: boolean; children?: React.ReactNode }) {
  return <div className={`flex items-center overflow-hidden border-slate-100 px-1.5 ${l ? '' : 'justify-center border-l'}`} style={{ width: w }}>{children}</div>
}
