import { useEffect, useMemo, useState } from 'react'
import { requiereGrua } from '../lib/resourceLeveling'
import type { Tarea } from '../types'

const H = 3600000, DAY = 86400000

/**
 * Operador del puente grúa según la hora de la maniobra. Turno LIMPIO de 12h, uno
 * por turno: Día 07:00–19:00, Noche 19:00–07:00. (Distinto del turno de planta
 * 07–22/19–10; el operador de grúa cubre 24h en dos relevos de 12h.)
 */
const opGruaDe = (ms: number): 'D' | 'N' => { const h = new Date(ms).getUTCHours(); return h >= 7 && h < 19 ? 'D' : 'N' }
/** ¿La maniobra cruza un relevo de operador (19:00 o 07:00) o dura más de un turno? */
const cruzaRelevo = (s: number, e: number) => opGruaDe(s) !== opGruaDe(e - 1) || e - s > 12 * H

/**
 * Panel del PUENTE GRÚA: un solo equipo con 2 operadores que rotan cada 12h. Reparte
 * las maniobras (izaje/montaje/traslado) en el carril del operador que está de turno,
 * avisa los relevos (handoff entre operadores) y los choques (solo hay 1 grúa, no
 * pueden ir 2 maniobras a la vez). Así se ve quién opera cada maniobra y dónde hay
 * que coordinar el cambio de operador.
 */
