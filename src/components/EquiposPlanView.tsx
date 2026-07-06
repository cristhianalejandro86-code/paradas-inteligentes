import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTareasByParada } from '../lib/api'
import { planEquipos } from '../lib/andamios'
import type { EquipoKey } from '../lib/andamios'
import { colorGrupo } from '../lib/palette'
import { useRefreshOnFocus } from '../lib/useRefreshOnFocus'
import type { Tarea } from '../types'

const H = 3600000
const DAY = 86400000
const ROW = 38
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const lineaOf = (t: Tarea) => String(t.especificaciones_tecnicas?.linea ?? '').trim()
const fmt = (ms: number) => new Date(ms).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export type EquiposCfg = {
  espKey: EquipoKey
  titulo: string            // «andamios», «máquinas de soldar», «grúas»
  unidad: string            // «cuerpo», «máquina», «grúa»
  unidadTitulo: string      // «Cuerpo», «Máquina», «Grúa» (etiqueta de cadena)
  icono: string
  mudanzaDefault: number    // h de traslado entre usos
  mudanzaLabel: string      // «Desarme + traslado + armado» / «Traslado y conexión»…
  registroHint: string      // dónde se registran
}

/**
 * Vista genérica de EQUIPOS COMPARTIDOS (andamios / soldadoras / grúas): con las
 * unidades registradas por actividad muestra qué usos van EN PARALELO (ventanas que
 * se pisan → unidades distintas) y cuáles EN SERIE (misma unidad trasladada). Con las
 * horas de traslado configurables calcula el MÍNIMO de unidades a conseguir.
 * Las 3 pestañas usan ESTE mismo componente: una corrección aquí aplica a todas.
 */
