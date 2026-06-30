import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  getTareasByParada, updateTarea, updateTareaEspec, getUsuarios, createTareasBulk,
} from '../lib/api'
import { useRefreshOnFocus } from '../lib/useRefreshOnFocus'
import { colorGrupo, disciplina as discDe } from '../lib/palette'
import { exportarExcel, descargarPlantilla, leerExcel } from '../lib/excel'
import { NuevaTareaModal } from '../components/NuevaTareaModal'
import { AsignarTecnicosModal } from '../components/AsignarTecnicosModal'
import type { Parada, Tarea, TaskStatus } from '../types'

const ESTADOS: TaskStatus[] = ['Por_Hacer', 'En_Progreso', 'En_Revision', 'Completada', 'Bloqueada', 'Cancelada']
const DISCS = ['Mecánica', 'Eléctrica', 'Instrumentación']
const esp = (t: Tarea) => (t.especificaciones_tecnicas ?? {}) as Record<string, unknown>
const grpOf = (t: Tarea) => (esp(t).grupo as string) || ''
const sysOf = (t: Tarea) => (esp(t).sistema as string) || ''
const lineaOf = (t: Tarea) => String(esp(t).linea ?? '').trim()
const discOf = (t: Tarea) => (esp(t).disciplina as string) || discDe(`${t.nombre} ${sysOf(t)}`)
const toInput = (s?: string | null) => {
  if (!s) return ''
  const d = new Date(s), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const estadoValido = (s: unknown): TaskStatus => (ESTADOS.includes(String(s) as TaskStatus) ? (String(s) as TaskStatus) : 'Por_Hacer')

export function TablaPage() {
  const { id } = useParams<{ id: string }>()
  const parada = useOutletContext<Parada | undefined>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string; rol: string; cargo?: string | null; especialidad?: string | null; area?: string | null; linea?: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [lineaF, setLineaF] = useState('Todas')
  const [creando, setCreando] = useState(false)
  const [asignando, setAsignando] = useState<Tarea | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // Ancho (arrastrable) de la columna «Actividad» para leer el nombre completo. Se recuerda.
  const [actW, setActW] = useState(() => { const s = typeof localStorage !== 'undefined' ? localStorage.getItem('tabla-act-w') : null; const n = s ? Number(s) : NaN; return Number.isFinite(n) ? Math.max(140, Math.min(680, n)) : 280 })
  const actResize = useRef<{ x0: number; w0: number } | null>(null)
  function onActResize(e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation()
    actResize.current = { x0: e.clientX, w0: actW }
    const move = (ev: PointerEvent) => { const d = actResize.current; if (!d) return; setActW(Math.max(140, Math.min(680, Math.round(d.w0 + (ev.clientX - d.x0))))) }
    const up = () => { actResize.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  useEffect(() => { try { localStorage.setItem('tabla-act-w', String(actW)) } catch { /* sin persistencia */ } }, [actW])
  const fileRef = useRef<HTMLInputElement>(null)

  const recargar = () => id && getTareasByParada(id).then(setTareas)
  useEffect(() => {
    if (!id) return
    getTareasByParada(id).then(setTareas).catch((e) => setError(e.message)).finally(() => setLoading(false))
    getUsuarios().then(setUsuarios).catch(() => {})
  }, [id])
  useRefreshOnFocus(recargar)

  const grupos = useMemo(() => [...new Set(tareas.map(grpOf).filter(Boolean))].sort(), [tareas])

  function save(idt: string, fields: Partial<Tarea>) {
    setTareas((ts) => ts.map((t) => (t.id === idt ? { ...t, ...fields } : t)))
    updateTarea(idt, fields as never).catch((e) => setError(String(e)))
  }
  function saveEspec(t: Tarea, partial: Record<string, unknown>) {
    const next = { ...esp(t), ...partial }
    setTareas((ts) => ts.map((x) => (x.id === t.id ? { ...x, especificaciones_tecnicas: next } : x)))
    updateTareaEspec(t.id, next).catch((e) => setError(String(e)))
  }
  // Descendientes (sucesores transitivos) para impedir ciclos de predecesora.
  const descMap = useMemo(() => {
    const succ: Record<string, string[]> = {}
    for (const t of tareas) if (t.bloqueado_por) (succ[t.bloqueado_por] ??= []).push(t.id)
    const m: Record<string, Set<string>> = {}
    for (const t of tareas) {
      const out = new Set<string>()
      const stack = [t.id]
      while (stack.length) { const x = stack.pop()!; for (const s of succ[x] ?? []) if (!out.has(s)) { out.add(s); stack.push(s) } }
      m[t.id] = out
    }
    return m
  }, [tareas])
  // Editar fecha: revalida fin>inicio y recalcula la duración.
  function editarFecha(t: Tarea, which: 'inicio' | 'fin', v: string) {
    if (!v) return
    const iso = new Date(v).toISOString()
    const s = which === 'inicio' ? new Date(v).getTime() : t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : NaN
    const e = which === 'fin' ? new Date(v).getTime() : t.fecha_fin_prog ? new Date(t.fecha_fin_prog).getTime() : NaN
    if (Number.isFinite(s) && Number.isFinite(e)) {
      if (e <= s) { setError('La fecha de fin debe ser posterior al inicio.'); return }
      const dur = Math.round(((e - s) / 3600000) * 10) / 10
      save(t.id, which === 'inicio' ? { fecha_inicio_prog: iso, duracion_estimada_horas: dur } : { fecha_fin_prog: iso, duracion_estimada_horas: dur })
    } else {
      save(t.id, which === 'inicio' ? { fecha_inicio_prog: iso } : { fecha_fin_prog: iso })
    }
  }

  async function importar(file: File) {
    try {
      const rows = await leerExcel(file)
      const validas = rows.filter((r) => String(r.Actividad || '').trim())
      if (!validas.length) { setError('El Excel no tiene filas con "Actividad".'); return }
      const maxSec = Math.max(0, ...tareas.map((t) => t.secuencia ?? 0))
      const pf = (v: unknown) => { if (!v) return null; const d = v instanceof Date ? v : new Date(String(v)); return isNaN(+d) ? null : d.toISOString() }
      const nuevas = validas.map((r, i) => ({
        parada_id: id, nombre: String(r.Actividad), secuencia: maxSec + i + 1,
        duracion_estimada_horas: Number(r.Duracion_h) || 1, status: estadoValido(r.Estado),
        porcentaje_completado: Number(r['Avance_%']) || 0,
        fecha_inicio_prog: pf(r.Inicio), fecha_fin_prog: pf(r.Fin),
        especificaciones_tecnicas: { wbs: r.WBS || '', sistema: r.Area || '', tag: r.Equipo_TAG || '', grupo: String(r.Grupo || ''), tec: Number(r.Tecnicos) || 0, disciplina: r.Disciplina || undefined },
        _pred: r.Predecesora ? Number(r.Predecesora) : null,
      }))
      const created = await createTareasBulk(nuevas.map(({ _pred, ...x }) => { void _pred; return x }))
      // resolver predecesoras por secuencia (existentes + nuevas)
      const secToId: Record<number, string> = {}
      for (const t of tareas) if (t.secuencia != null) secToId[t.secuencia] = t.id
      for (const c of created) secToId[c.secuencia] = c.id
      for (const n of nuevas) {
        if (n._pred && secToId[n._pred] && secToId[n.secuencia]) {
          await updateTarea(secToId[n.secuencia], { bloqueado_por: secToId[n._pred] })
        }
      }
      recargar()
      setMsg(`Importadas ${created.length} actividades ✓`)
      setTimeout(() => setMsg(null), 4000)
    } catch (e) { setError(String(e)) }
  }

  const lineas = useMemo(() => [...new Set(tareas.map(lineaOf).filter(Boolean))].sort(), [tareas])
  const filas = useMemo(() => {
    const r = tareas.filter((t) =>
      (!q || t.nombre.toLowerCase().includes(q.toLowerCase()) || sysOf(t).toLowerCase().includes(q.toLowerCase())) &&
      (lineaF === 'Todas' || lineaOf(t) === lineaF))
    return [...r].sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0))
  }, [tareas, q, lineaF])

  if (loading) return <p className="text-sm text-slate-400">Cargando…</p>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}<button onClick={() => setError(null)} className="ml-2 underline">cerrar</button></div>

  const inp = 'w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        {lineas.length > 0 && (
          <select value={lineaF} onChange={(e) => setLineaF(e.target.value)} title="Filtra por línea" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="Todas">Todas las líneas</option>
            {lineas.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <span className="text-xs text-slate-400">{filas.length} actividades</span>
        {msg && <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{msg}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={descargarPlantilla} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">⬇ Plantilla</button>
          <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">⬆ Importar</button>
          <button onClick={() => exportarExcel(tareas, parada?.nombre ?? 'parada')} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">⬇ Exportar</button>
          <button onClick={() => setCreando(true)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">+ Nueva</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }} />
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: '72vh' }}>
        <table className="text-sm" style={{ minWidth: 1500 }}>
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              {['#', 'Actividad', 'WBS', 'Área', 'Disciplina', 'Grupo', 'Téc', 'Hrs', 'Comienzo', 'Fin', 'Predec.', 'Responsable', 'Estado', '%'].map((h) => (
                h === 'Actividad' ? (
                  <th key={h} className="relative whitespace-nowrap px-2 py-2 text-left font-semibold" style={{ width: actW, minWidth: actW }}>Actividad
                    <div onPointerDown={onActResize} title="Arrastra para ensanchar/reducir la columna y leer el nombre completo" className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-amber-400/70" style={{ touchAction: 'none' }} />
                  </th>
                ) : <th key={h} className="whitespace-nowrap px-2 py-2 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((t, i) => (
              <tr key={t.id} className={i % 2 ? 'bg-white' : 'bg-slate-50/40'}>
                <td className="px-2 py-1 text-slate-400">{t.secuencia}</td>
                <td className="px-1 py-1" style={{ width: actW, minWidth: actW, maxWidth: actW }}><input key={`n-${t.nombre}`} defaultValue={t.nombre} title={t.nombre} onBlur={(e) => e.target.value !== t.nombre && save(t.id, { nombre: e.target.value })} className={inp} /></td>
                <td className="px-1 py-1" style={{ width: 70 }}><input defaultValue={String(esp(t).wbs ?? '')} onBlur={(e) => saveEspec(t, { wbs: e.target.value })} className={inp} /></td>
                <td className="px-1 py-1" style={{ minWidth: 150 }}><input defaultValue={sysOf(t)} onBlur={(e) => saveEspec(t, { sistema: e.target.value })} className={inp} /></td>
                <td className="px-1 py-1"><select value={discOf(t)} onChange={(e) => saveEspec(t, { disciplina: e.target.value })} className="w-full rounded border border-transparent bg-transparent py-0.5 text-xs hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none">{DISCS.map((d) => <option key={d} value={d}>{d}</option>)}</select></td>
                <td className="px-1 py-1" style={{ width: 70 }}>
                  <input list="grupos-dl" defaultValue={grpOf(t)} onBlur={(e) => saveEspec(t, { grupo: e.target.value })} className={`${inp} text-center font-medium focus:!bg-white focus:!text-slate-900`} style={{ color: grpOf(t) ? '#fff' : '#0f172a', background: grpOf(t) ? colorGrupo(grpOf(t)) : undefined, borderRadius: 4 }} />
                </td>
                <td className="px-1 py-1" style={{ width: 48 }}><input key={`tec-${Number(esp(t).tec ?? 0)}`} type="number" min={0} defaultValue={Number(esp(t).tec ?? 0)} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) saveEspec(t, { tec: v }) }} className={`${inp} text-center`} /></td>
                <td className="px-1 py-1" style={{ width: 56 }}><input key={`dur-${Number(t.duracion_estimada_horas ?? 0)}`} type="number" min={0} step={0.5} defaultValue={Number(t.duracion_estimada_horas ?? 0)} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0 && v !== Number(t.duracion_estimada_horas)) save(t.id, { duracion_estimada_horas: v }) }} className={`${inp} text-center`} /></td>
                <td className="px-1 py-1" style={{ width: 190 }}><input key={`fi-${t.fecha_inicio_prog ?? ''}`} type="datetime-local" defaultValue={toInput(t.fecha_inicio_prog)} onBlur={(e) => editarFecha(t, 'inicio', e.target.value)} className={`${inp} text-xs`} /></td>
                <td className="px-1 py-1" style={{ width: 190 }}><input key={`ff-${t.fecha_fin_prog ?? ''}`} type="datetime-local" defaultValue={toInput(t.fecha_fin_prog)} onBlur={(e) => editarFecha(t, 'fin', e.target.value)} className={`${inp} text-xs`} /></td>
                <td className="px-1 py-1" style={{ width: 130 }}>
                  <select value={t.bloqueado_por ?? ''} onChange={(e) => save(t.id, { bloqueado_por: e.target.value || null })} className="w-full rounded border border-transparent bg-transparent py-0.5 text-xs hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none">
                    <option value="">—</option>
                    {tareas.filter((o) => o.id !== t.id && !descMap[t.id]?.has(o.id)).map((o) => <option key={o.id} value={o.id}>#{o.secuencia} {o.nombre.slice(0, 22)}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1" style={{ width: 200 }}>
                  <button onClick={() => setAsignando(t)} title="Asignar técnicos con su cargo" className="w-full rounded border border-transparent px-1 py-1 text-left hover:border-slate-200">
                    {(() => {
                      const a = (esp(t).asignados as { nombre: string; rol: string }[]) ?? []
                      return a.length ? (
                        <span className="flex flex-wrap gap-0.5">
                          {a.slice(0, 3).map((x, i) => <span key={i} className="rounded bg-amber-50 px-1 text-[10px] text-amber-800" title={x.rol?.replace('_', ' ')}>{x.nombre.split(' ').slice(0, 2).join(' ')}</span>)}
                          {a.length > 3 && <span className="text-[10px] text-slate-400">+{a.length - 3}</span>}
                        </span>
                      ) : <span className="text-xs text-slate-400">+ Asignar…</span>
                    })()}
                  </button>
                </td>
                <td className="px-1 py-1"><select value={t.status} onChange={(e) => save(t.id, { status: e.target.value as TaskStatus })} className="w-full rounded border border-transparent bg-transparent py-0.5 text-xs hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none">{ESTADOS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></td>
                <td className="px-1 py-1" style={{ width: 56 }}><input key={`p-${t.porcentaje_completado}`} type="number" min={0} max={100} step={5} defaultValue={t.porcentaje_completado} onBlur={(e) => { if (e.target.value === '') return; const v = Math.min(100, Math.max(0, Number(e.target.value))); if (Number.isFinite(v) && v !== t.porcentaje_completado) save(t.id, { porcentaje_completado: v }) }} className={`${inp} text-center`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-400">Sin actividades — descarga la <b>Plantilla</b>, llénala e <b>Importa</b>, o crea con <b>+ Nueva</b>.</div>}
        <datalist id="grupos-dl">{grupos.map((g) => <option key={g} value={g} />)}</datalist>
      </div>

      {creando && id && <NuevaTareaModal paradaId={id} onClose={() => setCreando(false)} onCreated={recargar} />}
      {asignando && <AsignarTecnicosModal tarea={asignando} usuarios={usuarios} area={parada?.area ?? null} onClose={() => setAsignando(null)} onSaved={(espec) => setTareas((ts) => ts.map((t) => (t.id === asignando.id ? { ...t, especificaciones_tecnicas: espec } : t)))} />}
    </div>
  )
}
