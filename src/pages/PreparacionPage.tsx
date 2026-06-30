import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { getTareasByParada, updateTareaEspec } from '../lib/api'
import { useRefreshOnFocus } from '../lib/useRefreshOnFocus'
import type { Parada, Tarea } from '../types'

const DAY = 86400000
const esp = (t: Tarea) => t.especificaciones_tecnicas ?? {}
const sysOf = (t: Tarea) => (esp(t).sistema as string) || 'General'
const lineaOf = (t: Tarea) => String(esp(t).linea ?? '').trim()
const grpOf = (t: Tarea) => (esp(t).grupo as string) || ''
const matDe = (t: Tarea): 'falta' | 'en_ruta' | 'listo' => ((esp(t).mat as 'falta' | 'en_ruta' | 'listo') ?? 'falta')
const permisoDe = (t: Tarea) => !!esp(t).permiso
const conCuadrilla = (t: Tarea) => { const g = grpOf(t); const a = esp(t).asignados as unknown[]; return (!!g && g !== '—') || (Array.isArray(a) && a.length > 0) }
const esTrabajo = (t: Tarea) => !esp(t).hito_inicio && Number(t.duracion_estimada_horas ?? 0) > 0
const listaParaArrancar = (t: Tarea) => conCuadrilla(t) && matDe(t) === 'listo' && permisoDe(t)

/**
 * Tablero de PREPARACIÓN (readiness) — el artefacto de la fase pre-parada: responde
 * "¿estamos listos para arrancar?". Mide por tarea si tiene CUADRILLA + MATERIALES +
 * PERMISO, saca un % listo global con cuenta regresiva al inicio y lista los
 * bloqueadores. Materiales y permiso se editan acá (se guardan en la tarea).
 */