export function PuenteGruaPanel({ tareas, opDia, opNoche, onRename }: {
  tareas: Tarea[]
  opDia: string
  opNoche: string
  onRename: (turno: 'D' | 'N', nombre: string) => void
}) {
  const [editD, setEditD] = useState(opDia)
  const [editN, setEditN] = useState(opNoche)
  // La config carga async después de montar; sincroniza los inputs cuando llegan los nombres.
  useEffect(() => setEditD(opDia), [opDia])
  useEffect(() => setEditN(opNoche), [opNoche])

  const d = useMemo(() => {
    const items = tareas.map((t) => {
      if (!requiereGrua(t) || !t.fecha_inicio_prog || !t.fecha_fin_prog) return null
      const s = new Date(t.fecha_inicio_prog).getTime(), e = new Date(t.fecha_fin_prog).getTime()
      return { t, s, e, turno: opGruaDe(s), cruza: cruzaRelevo(s, e) }
    }).filter(Boolean) as { t: Tarea; s: number; e: number; turno: 'D' | 'N'; cruza: boolean }[]
    if (!items.length) return null
    items.sort((a, b) => a.s - b.s)
    const minS = Math.min(...items.map((x) => x.s)), maxE = Math.max(...items.map((x) => x.e))
    // Choque: solo hay 1 grúa → 2 maniobras solapadas en el tiempo son imposibles.
    const choque = new Set<string>()
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length && items[j].s < items[i].e; j++) { choque.add(items[i].t.id); choque.add(items[j].t.id) }
    const horasGrua = items.reduce((a, x) => a + (x.e - x.s) / H, 0)
    return { items, minS, maxE, choque, relevos: items.filter((x) => x.cruza).length, horasGrua }
  }, [tareas])

  if (!d) return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
      🏗️ Puente Grúa — no hay maniobras con grúa programadas (izaje/montaje/traslado).
    </div>
  )

  const W = 760, padL = 150, padR = 14, rowH = 26, gap = 6, headH = 22
  const Hc = headH + (rowH + gap) * 2 + 24
  const x = (ms: number) => padL + ((ms - d.minS) / Math.max(1, d.maxE - d.minS)) * (W - padL - padR)
  const dias = Math.ceil((d.maxE - d.minS) / DAY)
  const fmt = (ms: number) => new Date(ms).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
  const rowY = (turno: 'D' | 'N') => headH + (turno === 'D' ? 0 : rowH + gap)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">🏗️ Puente Grúa · 1 equipo · 2 operadores en relevo de 12h</h3>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span>{d.items.length} maniobras</span>
          <span>{Math.round(d.horasGrua)} h grúa</span>
          {d.relevos > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700" title="Maniobras que cruzan el cambio de operador">⇄ {d.relevos} relevo(s)</span>}
          {d.choque.size > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700" title="Solo hay 1 grúa: estas maniobras se pisan">⛔ {d.choque.size} choque(s)</span>}
        </div>
      </div>

      {/* asignación de operadores por turno */}
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs">
          <span className="shrink-0 font-semibold text-amber-700">☀ Día 07–19</span>
          <input value={editD} onChange={(e) => setEditD(e.target.value)} onBlur={() => editD !== opDia && onRename('D', editD.trim())}
            placeholder="Nombre del operador…" className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-slate-800" />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs">
          <span className="shrink-0 font-semibold text-indigo-700">🌙 Noche 19–07</span>
          <input value={editN} onChange={(e) => setEditN(e.target.value)} onBlur={() => editN !== opNoche && onRename('N', editN.trim())}
            placeholder="Nombre del operador…" className="w-full rounded border border-indigo-300 bg-white px-2 py-1 text-slate-800" />
        </label>
      </div>

      <svg viewBox={`0 0 ${W} ${Hc}`} className="w-full" style={{ maxHeight: 160 }}>
        {/* días */}
        {Array.from({ length: dias + 1 }, (_, i) => d.minS + i * DAY).filter((ms) => ms <= d.maxE + DAY).map((ms, i) => (
          <g key={i}>
            <line x1={x(ms)} y1={headH} x2={x(ms)} y2={Hc - 18} stroke="#f1f5f9" />
            <text x={x(ms)} y={Hc - 6} textAnchor="middle" fontSize="8" fill="#94a3b8">{fmt(ms)}</text>
          </g>
        ))}
        {/* carriles */}
        {(['D', 'N'] as const).map((turno) => (
          <g key={turno}>
            <rect x={0} y={rowY(turno)} width={W} height={rowH} fill={turno === 'D' ? '#fffbeb' : '#eef2ff'} opacity="0.6" />
            <text x={6} y={rowY(turno) + rowH / 2 + 3} fontSize="9" fontWeight="600" fill={turno === 'D' ? '#b45309' : '#4338ca'}>
              {turno === 'D' ? '☀' : '🌙'} {(turno === 'D' ? opDia : opNoche) || (turno === 'D' ? 'Op. Día' : 'Op. Noche')}
            </text>
          </g>
        ))}
        {/* maniobras */}
        {d.items.map((it) => {
          const ch = d.choque.has(it.t.id)
          const bw = Math.max(x(it.e) - x(it.s), 4)
          return (
            <g key={it.t.id}>
              <rect x={x(it.s)} y={rowY(it.turno) + 3} width={bw} height={rowH - 6} rx={3}
                fill={ch ? '#dc2626' : it.turno === 'D' ? '#f59e0b' : '#6366f1'}
                stroke={ch ? '#7f1d1d' : 'none'} strokeWidth={ch ? 1.5 : 0}>
                <title>{`${it.t.nombre}\n${it.turno === 'D' ? 'Operador Día' : 'Operador Noche'}${it.cruza ? ' → RELEVO al otro operador' : ''}${ch ? '\n⛔ choque: otra maniobra usa la grúa a la vez' : ''}`}</title>
              </rect>
              {it.cruza && <text x={x(it.e)} y={rowY(it.turno) + rowH / 2 + 3} fontSize="11" fill="#b45309">⇄</text>}
            </g>
          )
        })}
      </svg>

      <p className="mt-1 text-[10px] text-slate-400">
        Cada maniobra se ubica en el carril del operador de turno (inicio). <b className="text-amber-600">⇄</b> = cruza el relevo de operador (coordinar en el cambio de turno). <b className="text-red-600">rojo</b> = dos maniobras pisan la única grúa.
      </p>
    </div>
  )
}
