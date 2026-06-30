import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { getTareasByParada, updateTareaEspec } from '../lib/api'
import { useRefreshOnFocus } from '../lib/useRefreshOnFocus'
import type { Parada, Tarea } from '../types'

const DAY = 86400000
const TIPOS = ['Herramienta', 'Equipo', 'Máquina soldar', 'Bomba', 'Material/Perno', 'Tubería', 'Andamio', 'Otro'] as const
type Estado = 'falta' | 'en_ruta' | 'listo'
type Item = { t: string; n: string; q: number; e: Estado }

const esp = (t: Tarea) => t.especificaciones_tecnicas ?? {}
const sysOf = (t: Tarea) => (esp(t).sistema as string) || 'General'
const lineaOf = (t: Tarea) => String(esp(t).linea ?? '').trim()
const grpOf = (t: Tarea) => (esp(t).grupo as string) || ''
const itemsDe = (t: Tarea): Item[] => (Array.isArray(esp(t).recursos) ? (esp(t).recursos as Item[]) : [])
const matNA = (t: Tarea) => !!esp(t).matNA
const permisoDe = (t: Tarea) => !!esp(t).permiso
const conCuadrilla = (t: Tarea) => { const g = grpOf(t); const a = esp(t).asignados as unknown[]; return (!!g && g !== '—') || (Array.isArray(a) && a.length > 0) }
const esTrabajo = (t: Tarea) => !esp(t).hito_inicio && Number(t.duracion_estimada_horas ?? 0) > 0
// materiales listo = marcado "no requiere" o todos los ítems en estado listo
const matListo = (t: Tarea) => { const it = itemsDe(t); return matNA(t) || (it.length > 0 && it.every((i) => i.e === 'listo')) }
const matEstado = (t: Tarea): 'listo' | 'falta' | 'en_ruta' | 'sin_definir' => {
  if (matNA(t)) return 'listo'
  const it = itemsDe(t); if (!it.length) return 'sin_definir'
  if (it.every((i) => i.e === 'listo')) return 'listo'
  return it.some((i) => i.e === 'falta') ? 'falta' : 'en_ruta'
}
const listaParaArrancar = (t: Tarea) => conCuadrilla(t) && matListo(t) && permisoDe(t)

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

  const reload = () => id && getTareasByParada(id).then(setTareas).catch((e) => setError(e.message))
  useEffect(() => { if (!id) return; setLoading(true); getTareasByParada(id).then(setTareas).catch((e) => setError(e.message)).finally(() => setLoading(false)) }, [id])
  useRefreshOnFocus(reload)

  const lineas = useMemo(() => [...new Set(tareas.map(lineaOf).filter(Boolean))].sort(), [tareas])

  function guardar(t: Tarea, patch: Record<string, unknown>) {
    const next = { ...esp(t), ...patch }
    setTareas((ts) => ts.map((x) => (x.id === t.id ? { ...x, especificaciones_tecnicas: next } : x)))
    updateTareaEspec(t.id, next).catch((e) => setError(String(e)))
  }

  const scope = useMemo(() => tareas.filter(esTrabajo).filter((t) => lineaF === 'Todas' || lineaOf(t) === lineaF), [tareas, lineaF])

  const d = useMemo(() => {
    const total = scope.length
    const listas = scope.filter(listaParaArrancar).length
    const sinCuad = scope.filter((t) => !conCuadrilla(t)).length
    const sinMat = scope.filter((t) => !matListo(t)).length
    const sinPerm = scope.filter((t) => !permisoDe(t)).length
    const pct = total ? Math.round((listas / total) * 100) : 0
    const ms = (parada?.fecha_inicio_planeada ? new Date(parada.fecha_inicio_planeada).getTime() : Math.min(...tareas.map((t) => (t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : Infinity)).filter(isFinite)))
    const diasParaInicio = isFinite(ms) ? Math.ceil((ms - Date.now()) / DAY) : null
    const lista = [...scope].sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0)).filter((t) => !soloPend || !listaParaArrancar(t))
    return { total, listas, sinCuad, sinMat, sinPerm, pct, diasParaInicio, lista }
  }, [scope, soloPend, parada, tareas])

  // Consolidado: suma de todos los ítems del scope por tipo+nombre
  const consolidado = useMemo(() => {
    const m: Record<string, { t: string; n: string; total: number; listos: number; faltan: number }> = {}
    for (const tk of scope) for (const it of itemsDe(tk)) {
      const k = `${it.t}|${it.n.trim().toLowerCase()}`
      const row = (m[k] ??= { t: it.t, n: it.n.trim(), total: 0, listos: 0, faltan: 0 })
      row.total += it.q || 0
      if (it.e === 'listo') row.listos += it.q || 0
      if (it.e === 'falta') row.faltan += it.q || 0
    }
    return Object.values(m).sort((a, b) => a.t.localeCompare(b.t) || a.n.localeCompare(b.n))
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
          {d.diasParaInicio != null && <p className={`mt-1 text-sm font-semibold ${d.diasParaInicio <= 0 ? 'text-red-600' : d.diasParaInicio <= 3 ? 'text-amber-600' : 'text-slate-600'}`}>{d.diasParaInicio > 0 ? `⏳ Faltan ${d.diasParaInicio} día(s) para el inicio` : '🚨 La parada ya debió iniciar'}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Block n={d.sinCuad} label="sin cuadrilla" tone="amber" />
          <Block n={d.sinMat} label="sin recursos" tone="red" />
          <Block n={d.sinPerm} label="sin permiso" tone="red" />
        </div>
      </div>

      {/* CONSOLIDADO de recursos necesarios */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">🧰 Recursos necesarios para la parada {lineaF !== 'Todas' && <span className="text-xs font-normal text-fuchsia-600">({lineaF})</span>}</h3>
        {consolidado.length === 0 ? (
          <p className="text-xs text-slate-400">Aún no se han listado recursos por tarea. Abre una tarea abajo y agrega sus herramientas, equipos, máquinas, pernos, etc.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {consolidado.map((r) => (
              <div key={`${r.t}-${r.n}`} className={`rounded-lg border px-2 py-1 text-xs ${r.faltan > 0 ? 'border-red-200 bg-red-50' : r.listos >= r.total ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} title={`${r.t}: ${r.listos}/${r.total} listos${r.faltan ? `, faltan ${r.faltan}` : ''}`}>
                <span className="font-semibold text-slate-700">{r.n}</span> <span className="text-slate-400">×{r.total}</span>
                <span className="ml-1 text-[10px] text-slate-400">({r.t})</span>
                {r.faltan > 0 ? <span className="ml-1 font-semibold text-red-600">faltan {r.faltan}</span> : r.listos >= r.total ? <span className="ml-1 text-emerald-600">✓</span> : <span className="ml-1 text-amber-600">{r.listos}/{r.total}</span>}
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
          <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" checked={soloPend} onChange={(e) => setSoloPend(e.target.checked)} className="accent-amber-500" />Solo pendientes</label>
          <span className="text-slate-400">{d.lista.length} actividades</span>
        </div>
        <div className="overflow-auto" style={{ maxHeight: '60vh' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
              <tr><th className="px-2 py-2 text-left">#</th><th className="px-2 py-2 text-left">Actividad</th><th className="px-2 py-2 text-center">Cuadrilla</th><th className="px-2 py-2 text-center">Recursos (herram./equipo/material)</th><th className="px-2 py-2 text-center">Permiso</th><th className="px-2 py-2 text-center">Estado</th></tr>
            </thead>
            <tbody>
              {d.lista.map((t) => {
                const ok = listaParaArrancar(t), me = matEstado(t), n = itemsDe(t).length
                return (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-2 py-1.5 text-slate-400">{t.secuencia}</td>
                    <td className="px-2 py-1.5"><div className="max-w-md truncate font-medium text-slate-700" title={t.nombre}>{t.nombre}</div><div className="text-[10px] text-slate-400">{sysOf(t)}{lineaOf(t) ? ` · ${lineaOf(t)}` : ''}</div></td>
                    <td className="px-2 py-1.5 text-center">{conCuadrilla(t) ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">✓ {grpOf(t) || 'asignada'}</span> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">✗ falta</span>}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => setEditRec(t)} className={`rounded px-2 py-0.5 text-[11px] font-medium ${badge(me)}`} title="Listar herramientas, equipos, materiales…">
                        {matNA(t) ? '— no requiere' : n ? `🧰 ${n} ítem(s) · ${txt(me)}` : '➕ listar recursos'}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-center"><button onClick={() => guardar(t, { permiso: !permisoDe(t) })} className={`rounded px-2 py-0.5 text-[11px] font-medium ${permisoDe(t) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{permisoDe(t) ? '✓ OK' : '✗ falta'}</button></td>
                    <td className="px-2 py-1.5 text-center">{ok ? <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white">LISTA</span> : <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500">pendiente</span>}</td>
                  </tr>
                )
              })}
              {d.lista.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-emerald-600">🎉 Todo listo para arrancar en este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editRec && <RecursosModal tarea={editRec} onClose={() => setEditRec(null)} onSave={(items, na) => { guardar(editRec, { recursos: items, matNA: na }); setEditRec(null) }} />}
    </div>
  )
}

function RecursosModal({ tarea, onClose, onSave }: { tarea: Tarea; onClose: () => void; onSave: (items: Item[], na: boolean) => void }) {
  const [items, setItems] = useState<Item[]>(itemsDe(tarea))
  const [na, setNa] = useState(matNA(tarea))
  const add = () => setItems((x) => [...x, { t: 'Herramienta', n: '', q: 1, e: 'falta' }])
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
              <thead className="text-[10px] uppercase text-slate-400"><tr><th className="px-1 py-1 text-left">Tipo</th><th className="px-1 py-1 text-left">Nombre (ej. Llave 24, Máquina soldar, Perno 1")</th><th className="px-1 py-1">Cant.</th><th className="px-1 py-1">Estado</th><th /></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-1 py-1"><select value={it.t} onChange={(e) => upd(i, { t: e.target.value })} className="w-full rounded border border-slate-300 px-1 py-1">{TIPOS.map((tp) => <option key={tp} value={tp}>{tp}</option>)}</select></td>
                    <td className="px-1 py-1"><input value={it.n} onChange={(e) => upd(i, { n: e.target.value })} placeholder="nombre…" className="w-full rounded border border-slate-300 px-2 py-1" /></td>
                    <td className="px-1 py-1"><input type="number" min={1} value={it.q} onChange={(e) => upd(i, { q: Math.max(1, Number(e.target.value) || 1) })} className="w-14 rounded border border-slate-300 px-1 py-1 text-center" /></td>
                    <td className="px-1 py-1"><select value={it.e} onChange={(e) => upd(i, { e: e.target.value as Estado })} className={`rounded border px-1 py-1 font-medium ${it.e === 'listo' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : it.e === 'en_ruta' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-red-300 bg-red-50 text-red-700'}`}><option value="falta">❌ Falta</option><option value="en_ruta">⏳ En ruta</option><option value="listo">✓ Listo</option></select></td>
                    <td className="px-1 py-1"><button onClick={() => del(i)} className="rounded px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">✕</button></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={5} className="px-2 py-3 text-center text-slate-400">Sin recursos. Agrega herramientas, equipos, máquinas, pernos, tuberías…</td></tr>}
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