export function PreparacionPage() {
  const { id } = useParams<{ id: string }>()
  const parada = useOutletContext<Parada | undefined>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lineaF, setLineaF] = useState('Todas')
  const [soloPend, setSoloPend] = useState(true)

  const reload = () => id && getTareasByParada(id).then(setTareas).catch((e) => setError(e.message))
  useEffect(() => { if (!id) return; setLoading(true); getTareasByParada(id).then(setTareas).catch((e) => setError(e.message)).finally(() => setLoading(false)) }, [id])
  useRefreshOnFocus(reload)

  const lineas = useMemo(() => [...new Set(tareas.map(lineaOf).filter(Boolean))].sort(), [tareas])

  function guardar(t: Tarea, patch: Record<string, unknown>) {
    const next = { ...esp(t), ...patch }
    setTareas((ts) => ts.map((x) => (x.id === t.id ? { ...x, especificaciones_tecnicas: next } : x)))
    updateTareaEspec(t.id, next).catch((e) => setError(String(e)))
  }

  const d = useMemo(() => {
    const trabajo = tareas.filter(esTrabajo).filter((t) => lineaF === 'Todas' || lineaOf(t) === lineaF)
    const total = trabajo.length
    const listas = trabajo.filter(listaParaArrancar).length
    const sinCuad = trabajo.filter((t) => !conCuadrilla(t)).length
    const sinMat = trabajo.filter((t) => matDe(t) !== 'listo').length
    const sinPerm = trabajo.filter((t) => !permisoDe(t)).length
    const pct = total ? Math.round((listas / total) * 100) : 0
    // inicio de parada: fecha planeada o el arranque más temprano
    const ms = (parada?.fecha_inicio_planeada ? new Date(parada.fecha_inicio_planeada).getTime() : Math.min(...tareas.map((t) => (t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : Infinity)).filter(isFinite)))
    const diasParaInicio = isFinite(ms) ? Math.ceil((ms - Date.now()) / DAY) : null
    const lista = [...trabajo].sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0)).filter((t) => !soloPend || !listaParaArrancar(t))
    return { total, listas, sinCuad, sinMat, sinPerm, pct, diasParaInicio, lista }
  }, [tareas, lineaF, soloPend, parada])

  if (loading) return <p className="text-sm text-slate-400">Cargando preparación…</p>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>

  const color = d.pct >= 90 ? 'text-emerald-600' : d.pct >= 60 ? 'text-amber-600' : 'text-red-600'
  const ring = d.pct >= 90 ? '#16a34a' : d.pct >= 60 ? '#d97706' : '#dc2626'

  return (
    <div className="grid gap-4">
      {/* GAUGE + cuenta regresiva */}
      <div className="flex flex-wrap items-center gap-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="relative grid h-28 w-28 shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#f1f5f9" strokeWidth="10" />
            <circle cx="50" cy="50" r="44" fill="none" stroke={ring} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${(d.pct / 100) * 276.5} 276.5`} />
          </svg>
          <div className="absolute text-center">
            <div className={`text-2xl font-bold ${color}`}>{d.pct}%</div>
            <div className="text-[10px] text-slate-400">listo</div>
          </div>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-900">Preparación de la parada</h2>
          <p className="text-sm text-slate-500"><b className="text-slate-700">{d.listas}</b> de {d.total} actividades listas para arrancar (cuadrilla + materiales + permiso).</p>
          {d.diasParaInicio != null && (
            <p className={`mt-1 text-sm font-semibold ${d.diasParaInicio <= 0 ? 'text-red-600' : d.diasParaInicio <= 3 ? 'text-amber-600' : 'text-slate-600'}`}>
              {d.diasParaInicio > 0 ? `⏳ Faltan ${d.diasParaInicio} día(s) para el inicio` : '🚨 La parada ya debió iniciar'}
            </p>
          )}
        </div>
        {/* bloqueadores */}
        <div className="flex flex-wrap gap-2">
          <Block n={d.sinCuad} label="sin cuadrilla" tone="amber" />
          <Block n={d.sinMat} label="sin materiales" tone="red" />
          <Block n={d.sinPerm} label="sin permiso" tone="red" />
        </div>
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
        <div className="overflow-auto" style={{ maxHeight: '64vh' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Actividad</th>
                <th className="px-2 py-2 text-center">Cuadrilla</th>
                <th className="px-2 py-2 text-center">Materiales / repuestos</th>
                <th className="px-2 py-2 text-center">Permiso / IPERC</th>
                <th className="px-2 py-2 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {d.lista.map((t) => {
                const ok = listaParaArrancar(t)
                return (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-2 py-1.5 text-slate-400">{t.secuencia}</td>
                    <td className="px-2 py-1.5"><div className="max-w-md truncate font-medium text-slate-700" title={t.nombre}>{t.nombre}</div><div className="text-[10px] text-slate-400">{sysOf(t)}{lineaOf(t) ? ` · ${lineaOf(t)}` : ''}</div></td>
                    <td className="px-2 py-1.5 text-center">{conCuadrilla(t) ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">✓ {grpOf(t) || 'asignada'}</span> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">✗ falta</span>}</td>
                    <td className="px-2 py-1.5 text-center">
                      <select value={matDe(t)} onChange={(e) => guardar(t, { mat: e.target.value })} className={`rounded border px-1 py-0.5 text-[11px] font-medium ${matDe(t) === 'listo' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : matDe(t) === 'en_ruta' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
                        <option value="falta">❌ Falta</option>
                        <option value="en_ruta">⏳ En ruta</option>
                        <option value="listo">✓ Listo</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => guardar(t, { permiso: !permisoDe(t) })} className={`rounded px-2 py-0.5 text-[11px] font-medium ${permisoDe(t) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{permisoDe(t) ? '✓ OK' : '✗ falta'}</button>
                    </td>
                    <td className="px-2 py-1.5 text-center">{ok ? <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white">LISTA</span> : <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500">pendiente</span>}</td>
                  </tr>
                )
              })}
              {d.lista.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-emerald-600">🎉 Todo listo para arrancar en este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Block({ n, label, tone }: { n: number; label: string; tone: 'amber' | 'red' }) {
  const c = n === 0 ? 'bg-slate-50 text-slate-400' : tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
  return (
    <div className={`rounded-lg px-3 py-2 text-center ${c}`}>
      <div className="text-xl font-bold">{n}</div>
      <div className="text-[10px] font-medium">{label}</div>
    </div>
  )
}
