import { useMemo } from 'react'
import type { Tarea } from '../types'

const DAY = 86400000

/**
 * Curva S de avance: % acumulado PLANEADO (según línea base o programación) vs
 * REAL (porcentaje_completado), ponderado por HH (téc × horas). Proyecta el fin
 * con un índice de desempeño (SPI estilo valor ganado). Es la vista ejecutiva que
 * un jefe de parada mira para saber si va adelantado o atrasado — algo que un
 * Excel no calcula solo.
 */
export function CurvaS({ tareas }: { tareas: Tarea[] }) {
  const d = useMemo(() => {
    const peso = (t: Tarea) => Math.max(1, Number(t.especificaciones_tecnicas?.tec ?? 1)) * Math.max(1, Number(t.duracion_estimada_horas ?? 1))
    const win = (t: Tarea) => {
      const s = t.fecha_inicio_base ?? t.fecha_inicio_prog
      const e = t.fecha_fin_base ?? t.fecha_fin_prog
      return s && e ? { s: new Date(s).getTime(), e: new Date(e).getTime() } : null
    }
    const items = tareas.map((t) => ({ t, w: peso(t), f: win(t), pct: Number(t.porcentaje_completado ?? 0) })).filter((x) => x.f)
    if (!items.length) return null
    const minS = Math.min(...items.map((x) => x.f!.s))
    const maxE = Math.max(...items.map((x) => x.f!.e))
    const totalPeso = items.reduce((s, x) => s + x.w, 0)
    const plannedAt = (ms: number) =>
      items.reduce((s, x) => s + x.w * Math.min(1, Math.max(0, (ms - x.f!.s) / Math.max(1, x.f!.e - x.f!.s))), 0) / totalPeso
    const N = 60
    const pts = Array.from({ length: N + 1 }, (_, i) => { const ms = minS + ((maxE - minS) * i) / N; return { ms, p: plannedAt(ms) * 100 } })
    const now = Date.now()
    const actualPct = (items.reduce((s, x) => s + x.w * x.pct, 0) / totalPeso)
    const nowClamp = Math.min(maxE, Math.max(minS, now))
    const plannedNowPct = plannedAt(nowClamp) * 100
    const desv = actualPct - plannedNowPct
    const spi = plannedNowPct > 1 ? actualPct / plannedNowPct : 1
    const antesDeIniciar = now < minS
    // ETA anclada al tiempo transcurrido: hoy + trabajo_restante / ritmo_observado (%/h)
    const ritmo = actualPct / Math.max(1, (nowClamp - minS) / 3600000)
    const etaMs = !antesDeIniciar && ritmo > 0.0001 ? nowClamp + ((100 - actualPct) / ritmo) * 3600000 : maxE
    return { pts, minS, maxE, now, nowClamp, actualPct, plannedNowPct, desv, spi, etaMs, antesDeIniciar, totalHH: Math.round(totalPeso) }
  }, [tareas])

  if (!d) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">Sin fechas para calcular la curva S.</div>

  const W = 720, Hc = 240, padL = 38, padR = 14, padT = 14, padB = 28
  const x = (ms: number) => padL + ((ms - d.minS) / Math.max(1, d.maxE - d.minS)) * (W - padL - padR)
  const y = (p: number) => Hc - padB - (p / 100) * (Hc - padT - padB)
  const planPath = d.pts.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.ms).toFixed(1)},${y(pt.p).toFixed(1)}`).join(' ')
  const areaPath = `${planPath} L${x(d.maxE).toFixed(1)},${y(0)} L${x(d.minS).toFixed(1)},${y(0)} Z`
  const dias = Math.ceil((d.maxE - d.minS) / DAY)
  const fmt = (ms: number) => new Date(ms).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
  const fmtH = (ms: number) => new Date(ms).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const atrasado = d.desv < -0.5
  const color = d.antesDeIniciar ? '#0ea5e9' : atrasado ? '#dc2626' : '#16a34a'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Curva S · avance planeado vs real</h3>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">Real <b>{d.actualPct.toFixed(1)}%</b></span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">Plan a hoy <b>{d.plannedNowPct.toFixed(1)}%</b></span>
          {d.antesDeIniciar
            ? <span className="rounded bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">Inicia en {Math.ceil((d.minS - d.now) / DAY)} día(s)</span>
            : <span className={`rounded px-2 py-0.5 font-semibold ${atrasado ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{atrasado ? '▼ Atrasado' : '▲ En meta'} {d.desv >= 0 ? '+' : ''}{d.desv.toFixed(1)}%</span>}
          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700" title="Proyección de término según ritmo (SPI)">ETA <b>{fmt(d.etaMs)}</b>{!d.antesDeIniciar && ` · SPI ${d.spi.toFixed(2)}`}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${Hc}`} className="w-full" style={{ maxHeight: 260 }}>
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}>
            <line x1={padL} y1={y(p)} x2={W - padR} y2={y(p)} stroke="#f1f5f9" />
            <text x={padL - 5} y={y(p) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{p}%</text>
          </g>
        ))}
        {Array.from({ length: dias + 1 }, (_, i) => d.minS + i * DAY).filter((ms) => ms <= d.maxE).map((ms, i) => (
          <text key={i} x={x(ms)} y={Hc - 8} textAnchor="middle" fontSize="8" fill="#94a3b8">{fmt(ms)}</text>
        ))}
        {/* área + curva planeada */}
        <path d={areaPath} fill="#3b82f6" opacity="0.08" />
        <path d={planPath} fill="none" stroke="#3b82f6" strokeWidth="2" />
        {/* línea real: del inicio a hoy */}
        {!d.antesDeIniciar && (
          <>
            <line x1={x(d.minS)} y1={y(0)} x2={x(d.nowClamp)} y2={y(d.actualPct)} stroke={color} strokeWidth="2.5" />
            <circle cx={x(d.nowClamp)} cy={y(d.actualPct)} r="4" fill={color} />
          </>
        )}
        {/* línea HOY */}
        <line x1={x(d.nowClamp)} y1={padT} x2={x(d.nowClamp)} y2={Hc - padB} stroke="#0f172a" strokeDasharray="3 3" strokeWidth="1" opacity="0.5" />
        <text x={x(d.nowClamp)} y={padT + 2} textAnchor="middle" fontSize="8" fill="#0f172a">hoy</text>
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-4 rounded bg-blue-500" /> Planeado (línea base)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-4 rounded" style={{ background: color }} /> Real ({d.actualPct.toFixed(0)}%)</span>
        <span>Carga total: {d.totalHH.toLocaleString()} HH</span>
        <span>Fin planeado: {fmtH(d.maxE)}</span>
      </div>
    </div>
  )
}
