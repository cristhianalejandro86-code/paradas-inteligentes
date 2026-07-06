import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { getTareasByParada, updateTareaEspec, getCuadrillasConfig, getUsuarios } from '../lib/api'
import type { Previo } from '../lib/api'
import { useColWidth, useColWidths, ColResizeHandle } from '../components/ColResize'
import { equipoDe } from '../lib/andamios'
import type { EquipoKey } from '../lib/andamios'
import { exportarPreparacion } from '../lib/excel'
import { rutaCritica } from '../lib/criticalPath'
import { useRefreshOnFocus } from '../lib/useRefreshOnFocus'
import type { Tecnico } from '../lib/resourceLeveling'
import type { Parada, Tarea } from '../types'

const DAY = 86400000
const TIPOS = ['Herramienta', 'Equipo', 'Máquina soldar', 'Bomba', 'Material/Perno', 'Tubería', 'Andamio', 'Otro'] as const
type Estado = 'falta' | 'en_ruta' | 'listo'
type Item = { t: string; n: string; q: number; e: Estado; lead?: number }

const esp = (t: Tarea) => t.especificaciones_tecnicas ?? {}
const sysOf = (t: Tarea) => (esp(t).sistema as string) || 'General'
const lineaOf = (t: Tarea) => String(esp(t).linea ?? '').trim()
const grpOf = (t: Tarea) => (esp(t).grupo as string) || ''
// Sanea cada ítem: un registro malformado (n/q/e ausentes o de otro tipo) NO debe
// reventar el tablero (it.n.trim() sobre undefined tiraba TypeError dentro del useMemo).
const itemsDe = (t: Tarea): Item[] => {
  const raw = esp(t).recursos
  if (!Array.isArray(raw)) return []
  return raw.map((i: Partial<Item> | null) => ({
    t: String(i?.t ?? 'Otro'),
    n: String(i?.n ?? '').trim(),
    q: Number.isFinite(Number(i?.q)) ? Number(i?.q) : 0,
    e: (i?.e === 'listo' || i?.e === 'en_ruta' ? i.e : 'falta') as Estado,
    lead: Number.isFinite(Number(i?.lead)) ? Number(i?.lead) : 0,
  }))
}
// "Pedir YA": el ítem no está listo y su lead-time supera los días que faltan para
// el inicio → si no se pide hoy, no llega a tiempo. (diasInicio null = sin fecha → no alerta)
const urgenteItem = (it: Item, diasInicio: number | null) => it.e !== 'listo' && (it.lead ?? 0) > 0 && diasInicio != null && (it.lead ?? 0) > diasInicio
const matNA = (t: Tarea) => !!esp(t).matNA
const permisoDe = (t: Tarea) => !!esp(t).permiso
const conCuadrilla = (t: Tarea) => { const g = grpOf(t); const a = esp(t).asignados as unknown[]; return (!!g && g !== '—') || (Array.isArray(a) && a.length > 0) }
// Especialidad legible de un técnico (oficial mecánico, soldador 3G/4G, andamiero…).
const espTec = (u: Tecnico) => u.especialidad || u.cargo || (u.rol ? String(u.rol).replace(/_/g, ' ') : '') || ''
// Previos por ACTIVIDAD (lo que hay que preparar antes de empezar ESA tarea: separar
// sus pernos, verificar sus medidas, llevar su aceite…). Saneado: un registro
// malformado no debe romper el tablero.
const previosDe = (t: Tarea): Previo[] => {
  const raw = esp(t).previos
  if (!Array.isArray(raw)) return []
  return raw.map((p: Partial<Previo> | null) => ({
    id: String(p?.id ?? ''),
    texto: String(p?.texto ?? '').trim(),
    estado: (p?.estado === 'hecho' || p?.estado === 'en_proceso' ? p.estado : 'pendiente') as Previo['estado'],
  })).filter((p) => p.texto)
}
const avancePrevioDe = (t: Tarea) => {
  const ps = previosDe(t)
  if (!ps.length) return { has: false, pct: 0, hechos: 0, total: 0 }
  const hechos = ps.filter((p) => p.estado === 'hecho').length
  const proceso = ps.filter((p) => p.estado === 'en_proceso').length
  return { has: true, pct: Math.round(((hechos + proceso * 0.5) / ps.length) * 100), hechos, total: ps.length }
}
const esTrabajo = (t: Tarea) => !esp(t).hito_inicio && Number(t.duracion_estimada_horas ?? 0) > 0

// materiales listo = marcado "no requiere" o todos los ítems en estado listo
const matListo = (t: Tarea) => { const it = itemsDe(t); return matNA(t) || (it.length > 0 && it.every((i) => i.e === 'listo')) }
const matEstado = (t: Tarea): 'listo' | 'falta' | 'en_ruta' | 'sin_definir' => {
  if (matNA(t)) return 'listo'
  const it = itemsDe(t); if (!it.length) return 'sin_definir'
  if (it.every((i) => i.e === 'listo')) return 'listo'
  return it.some((i) => i.e === 'falta') ? 'falta' : 'en_ruta'
}
// Previos OK = no quedan previos pendientes en esa actividad (sin previos = nada que preparar).
const previosOK = (t: Tarea) => previosDe(t).every((p) => p.estado === 'hecho')
const listaParaArrancar = (t: Tarea) => conCuadrilla(t) && matListo(t) && permisoDe(t) && previosOK(t)

