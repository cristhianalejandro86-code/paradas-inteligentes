import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTareasByParada, updateTareaEspec, updateTareaSchedule, getCuadrillasConfig, setCuadrillasConfig } from '../lib/api'
import { balancearCuadrillas, resolverCuadrillas } from '../lib/resourceLeveling'
import { colorGrupo } from '../lib/palette'
import type { Tarea } from '../types'

const H = 3600000
const DAY = 86400000
const SUB = 22
const LEFT = 230
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const sysOf = (t: Tarea) => (t.especificaciones_tecnicas?.sistema as string) || 'General'
const grpOf = (t: Tarea) => (t.especificaciones_tecnicas?.grupo as string) || '—'
const tecOf = (t: Tarea) => Math.max(0, Number((t.especificaciones_tecnicas?.tec as number) ?? 0))
const pad = (n: number) => String(n).padStart(2, '0')

interface Item { t: Tarea; s: number; e: number; lane: number; conflict: boolean }
interface Crew { nombre: string; items: Item[]; nSub: number; util: number; hh: number; peak: number; conflictos: number }

export function CuadrillasPage() {
  const { id } = useParams<{ id: string }>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mover, setMover] = useState<Tarea | null>(null)
  const [config, setConfig] = useState<Record<string, { cap?: number; turno?: string }>>({})
  const [snapGrupos, setSnapGrupos] = useState<Record<string, string> | null>(null)
  const [snapFechas, setSnapFechas] = useState<Record<string, { s: number; e: number }> | null>(null)
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1600)

  useEffect(() => {
    if (!id) return
    getTareasByParada(id).then(setTareas).catch((e) => setError(e.message)).finally(() => setLoading(false))
    getCuadrillasConfig(id).then(setConfig).catch(() => {})
  }, [id])

  function setCap(crew: string, cap?: number) {
    const next = { ...config, [crew]: { ...config[crew], cap } }
    setConfig(next)
    if (id) setCuadrillasConfig(id, next).catch((e) => setError(String(e)))
  }
  useEffect(() => {
    const f = () => setVw(window.innerWidth)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])

  const { crews, base, totalDias, hourW, totalConf } = useMemo(() => {
    const dated = tareas.filter((t) => t.fecha_inicio_prog && t.fecha_fin_prog)
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
    const crews: Crew[] = Object.entries(byC).map(([nombre, ts]) => {
      const its = ts.map((t) => ({ t, ...fch(t) })).sort((a, b) => a.s - b.s)
      // sub-filas (interval partitioning)
      const laneEnd: number[] = []
      const items: Item[] = its.map((it) => {
        let lane = laneEnd.findIndex((end) => end <= it.s)
        if (lane === -1) { lane = laneEnd.length }
        laneEnd[lane] = it.e
        return { ...it, lane, conflict: false }
      })
      // conflictos: solapamiento por pares
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++)
          if (items[j].s < items[i].e && items[i].s < items[j].e) { items[i].conflict = true; items[j].conflict = true }
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
    return { crews, base, totalDias, hourW, totalConf }
  }, [tareas, vw])

  const timelineW = totalDias * 24 * hourW
  const x = (ms: number) => ((ms - base) / H) * hourW

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
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">Distribución por cuadrilla · {crews.length} grupos</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className={totalConf ? 'font-semibold text-red-600' : 'text-emerald-600'}>{totalConf ? `${totalConf} tareas en conflicto de cuadrilla` : 'sin conflictos'}</span>
          <span className="text-slate-400">Click en una barra para reasignar</span>
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
            <div className="sticky left-0 z-30 shrink-0 border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase text-slate-400" style={{ width: LEFT }}>Cuadrilla</div>
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
                  </div>
                </div>
                <div className="relative shrink-0" style={{ width: timelineW, height: laneH }}>
                  {dias.map(({ i }) => (
                    <div key={i}>
                      <div className="absolute top-0 bg-slate-100/60" style={{ left: i * 24 * hourW, width: 7 * hourW, height: laneH }} />
                      <div className="absolute top-0 bg-slate-100/60" style={{ left: (i * 24 + 19) * hourW, width: 5 * hourW, height: laneH }} />
                      <div className="absolute top-0 border-l border-slate-100" style={{ left: i * 24 * hourW, height: laneH }} />
                    </div>
                  ))}
                  {c.items.map((it) => (
                    <button key={it.t.id} onClick={() => setMover(it.t)} title={`${it.t.nombre}\n${tecOf(it.t)} téc · ${it.t.duracion_estimada_horas}h${it.conflict ? '\n⚠ choque con otra tarea de la misma cuadrilla' : ''}\n(click para reasignar)`}
                      className="absolute flex items-center overflow-hidden rounded px-1 text-[9px] font-medium text-white shadow-sm" style={{
                        left: x(it.s), width: Math.max(x(it.e) - x(it.s), 5), top: 4 + it.lane * SUB, height: SUB - 4,
                        background: it.conflict ? '#b91c1c' : colorGrupo(sysOf(it.t)), boxShadow: it.conflict ? '0 0 0 1px #7f1d1d' : undefined,
                      }}>
                      <span className="truncate">{tecOf(it.t)}t · {it.t.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {crews.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-400">Ninguna tarea tiene fechas programadas (inicio y fin) todavía.</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-red-600" /> Conflicto (cuadrilla en 2 tareas a la vez)</span>
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
    </div>
  )
}

function gnum(g: string) { const m = g.match(/\d+/); return m ? Number(m[0]) : 999 }