export function EquiposPlanView({ cfg }: { cfg: EquiposCfg }) {
  const { id } = useParams<{ id: string }>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lineaF, setLineaF] = useState('Todas')
  // Horas de DESARME + TRASLADO + ARMADO entre un uso y el siguiente (se recuerda).
  const [mudanzaH, setMudanzaH] = useState(() => { const s = localStorage.getItem(`${cfg.espKey}-mudanza-h`); const n = s ? Number(s) : NaN; return Number.isFinite(n) && n >= 0 ? n : cfg.mudanzaDefault })
  useEffect(() => { try { localStorage.setItem(`${cfg.espKey}-mudanza-h`, String(mudanzaH)) } catch { /* sin persistencia */ } }, [cfg.espKey, mudanzaH])

  const reload = () => id && getTareasByParada(id).then(setTareas).catch((e) => setError(e.message))
  useEffect(() => { if (!id) return; getTareasByParada(id).then(setTareas).catch((e) => setError(e.message)).finally(() => setLoading(false)) }, [id])
  useRefreshOnFocus(reload)

  const lineas = useMemo(() => [...new Set(tareas.map(lineaOf).filter(Boolean))].sort(), [tareas])
  const scoped = useMemo(() => (lineaF === 'Todas' ? tareas : tareas.filter((t) => lineaOf(t) === lineaF)), [tareas, lineaF])
  const plan = useMemo(() => planEquipos(scoped, cfg.espKey, mudanzaH, cfg.unidadTitulo), [scoped, cfg.espKey, mudanzaH, cfg.unidadTitulo])

  // etiqueta de cuerpo por tarea (para colorear la serie: mismo color = mismo andamio físico)
  const cuerpoDe = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const u of plan.cuerpos) for (const c of u.cadena) (m[c.t.id] ??= []).push(u.etiqueta.replace(/^\S+ /, 'A'))
    return m
  }, [plan])

  if (loading) return <p className="text-sm text-slate-400">Cargando {cfg.titulo}…</p>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>

  const totalDias = Math.max(1, Math.ceil(plan.horas / 24))
  const hourW = 6
  const timelineW = totalDias * 24 * hourW
  const x = (ms: number) => ((ms - plan.base) / H) * hourW
  const dias = Array.from({ length: totalDias }, (_, i) => ({ i, d: new Date(plan.base + i * DAY) }))
  const ahorro = plan.totalSinReusar - plan.necesarios

  return (
    <div className="grid gap-4">
      {/* KPIs + parámetro de mudanza */}
      <div className="flex flex-wrap items-center gap-3">
        {lineas.length > 0 && (
          <select value={lineaF} onChange={(e) => setLineaF(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="Todas">Todas las líneas</option>
            {lineas.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm text-orange-800" title={`Horas entre un uso y el siguiente de la misma unidad (${cfg.mudanzaLabel.toLowerCase()}). Afecta cuántos usos en serie caben.`}>
          ⏱ {cfg.mudanzaLabel}:
          <input type="number" min={0} step={1} value={mudanzaH} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) setMudanzaH(v) }} className="w-16 rounded border border-orange-300 bg-white px-1 py-0.5 text-center" /> h
        </label>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`Actividades con ${cfg.unidad}`} value={String(plan.acts.length)} sub={plan.sinFecha.length ? `+ ${plan.sinFecha.length} sin programar` : 'todas programadas'} />
        <Kpi label="Sin reutilizar (suma)" value={`${plan.totalSinReusar}`} sub={`${cfg.unidad}s si cada actividad tuviera el suyo`} />
        <Kpi label="Pico en paralelo" value={`${plan.pico}`} sub={`${cfg.unidad}s ocupados a la vez (mínimo físico)`} accent="text-amber-600" />
        <Kpi label={`NECESITAS (con mudanza ${mudanzaH}h)`} value={`${plan.necesarios}`} sub={ahorro > 0 ? `reutilizando ahorras ${ahorro} ${cfg.unidad}(s)` : 'sin reutilización posible'} accent="text-orange-600" />
      </section>

      {plan.acts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Aún no hay actividades con {cfg.titulo} programadas.<br />
          Regístralos en <b>{cfg.registroHint}</b> y esta vista arma el plan sola.
        </div>
      ) : (
        <>
          {/* CRONOGRAMA: paralelo = barras que se pisan; serie = mismo color (mismo cuerpo) */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">Cronograma de {cfg.titulo} <span className="ml-2 text-xs font-normal text-slate-400">barras que se PISAN = unidades en paralelo · mismo color = la MISMA unidad reutilizada (serie)</span></h3>
            </div>
            <div className="overflow-auto" style={{ maxHeight: '48vh' }}>
              <div className="relative" style={{ width: 300 + timelineW, minWidth: '100%' }}>
                <div className="sticky top-0 z-20 flex bg-white" style={{ height: 26 }}>
                  <div className="sticky left-0 z-30 shrink-0 border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase text-slate-400" style={{ width: 300 }}>Actividad</div>
                  <div className="relative shrink-0 border-b border-slate-200" style={{ width: timelineW }}>
                    {dias.map(({ i, d }) => (
                      <div key={i} className="absolute top-0 border-l border-slate-200 px-1 text-[10px] font-semibold text-slate-600" style={{ left: i * 24 * hourW, width: 24 * hourW }}>{DIAS[d.getDay()]} {d.getDate()} {MES[d.getMonth()]}</div>
                    ))}
                  </div>
                </div>
                {plan.acts.map((a, idx) => {
                  const cuerpos = cuerpoDe[a.t.id] ?? []
                  const color = colorGrupo(cuerpos[0] ?? 'A0')
                  return (
                    <div key={a.t.id} className={`flex border-b border-slate-50 ${idx % 2 ? 'bg-white' : 'bg-slate-50/60'}`} style={{ height: ROW }}>
                      <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1 overflow-hidden border-r border-slate-200 bg-inherit px-2 text-[11px] text-slate-600" style={{ width: 300 }}>
                        <span className="text-slate-400">#{a.t.secuencia}</span>
                        <span className="truncate font-medium" title={`${a.t.nombre}${a.det ? `\n${a.det}` : ''}`}>{a.t.nombre}</span>
                      </div>
                      <div className="relative shrink-0" style={{ width: timelineW }}>
                        {dias.map(({ i }) => <div key={i} className="absolute top-0 h-full border-l border-slate-100" style={{ left: i * 24 * hourW }} />)}
                        <div className="absolute top-[5px] h-[15px] rounded shadow-sm"
                          style={{ left: x(a.s), width: Math.max(x(a.e) - x(a.s), 8), background: color }}
                          title={`${a.t.nombre}\n${fmt(a.s)} → ${fmt(a.e)} · ${a.c} ${cfg.unidad}(s) · usa: ${cuerpos.join(', ')}${a.det ? `\n${a.det}` : ''}`} />
                        {/* cantidad SIEMPRE visible debajo de la barra (no se corta en barras chicas) */}
                        <span className="pointer-events-none absolute top-[21px] whitespace-nowrap text-[10px] font-bold leading-none text-slate-700"
                          style={{ left: x(a.s) + 1 }}>
                          {cfg.icono} {a.c} {cfg.unidad}{a.c === 1 ? '' : 's'} <span className="font-medium text-slate-400">· usa {cuerpos.join(', ')}</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
                {/* histograma de cuerpos ocupados */}
                <div className="flex border-t-2 border-slate-300 bg-slate-50/60" style={{ height: 56 }}>
                  <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-slate-200 bg-slate-50 px-2 text-[10px] font-semibold uppercase text-slate-500" style={{ width: 300 }}>
                    {cfg.unidadTitulo}s ocupadas/os por hora
                    <span className="normal-case text-amber-600">pico {plan.pico}</span>
                  </div>
                  <div className="relative shrink-0" style={{ width: timelineW }}>
                    {plan.histo.map((c, h) => c > 0 ? (
                      <div key={h} className="absolute bottom-2" style={{ left: h * hourW, width: Math.max(hourW - 1, 2) }} title={`${c} ${cfg.unidad}(s)`}>
                        <div className="mx-auto w-[80%] rounded-t" style={{ height: Math.max((c / Math.max(plan.pico, 1)) * 38, 2), background: c >= plan.pico ? '#ea580c' : '#fb923c' }} />
                      </div>
                    ) : null)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PLAN DE REUTILIZACIÓN: la serie de cada cuerpo físico */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-700">🔁 Plan de reutilización — {plan.necesarios} {cfg.unidad}(s) física(s)</h3>
            <p className="mb-3 text-[11px] text-slate-400">Cada fila es UNA unidad real: cubre la primera actividad y, al terminar, se traslada a la siguiente (≥ {mudanzaH} h entre usos).</p>
            <div className="grid gap-2">
              {plan.cuerpos.map((u) => (
                <div key={u.etiqueta} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2 text-xs">
                  <span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: colorGrupo(u.etiqueta.replace('Cuerpo ', 'A')) }}>{u.etiqueta}</span>
                  {u.cadena.map((c, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-orange-500" title={`${cfg.mudanzaLabel} (${mudanzaH} h)`}>→ 🚚 →</span>}
                      <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200" title={`${c.t.nombre}\n${fmt(c.s)} → ${fmt(c.e)}`}>
                        <b>#{c.t.secuencia}</b> {c.t.nombre.slice(0, 34)}{c.t.nombre.length > 34 ? '…' : ''} <span className="text-slate-400">({fmt(c.s)}–{fmt(c.e)})</span>
                      </span>
                    </span>
                  ))}
                  {u.cadena.length === 1 && <span className="text-[10px] text-slate-400">(un solo uso — sin reutilización)</span>}
                </div>
              ))}
            </div>
          </div>

          {plan.sinFecha.length > 0 && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-700">
              <b>📋 {plan.sinFecha.length} actividad(es) con {cfg.unidad} SIN programar</b> — no entran al cálculo hasta tener Comienzo/Fin:
              <ul className="mt-1 list-inside list-disc text-xs">
                {plan.sinFecha.map((a) => <li key={a.t.id}>#{a.t.secuencia} {a.t.nombre} · {a.c} {cfg.unidad}(s)</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  )
}