/**
 * Tablero de PREPARACIÓN (readiness) — fase pre-parada. Mide por tarea: CUADRILLA +
 * MATERIALES/RECURSOS + PERMISO. Los recursos se listan a detalle (herramientas,
 * equipos, máquinas de soldar, bombas, pernos, tuberías…) con estado, y se consolidan
 * en una lista total de lo que la parada necesita.
 */
export function PreparacionPage() {
  const { id } = useParams<{ id: string }>()
  const parada = useOutletContext<Parada | undefined>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lineaF, setLineaF] = useState('Todas')
  const [soloPend, setSoloPend] = useState(true)
  const [editRec, setEditRec] = useState<Tarea | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulkGrupo, setBulkGrupo] = useState('')
  const [bulkSnap, setBulkSnap] = useState<{ items: { id: string; prev: Record<string, unknown> }[]; etiqueta: string } | null>(null)
  const [sysF, setSysF] = useState('Todos')
  const [grpF, setGrpF] = useState('Todos')
  const [faltaF, setFaltaF] = useState<'Todas' | 'cuadrilla' | 'recursos' | 'permiso'>('Todas')
  // Filtros de la fila bajo los encabezados (estilo Excel), combinables con los de arriba.
  const [qF, setQF] = useState('')
  const [supF, setSupF] = useState('')
  const [permF, setPermF] = useState<'' | 'si' | 'no'>('')
  const [estF, setEstF] = useState<'' | 'lista' | 'pend'>('')
  const [config, setConfig] = useState<Record<string, { tecnicos?: Tecnico[] }>>({})
  const [editPrev, setEditPrev] = useState<Tarea | null>(null)
  const [editEq, setEditEq] = useState<{ t: Tarea; k: EquipoKey } | null>(null)
  const [usuarios, setUsuarios] = useState<Tecnico[]>([])
  const { w: actW, onResize: onActResize } = useColWidth('prep-act-w')
  // Anchos arrastrables del resto de columnas del alistamiento.
  const { w: pw, resizeFor } = useColWidths('prep-cols-w', { cuad: 150, sup: 150, rec: 190, and: 120, prev: 160, perm: 80, est: 90 }, 56)

  const reload = () => id && getTareasByParada(id).then(setTareas).catch((e) => setError(e.message))
  useEffect(() => { if (!id) return; setLoading(true); getTareasByParada(id).then(setTareas).catch((e) => setError(e.message)).finally(() => setLoading(false)) }, [id])
  useEffect(() => { if (id) getCuadrillasConfig(id).then(setConfig).catch(() => {}) }, [id])
  useEffect(() => { getUsuarios().then(setUsuarios).catch(() => {}) }, [])
  useRefreshOnFocus(reload)
  // Supervisores asignables (mismo criterio que la Lista); se guarda el nombre en espec.supervisor.
  const supervisores = useMemo(() => usuarios.filter((u) => /superv|residente|jefe/i.test(`${u.rol} ${u.cargo ?? ''} ${u.especialidad ?? ''}`)).sort((a, b) => a.nombre.localeCompare(b.nombre)), [usuarios])
  // Técnicos de una actividad: los nominados en la tarea (asignados) o, si no, el
  // roster de su cuadrilla (definido en la vista Cuadrillas). Trae su especialidad.
  const tecnicosDe = (t: Tarea): Tecnico[] => {
    const asig = esp(t).asignados as Tecnico[] | undefined
    if (Array.isArray(asig) && asig.length) return asig
    const g = grpOf(t)
    return (g && config[g]?.tecnicos) || []
  }

  const lineas = useMemo(() => [...new Set(tareas.map(lineaOf).filter(Boolean))].sort(), [tareas])
  const gruposExist = useMemo(() => [...new Set(tareas.map(grpOf).filter((g) => g && g !== '—'))].sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0)), [tareas])
  const supsEnUso = useMemo(() => [...new Set(tareas.map((t) => String(esp(t).supervisor ?? '')).filter(Boolean))].sort(), [tareas])
  const sistemas = useMemo(() => [...new Set(tareas.filter(esTrabajo).map(sysOf).filter(Boolean))].sort(), [tareas])

  function guardar(t: Tarea, patch: Record<string, unknown>) {
    const next = { ...esp(t), ...patch }
    setTareas((ts) => ts.map((x) => (x.id === t.id ? { ...x, especificaciones_tecnicas: next } : x)))
    updateTareaEspec(t.id, next).catch((e) => setError(String(e)))
  }
  // Edición MASIVA: aplica un patch de especificaciones a todas las tareas seleccionadas.
  function bulkAplicar(patch: Record<string, unknown>, etiqueta: string) {
    const ids = new Set(sel)
    if (!ids.size) return
    // Snapshot de las especificaciones previas para poder DESHACER.
    const snap = [...ids].map((id) => { const t = tareas.find((x) => x.id === id); return t ? { id, prev: { ...esp(t) } } : null }).filter(Boolean) as { id: string; prev: Record<string, unknown> }[]
    setBulkSnap({ items: snap, etiqueta: `${snap.length} tarea(s) · ${etiqueta}` })
    setTareas((ts) => ts.map((x) => (ids.has(x.id) ? { ...x, especificaciones_tecnicas: { ...(x.especificaciones_tecnicas ?? {}), ...patch } } : x)))
    Promise.all([...ids].map((id) => { const t = tareas.find((x) => x.id === id); return t ? updateTareaEspec(id, { ...esp(t), ...patch }) : Promise.resolve() })).catch((e) => setError(String(e)))
    setSel(new Set())
  }
  function deshacerBulk() {
    if (!bulkSnap) return
    const items = bulkSnap.items
    setTareas((ts) => ts.map((x) => { const s = items.find((i) => i.id === x.id); return s ? { ...x, especificaciones_tecnicas: s.prev } : x }))
    Promise.all(items.map((s) => updateTareaEspec(s.id, s.prev))).catch((e) => setError(String(e)))
    setBulkSnap(null)
  }
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const scope = useMemo(() => tareas.filter(esTrabajo).filter((t) => lineaF === 'Todas' || lineaOf(t) === lineaF), [tareas, lineaF])
  const criticas = useMemo(() => rutaCritica(tareas).criticas, [tareas])

  // Días para el inicio de la parada (fecha planeada o el arranque más temprano).
  const diasParaInicio = useMemo(() => {
    const ms = parada?.fecha_inicio_planeada ? new Date(parada.fecha_inicio_planeada).getTime() : Math.min(...tareas.map((t) => (t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : Infinity)).filter(isFinite))
    return Number.isFinite(ms) ? Math.ceil((ms - Date.now()) / DAY) : null
  }, [parada, tareas])

  const d = useMemo(() => {
    const total = scope.length
    const listas = scope.filter(listaParaArrancar).length
    const sinCuad = scope.filter((t) => !conCuadrilla(t)).length
    const sinMat = scope.filter((t) => !matListo(t)).length
    const sinPerm = scope.filter((t) => !permisoDe(t)).length
    const pct = total ? Math.round((listas / total) * 100) : 0
    // Readiness de la RUTA CRÍTICA: un faltante aquí pesa mucho más que con holgura.
    const crit = scope.filter((t) => criticas.has(t.id))
    const critListas = crit.filter(listaParaArrancar).length
    const faltaOK = (t: Tarea) => faltaF === 'Todas' || (faltaF === 'cuadrilla' ? !conCuadrilla(t) : faltaF === 'recursos' ? !matListo(t) : !permisoDe(t))
    const lista = [...scope].sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0))
      .filter((t) => (!soloPend || !listaParaArrancar(t)) && (sysF === 'Todos' || sysOf(t) === sysF) && (grpF === 'Todos' || grpOf(t) === grpF) && faltaOK(t)
        && (!qF || t.nombre.toLowerCase().includes(qF.toLowerCase()))
        && (!supF || (supF === '(sin)' ? !esp(t).supervisor : String(esp(t).supervisor ?? '') === supF))
        && (!permF || (permF === 'si' ? permisoDe(t) : !permisoDe(t)))
        && (!estF || (estF === 'lista' ? listaParaArrancar(t) : !listaParaArrancar(t))))
    return { total, listas, sinCuad, sinMat, sinPerm, pct, lista, critTotal: crit.length, critListas }
  }, [scope, soloPend, sysF, grpF, faltaF, criticas, qF, supF, permF, estF])

  // Consolidado: suma de todos los ítems del scope por tipo+nombre + flag "pedir YA"
  // (algún ítem con lead > días al inicio y sin estar listo).
  const consolidado = useMemo(() => {
    const m: Record<string, { t: string; n: string; total: number; listos: number; faltan: number; leadMax: number; urgente: boolean }> = {}
    for (const tk of scope) for (const it of itemsDe(tk)) {
      const k = `${it.t}|${it.n.trim().toLowerCase()}`
      const row = (m[k] ??= { t: it.t, n: it.n.trim(), total: 0, listos: 0, faltan: 0, leadMax: 0, urgente: false })
      row.total += it.q || 0
      if (it.e === 'listo') row.listos += it.q || 0
      if (it.e === 'falta') row.faltan += it.q || 0
      row.leadMax = Math.max(row.leadMax, it.lead ?? 0)
      if (urgenteItem(it, diasParaInicio)) row.urgente = true
    }
    return Object.values(m).sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.t.localeCompare(b.t) || a.n.localeCompare(b.n))
  }, [scope, diasParaInicio])
  const porPedirYa = consolidado.filter((r) => r.urgente).length
  // Totales de EQUIPOS COMPARTIDOS (andamios/soldadoras/grúa) para dimensionar contratos.
  const totEq = useMemo(() => {
    const acc: Record<EquipoKey, { c: number; acts: number }> = { andamios: { c: 0, acts: 0 }, soldadoras: { c: 0, acts: 0 }, grua: { c: 0, acts: 0 } }
    for (const t of scope) for (const k of ['andamios', 'soldadoras', 'grua'] as EquipoKey[]) {
      const a = equipoDe(t, k); if (a.c > 0) { acc[k].c += a.c; acc[k].acts++ }
    }
    return acc
  }, [scope])

  if (loading) return <p className="text-sm text-slate-400">Cargando preparación…</p>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>

  const color = d.pct >= 90 ? 'text-emerald-600' : d.pct >= 60 ? 'text-amber-600' : 'text-red-600'
  const ring = d.pct >= 90 ? '#16a34a' : d.pct >= 60 ? '#d97706' : '#dc2626'
  const badge = (e: ReturnType<typeof matEstado>) => e === 'listo' ? 'bg-emerald-100 text-emerald-700' : e === 'en_ruta' ? 'bg-amber-100 text-amber-700' : e === 'falta' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-400'
  const txt = (e: ReturnType<typeof matEstado>) => e === 'listo' ? '✓ Listo' : e === 'en_ruta' ? '⏳ En ruta' : e === 'falta' ? '❌ Falta' : '— definir'

  return (
    <div className="grid gap-4">
      {/* GAUGE + cuenta regresiva */}
      <div className="flex flex-wrap items-center gap-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="relative grid h-28 w-28 shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#f1f5f9" strokeWidth="10" />
            <circle cx="50" cy="50" r="44" fill="none" stroke={ring} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(d.pct / 100) * 276.5} 276.5`} />
          </svg>
          <div className="absolute text-center"><div className={`text-2xl font-bold ${color}`}>{d.pct}%</div><div className="text-[10px] text-slate-400">listo</div></div>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-900">Preparación de la parada</h2>
          <p className="text-sm text-slate-500"><b className="text-slate-700">{d.listas}</b> de {d.total} actividades listas (cuadrilla + recursos + permiso).</p>
          {d.critTotal > 0 && (
            <p className={`mt-1 text-sm font-semibold ${d.critListas === d.critTotal ? 'text-emerald-600' : 'text-red-600'}`} title="Las actividades de la ruta crítica: un faltante aquí atrasa toda la parada">
              🔴 Ruta crítica: {d.critListas}/{d.critTotal} listas{d.critListas < d.critTotal && ' — prioriza estas'}
            </p>
          )}
          {diasParaInicio != null && <p className={`mt-1 text-sm font-semibold ${diasParaInicio <= 0 ? 'text-red-600' : diasParaInicio <= 3 ? 'text-amber-600' : 'text-slate-600'}`}>{diasParaInicio > 0 ? `⏳ Faltan ${diasParaInicio} día(s) para el inicio` : '🚨 La parada ya debió iniciar'}{porPedirYa > 0 && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700" title="Recursos cuyo lead-time supera los días que faltan: pídelos hoy o no llegan">🛒 {porPedirYa} por pedir YA</span>}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Block n={d.sinCuad} label="sin cuadrilla" tone="amber" />
          <Block n={d.sinMat} label="sin recursos" tone="red" />
          <Block n={d.sinPerm} label="sin permiso" tone="red" />
        </div>
      </div>

      {/* CONSOLIDADO de recursos necesarios */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">🧰 Recursos necesarios para la parada {lineaF !== 'Todas' && <span className="text-xs font-normal text-fuchsia-600">({lineaF})</span>}
            {totEq.andamios.c > 0 && <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-300" title={`${totEq.andamios.acts} actividad(es) requieren andamio`}>🏗 {totEq.andamios.c} cuerpos · {totEq.andamios.acts} act</span>}
            {totEq.soldadoras.c > 0 && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300" title={`${totEq.soldadoras.acts} actividad(es) requieren máquina de soldar`}>🔥 {totEq.soldadoras.c} soldadoras · {totEq.soldadoras.acts} act</span>}
            {totEq.grua.c > 0 && <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-300" title={`${totEq.grua.acts} actividad(es) requieren grúa móvil`}>🚛 {totEq.grua.c} grúas · {totEq.grua.acts} act</span>}
          </h3>
          <button onClick={() => exportarPreparacion(tareas, parada?.nombre ?? 'parada', lineaF)} title="Descarga un Excel para Compras/Logística: hoja Recursos (qué comprar/alquilar, cuánto, cuánto falta) + hoja Alistamiento (estado por actividad)" className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">⬇ Exportar a Excel (Compras)</button>
        </div>
        {consolidado.length === 0 ? (
          <p className="text-xs text-slate-400">Aún no se han listado recursos por tarea. Abre una tarea abajo y agrega sus herramientas, equipos, máquinas, pernos, etc.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {consolidado.map((r) => (
              <div key={`${r.t}-${r.n}`} className={`rounded-lg border px-2 py-1 text-xs ${r.urgente ? 'border-red-400 bg-red-50 ring-1 ring-red-300' : r.faltan > 0 ? 'border-red-200 bg-red-50' : r.listos >= r.total ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} title={`${r.t}: ${r.listos}/${r.total} listos${r.faltan ? `, faltan ${r.faltan}` : ''}${r.leadMax ? ` · lead ${r.leadMax}d` : ''}`}>
                <span className="font-semibold text-slate-700">{r.n}</span> <span className="text-slate-400">×{r.total}</span>
                <span className="ml-1 text-[10px] text-slate-400">({r.t})</span>
                {r.faltan > 0 ? <span className="ml-1 font-semibold text-red-600">faltan {r.faltan}</span> : r.listos >= r.total ? <span className="ml-1 text-emerald-600">✓</span> : <span className="ml-1 text-amber-600">{r.listos}/{r.total}</span>}
                {r.urgente && <span className="ml-1 rounded bg-red-600 px-1 font-bold text-white" title={`Lead ${r.leadMax}d > ${diasParaInicio}d para el inicio`}>🛒 PEDIR YA</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* lista accionable */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 text-xs">
          <h3 className="text-sm font-semibold text-slate-700">Alistamiento por actividad</h3>
          {lineas.length > 0 && (
            <select value={lineaF} onChange={(e) => setLineaF(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
              <option value="Todas">Todas las líneas</option>
              {lineas.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          <select value={sysF} onChange={(e) => setSysF(e.target.value)} title="Filtrar por sistema/equipo" className="max-w-[10rem] rounded border border-slate-300 px-2 py-1"><option value="Todos">Todo sistema</option>{sistemas.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <select value={grpF} onChange={(e) => setGrpF(e.target.value)} title="Filtrar por cuadrilla" className="rounded border border-slate-300 px-2 py-1"><option value="Todos">Toda cuadrilla</option>{gruposExist.map((g) => <option key={g} value={g}>{g}</option>)}</select>
          <select value={faltaF} onChange={(e) => setFaltaF(e.target.value as typeof faltaF)} title="Filtrar por lo que falta" className="rounded border border-slate-300 px-2 py-1"><option value="Todas">Falta: cualquiera</option><option value="cuadrilla">sin cuadrilla</option><option value="recursos">sin recursos</option><option value="permiso">sin permiso</option></select>
          <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" checked={soloPend} onChange={(e) => setSoloPend(e.target.checked)} className="accent-amber-500" />Solo pendientes</label>
          <span className="text-slate-400">{d.lista.length} actividades</span>
          {bulkSnap && sel.size === 0 && (
            <button onClick={deshacerBulk} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 font-medium text-slate-600 hover:bg-slate-50" title="Revierte la última edición masiva">↶ Deshacer ({bulkSnap.etiqueta})</button>
          )}
          {sel.size > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1">
              <span className="font-semibold text-amber-800">{sel.size} sel.</span>
              <span className="text-slate-400">aplicar a todas:</span>
              <button onClick={() => bulkAplicar({ permiso: true }, 'permiso ✓')} className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 hover:bg-emerald-200">Permiso ✓</button>
              <button onClick={() => bulkAplicar({ permiso: false }, 'permiso ✗')} className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 hover:bg-red-200">Permiso ✗</button>
              <button onClick={() => bulkAplicar({ matNA: true }, 'sin recursos')} title="Marcar que no requieren recursos" className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-slate-200">Sin recursos</button>
              <button onClick={() => bulkAplicar({ matNA: false }, 'requiere recursos')} title="Quitar 'no requiere recursos'" className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-slate-200">Requiere</button>
              <span className="flex items-center gap-1"><input list="grupos-dl-bulk" value={bulkGrupo} onChange={(e) => setBulkGrupo(e.target.value)} placeholder="cuadrilla" className="w-20 rounded border border-slate-300 px-1 py-0.5" /><button onClick={() => { const g = bulkGrupo.trim(); if (g) { bulkAplicar({ grupo: g }, `cuadrilla ${g}`); setBulkGrupo('') } }} title="Asignar esta cuadrilla a las seleccionadas" className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700 hover:bg-blue-200">Cuadrilla →</button></span>
              <button onClick={() => setSel(new Set())} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-slate-500 hover:bg-slate-50">Limpiar</button>
              <datalist id="grupos-dl-bulk">{gruposExist.map((g) => <option key={g} value={g} />)}</datalist>
            </div>
          )}
        </div>
        <div className="overflow-auto" style={{ maxHeight: '60vh' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-2" style={{ width: 36, minWidth: 36, maxWidth: 36 }}><input type="checkbox" title="Seleccionar todas (visibles)" checked={d.lista.length > 0 && d.lista.every((t) => sel.has(t.id))} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) d.lista.forEach((t) => n.add(t.id)); else d.lista.forEach((t) => n.delete(t.id)); return n })} className="accent-amber-500" /></th>
                <th className="px-2 py-2 text-left" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>#</th><th className="relative px-2 py-2 text-left" style={{ width: actW, minWidth: actW }}>Actividad<ColResizeHandle onResize={onActResize} /></th><th className="relative px-2 py-2 text-center" style={{ width: pw.cuad, minWidth: pw.cuad }}>Cuadrilla / Técnicos<ColResizeHandle onResize={resizeFor('cuad')} /></th><th className="relative px-2 py-2 text-center" style={{ width: pw.sup, minWidth: pw.sup }}>Supervisor<ColResizeHandle onResize={resizeFor('sup')} /></th><th className="relative px-2 py-2 text-center" style={{ width: pw.rec, minWidth: pw.rec }}>Recursos (herram./equipo/material)<ColResizeHandle onResize={resizeFor('rec')} /></th><th className="relative px-2 py-2 text-center" style={{ width: pw.and, minWidth: pw.and }}>Equipos (🏗/🔥/🚛)<ColResizeHandle onResize={resizeFor('and')} /></th><th className="relative px-2 py-2 text-center" style={{ width: pw.prev, minWidth: pw.prev }}>Previos (separar pernos, medidas…)<ColResizeHandle onResize={resizeFor('prev')} /></th><th className="relative px-2 py-2 text-center" style={{ width: pw.perm, minWidth: pw.perm }}>Permiso<ColResizeHandle onResize={resizeFor('perm')} /></th><th className="relative px-2 py-2 text-center" style={{ width: pw.est, minWidth: pw.est }}>Estado<ColResizeHandle onResize={resizeFor('est')} /></th>
              </tr>
              {/* fila de FILTROS por columna (estilo Excel), combinables con los de arriba */}
              <tr className="bg-slate-100/80 normal-case tracking-normal">
                <td className="px-1 py-1 text-center">{(qF || supF || permF || estF || grpF !== 'Todos' || lineaF !== 'Todas') && <button onClick={() => { setQF(''); setSupF(''); setPermF(''); setEstF(''); setGrpF('Todos'); setLineaF('Todas') }} title="Limpiar todos los filtros" className="rounded bg-slate-200 px-1 text-[10px] text-slate-600 hover:bg-slate-300">✕</button>}</td>
                <td />
                <td className="px-1 py-1">
                  <div className="flex items-center gap-1">
                    <input value={qF} onChange={(e) => setQF(e.target.value)} placeholder="🔍 buscar actividad…" className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]" />
                    {lineas.length > 0 && (
                      <select value={lineaF} onChange={(e) => setLineaF(e.target.value)} title="Filtrar por línea" className={`rounded border px-0.5 py-0.5 text-[10px] ${lineaF !== 'Todas' ? 'border-fuchsia-400 bg-fuchsia-50 font-medium text-fuchsia-700' : 'border-slate-200 bg-white text-slate-500'}`}>
                        <option value="Todas">línea: todas</option>
                        {lineas.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    )}
                  </div>
                </td>
                <td className="px-1 py-1"><select value={grpF} onChange={(e) => setGrpF(e.target.value)} className={`w-full rounded border px-0.5 py-0.5 text-[10px] ${grpF !== 'Todos' ? 'border-amber-400 bg-amber-50 font-medium text-amber-800' : 'border-slate-200 bg-white text-slate-500'}`}><option value="Todos">todas</option>{gruposExist.map((g) => <option key={g} value={g}>{g}</option>)}</select></td>
                <td className="px-1 py-1"><select value={supF} onChange={(e) => setSupF(e.target.value)} className={`w-full rounded border px-0.5 py-0.5 text-[10px] ${supF ? 'border-amber-400 bg-amber-50 font-medium text-amber-800' : 'border-slate-200 bg-white text-slate-500'}`}><option value="">todos</option><option value="(sin)">— sin asignar</option>{supsEnUso.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                <td /><td /><td />
                <td className="px-1 py-1"><select value={permF} onChange={(e) => setPermF(e.target.value as typeof permF)} className={`w-full rounded border px-0.5 py-0.5 text-[10px] ${permF ? 'border-amber-400 bg-amber-50 font-medium text-amber-800' : 'border-slate-200 bg-white text-slate-500'}`}><option value="">todos</option><option value="si">✓ OK</option><option value="no">✗ falta</option></select></td>
                <td className="px-1 py-1"><select value={estF} onChange={(e) => setEstF(e.target.value as typeof estF)} className={`w-full rounded border px-0.5 py-0.5 text-[10px] ${estF ? 'border-amber-400 bg-amber-50 font-medium text-amber-800' : 'border-slate-200 bg-white text-slate-500'}`}><option value="">todos</option><option value="lista">LISTA</option><option value="pend">pendiente</option></select></td>
              </tr>
            </thead>
            <tbody>
              {d.lista.map((t) => {
                const ok = listaParaArrancar(t), me = matEstado(t), n = itemsDe(t).length
                return (
                  <tr key={t.id} className={`border-b border-slate-50 hover:bg-slate-50/50 ${sel.has(t.id) ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleSel(t.id)} className="accent-amber-500" /></td>
                    <td className="px-2 py-1.5 text-slate-400">{t.secuencia}</td>
                    <td className="px-2 py-1.5" style={{ width: actW, minWidth: actW, maxWidth: actW }}><div className="truncate font-medium text-slate-700" title={t.nombre}>{criticas.has(t.id) && <span className="mr-1 text-red-600" title="Ruta crítica">🔴</span>}{t.nombre}</div><div className="text-[10px] text-slate-400">{sysOf(t)}{lineaOf(t) ? ` · ${lineaOf(t)}` : ''}</div></td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="flex flex-col items-center gap-1">
                        {conCuadrilla(t) ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">✓ {grpOf(t) || 'asignada'}</span> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">✗ falta</span>}
                        {(() => {
                          const tecs = tecnicosDe(t)
                          if (tecs.length) return (
                            <div className="flex flex-wrap justify-center gap-0.5">
                              {tecs.map((u, i) => (
                                <span key={u.id ?? i} className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0.5 text-[9px]" title={`${u.nombre}${espTec(u) ? ` · ${espTec(u)}` : ''}`}>
                                  <span className="font-medium text-slate-700">{(u.nombre || '').split(' ').slice(0, 2).join(' ')}</span>
                                  {espTec(u) && <span className="text-violet-600">{espTec(u)}</span>}
                                </span>
                              ))}
                            </div>
                          )
                          const g = grpOf(t)
                          if (g && g !== '—') return <span className="text-[9px] text-slate-400" title="Asigna los técnicos de esta cuadrilla en la vista Cuadrillas (botón 👤)">sin técnicos asignados</span>
                          return null
                        })()}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center" style={{ maxWidth: 150 }}>
                      <select value={String(esp(t).supervisor ?? '')} onChange={(e) => guardar(t, { supervisor: e.target.value })} title="Supervisor responsable de la actividad" className={`w-full max-w-[9rem] rounded border border-transparent bg-transparent py-0.5 text-[11px] hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none ${esp(t).supervisor ? 'font-medium text-slate-700' : 'text-slate-400'}`}>
                        <option value="">— sup.</option>
                        {String(esp(t).supervisor ?? '') !== '' && !supervisores.some((u) => u.nombre === esp(t).supervisor) && <option value={String(esp(t).supervisor)}>{String(esp(t).supervisor)}</option>}
                        {supervisores.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => setEditRec(t)} className={`rounded px-2 py-0.5 text-[11px] font-medium ${badge(me)}`} title="Listar herramientas, equipos, materiales…">
                        {matNA(t) ? '— no requiere' : n ? `🧰 ${n} ítem(s) · ${txt(me)}` : '➕ listar recursos'}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-0.5">
                        {(([['andamios', '🏗', 'bg-orange-100 text-orange-700'], ['soldadoras', '🔥', 'bg-red-100 text-red-700'], ['grua', '🚛', 'bg-sky-100 text-sky-700']]) as [EquipoKey, string, string][]).map(([k, ic, on]) => {
                          const a = equipoDe(t, k)
                          return (
                            <button key={k} onClick={() => setEditEq({ t, k })}
                              title={`${k === 'andamios' ? 'Cuerpos de andamio' : k === 'soldadoras' ? 'Máquinas de soldar' : 'Grúas móviles'}${a.det ? `\n${a.det}` : ''}`}
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${a.c > 0 ? on : 'bg-slate-100 text-slate-400'}`}>
                              {ic}{a.c > 0 ? ` ${a.c}${a.det ? '📝' : ''}` : '+'}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {(() => {
                        const a = avancePrevioDe(t)
                        const cls = !a.has ? 'bg-slate-100 text-slate-400' : a.pct >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        return <button onClick={() => setEditPrev(t)} className={`rounded px-2 py-0.5 text-[11px] font-medium ${cls}`} title="Previos de esta actividad: separar sus pernos, verificar sus medidas, llevar su aceite…">{a.has ? `✅ ${a.hechos}/${a.total} · ${a.pct}%` : '➕ previos'}</button>
                      })()}
                    </td>
                    <td className="px-2 py-1.5 text-center"><button onClick={() => guardar(t, { permiso: !permisoDe(t) })} className={`rounded px-2 py-0.5 text-[11px] font-medium ${permisoDe(t) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{permisoDe(t) ? '✓ OK' : '✗ falta'}</button></td>
                    <td className="px-2 py-1.5 text-center">{ok ? <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white">LISTA</span> : <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500">pendiente</span>}</td>
                  </tr>
                )
              })}
              {d.lista.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-emerald-600">🎉 Todo listo para arrancar en este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editRec && <RecursosModal tarea={editRec} onClose={() => setEditRec(null)} onSave={(items, na) => { guardar(editRec, { recursos: items, matNA: na }); setEditRec(null) }} />}
      {editPrev && <PreviosModal tarea={editPrev} onClose={() => setEditPrev(null)} onSave={(prev) => { guardar(editPrev, { previos: prev }); setEditPrev(null) }} />}
      {editEq && <EquipoModal tarea={editEq.t} k={editEq.k} onClose={() => setEditEq(null)} onSave={(c, det) => { guardar(editEq.t, { [editEq.k]: c > 0 || det ? { c, det } : null }); setEditEq(null) }} />}
    </div>
  )
}

const EQ_CFG: Record<EquipoKey, { titulo: string; unidad: string; icono: string; ph: string }> = {
  andamios: { titulo: 'Andamios de la actividad', unidad: 'Cuerpos de andamio', icono: '🏗', ph: 'Ej.: 2 cuerpos en plataforma del acondicionador 1002, tipo torre 1.5×1.5 m, altura 4 m.\nArmado el 19/07 antes de la entrega. Con rodapiés y barandas.' },
  soldadoras: { titulo: 'Máquinas de soldar de la actividad', unidad: 'Máquinas de soldar', icono: '🔥', ph: 'Ej.: 1 máquina 350 A para soldadura 3G en la brida norte; cable de 30 m; llega con el contratista X.' },
  grua: { titulo: 'Grúas móviles de la actividad', unidad: 'Grúas / camión grúa', icono: '🚛', ph: 'Ej.: 1 camión grúa de 20 t para izaje del carrete; posicionar en plataforma sur; maniobra de 2 h.' },
}

function EquipoModal({ tarea, k, onClose, onSave }: { tarea: Tarea; k: EquipoKey; onClose: () => void; onSave: (c: number, det: string) => void }) {
  const cfg = EQ_CFG[k]
  const a = equipoDe(tarea, k)
  const [c, setC] = useState(a.c)
  const [det, setDet] = useState(a.det)
  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-900">{cfg.icono} {cfg.titulo}</h3>
        <p className="mb-3 truncate text-xs text-slate-500" title={tarea.nombre}>{tarea.nombre}</p>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          {cfg.unidad}:
          <input type="number" min={0} value={c} onChange={(e) => setC(Math.max(0, Math.round(Number(e.target.value) || 0)))} className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-center" />
        </label>
        <label className="block text-xs font-medium text-slate-500">Detallado (dónde, tipo, capacidad, cuándo debe estar listo…)</label>
        <textarea value={det} onChange={(e) => setDet(e.target.value)} rows={4} placeholder={cfg.ph} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => onSave(c, det.trim())} className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">Guardar</button>
        </div>
      </div>
    </div>
  )
}

function PreviosModal({ tarea, onClose, onSave }: { tarea: Tarea; onClose: () => void; onSave: (previos: Previo[]) => void }) {
  const [items, setItems] = useState<Previo[]>(previosDe(tarea).map((p) => ({ ...p, id: p.id || crypto.randomUUID() })))
  const [nuevo, setNuevo] = useState('')
  const CICLO: Record<Previo['estado'], Previo['estado']> = { pendiente: 'en_proceso', en_proceso: 'hecho', hecho: 'pendiente' }
  const add = () => { const t = nuevo.trim(); if (!t) return; setItems((x) => [...x, { id: crypto.randomUUID(), texto: t, estado: 'pendiente' }]); setNuevo('') }
  const cycle = (pid: string) => setItems((x) => x.map((p) => (p.id === pid ? { ...p, estado: CICLO[p.estado] } : p)))
  const edit = (pid: string, texto: string) => setItems((x) => x.map((p) => (p.id === pid ? { ...p, texto } : p)))
  const del = (pid: string) => setItems((x) => x.filter((p) => p.id !== pid))
  const hechos = items.filter((p) => p.estado === 'hecho').length, proceso = items.filter((p) => p.estado === 'en_proceso').length
  const pct = items.length ? Math.round(((hechos + proceso * 0.5) / items.length) * 100) : 0
  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">✅ Previos de la actividad</h3>
          <div className="flex items-center gap-2"><div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} /></div><span className={`text-sm font-bold ${pct >= 100 ? 'text-emerald-600' : 'text-slate-700'}`}>{pct}%</span></div>
        </div>
        <p className="mb-3 truncate text-xs text-slate-500" title={tarea.nombre}>{tarea.nombre}</p>
        <div className="flex-1 overflow-auto">
          <div className="grid gap-1">
            {items.map((p) => {
              const chip = p.estado === 'hecho' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : p.estado === 'en_proceso' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-300 bg-white text-slate-400'
              const icon = p.estado === 'hecho' ? '✅ hecho' : p.estado === 'en_proceso' ? '🔄 en proceso' : '⬜ pendiente'
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <button onClick={() => cycle(p.id)} title="Cambiar estado (pendiente → en proceso → hecho)" className={`w-28 shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium ${chip}`}>{icon}</button>
                  <input defaultValue={p.texto} key={p.texto} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.texto) edit(p.id, v) }} className={`flex-1 rounded border border-slate-200 px-2 py-1 text-sm ${p.estado === 'hecho' ? 'text-slate-400 line-through' : 'text-slate-700'}`} />
                  <button onClick={() => del(p.id)} className="shrink-0 rounded px-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600" title="Eliminar">✕</button>
                </div>
              )
            })}
            {items.length === 0 && <p className="px-1 py-2 text-xs text-slate-400">Sin previos. Agrega lo que hay que preparar antes de esta actividad: separar sus pernos, verificar sus medidas, llevar el aceite, fabricar la junta…</p>}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="+ Agregar previo (ej. separar pernos de la brida)…" className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <button onClick={add} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800">Agregar</button>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => onSave(items.filter((p) => p.texto.trim()))} className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">Guardar</button>
        </div>
      </div>
    </div>
  )
}

function RecursosModal({ tarea, onClose, onSave }: { tarea: Tarea; onClose: () => void; onSave: (items: Item[], na: boolean) => void }) {
  const [items, setItems] = useState<Item[]>(itemsDe(tarea))
  const [na, setNa] = useState(matNA(tarea))
  const add = () => setItems((x) => [...x, { t: 'Herramienta', n: '', q: 1, e: 'falta', lead: 0 }])
  const upd = (i: number, p: Partial<Item>) => setItems((x) => x.map((it, j) => (j === i ? { ...it, ...p } : it)))
  const del = (i: number) => setItems((x) => x.filter((_, j) => j !== i))
  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-900">🧰 Recursos de la actividad</h3>
        <p className="mb-2 truncate text-xs text-slate-500" title={tarea.nombre}>{tarea.nombre}</p>
        <label className="mb-2 flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={na} onChange={(e) => setNa(e.target.checked)} className="accent-emerald-500" />Esta actividad no requiere recursos (marcar lista)</label>
        {!na && (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-slate-400"><tr><th className="px-1 py-1 text-left">Tipo</th><th className="px-1 py-1 text-left">Nombre (ej. Llave 24, Máquina soldar, Perno 1")</th><th className="px-1 py-1">Cant.</th><th className="px-1 py-1" title="Días de lead-time: cuánto tarda en llegar desde que se pide">Lead (d)</th><th className="px-1 py-1">Estado</th><th /></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-1 py-1"><select value={it.t} onChange={(e) => upd(i, { t: e.target.value })} className="w-full rounded border border-slate-300 px-1 py-1">{TIPOS.map((tp) => <option key={tp} value={tp}>{tp}</option>)}</select></td>
                    <td className="px-1 py-1"><input value={it.n} onChange={(e) => upd(i, { n: e.target.value })} placeholder="nombre…" className="w-full rounded border border-slate-300 px-2 py-1" /></td>
                    <td className="px-1 py-1"><input type="number" min={1} value={it.q} onChange={(e) => upd(i, { q: Math.max(1, Number(e.target.value) || 1) })} className="w-14 rounded border border-slate-300 px-1 py-1 text-center" /></td>
                    <td className="px-1 py-1"><input type="number" min={0} value={it.lead ?? 0} onChange={(e) => upd(i, { lead: Math.max(0, Number(e.target.value) || 0) })} title="Días que tarda en llegar" className="w-14 rounded border border-slate-300 px-1 py-1 text-center" /></td>
                    <td className="px-1 py-1"><select value={it.e} onChange={(e) => upd(i, { e: e.target.value as Estado })} className={`rounded border px-1 py-1 font-medium ${it.e === 'listo' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : it.e === 'en_ruta' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-red-300 bg-red-50 text-red-700'}`}><option value="falta">❌ Falta</option><option value="en_ruta">⏳ En ruta</option><option value="listo">✓ Listo</option></select></td>
                    <td className="px-1 py-1"><button onClick={() => del(i)} className="rounded px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">✕</button></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-center text-slate-400">Sin recursos. Agrega herramientas, equipos, máquinas, pernos, tuberías…</td></tr>}
              </tbody>
            </table>
            <button onClick={add} className="mt-2 rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">+ Agregar recurso</button>
          </div>
        )}
        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => onSave(na ? [] : items.filter((i) => i.n.trim()), na)} className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">Guardar</button>
        </div>
      </div>
    </div>
  )
}

function Block({ n, label, tone }: { n: number; label: string; tone: 'amber' | 'red' }) {
  const c = n === 0 ? 'bg-slate-50 text-slate-400' : tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
  return <div className={`rounded-lg px-3 py-2 text-center ${c}`}><div className="text-xl font-bold">{n}</div><div className="text-[10px] font-medium">{label}</div></div>
}
