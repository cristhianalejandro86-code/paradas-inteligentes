import type { Tarea } from '../types'
import { disciplina } from './palette'

const H = 3600000

const durH = (t: Tarea) => Math.max(1, Math.round(Number(t.duracion_estimada_horas ?? 1)))
const tecDe = (t: Tarea) => Math.max(0, Number((t.especificaciones_tecnicas?.tec as number) ?? 0))
const grpDe = (t: Tarea) => (t.especificaciones_tecnicas?.grupo as string) || '—'
const discDe = (t: Tarea) =>
  (t.especificaciones_tecnicas?.disciplina as string) ||
  disciplina(`${t.nombre} ${(t.especificaciones_tecnicas?.sistema as string) || ''}`)

/**
 * Nivelación de recursos (Serial Schedule Generation Scheme).
 * Re-programa cada tarea al primer hueco donde, durante toda su duración,
 * la suma de técnicos no supere el tope `C`, respetando la predecesora
 * (bloqueado_por). Aplana los picos de personal.
 *
 * @returns mapa id -> { s, e } en milisegundos desde epoch.
 */
export function nivelarPersonal(
  tareas: Tarea[],
  C: number,
  baseMs: number,
): Record<string, { s: number; e: number }> {
  const byId = new Map(tareas.map((t) => [t.id, t]))

  // Orden topológico: predecesoras antes; desempate por inicio programado.
  const startMs = (t: Tarea) => (t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : 0)
  const restantes = [...tareas].sort((a, b) => startMs(a) - startMs(b))
  const colocadas = new Set<string>()
  const orden: Tarea[] = []
  while (restantes.length) {
    let avance = false
    for (let i = 0; i < restantes.length; i++) {
      const t = restantes[i]
      const p = t.bloqueado_por
      if (!p || !byId.has(p) || colocadas.has(p)) {
        orden.push(t)
        colocadas.add(t.id)
        restantes.splice(i, 1)
        avance = true
        break
      }
    }
    if (!avance) {
      // ciclo: colocar el resto tal cual
      for (const t of restantes) { orden.push(t); colocadas.add(t.id) }
      break
    }
  }

  const usado: number[] = []
  const startH: Record<string, number> = {}
  const finH: Record<string, number> = {}
  const cabe = (h0: number, len: number, need: number) => {
    for (let h = h0; h < h0 + len; h++) {
      const u = usado[h] ?? 0
      if (need >= C) { if (u > 0) return false } // sobre-tope: ocupa el tramo en exclusiva
      else if (u + need > C) return false
    }
    return true
  }
  // Fin de la predecesora: su hora ya colocada, o su fecha original si fue filtrada.
  const finAbs = (pid: string) => {
    if (finH[pid] != null) return finH[pid]
    const pt = byId.get(pid)
    return pt?.fecha_fin_prog ? Math.max(0, Math.round((new Date(pt.fecha_fin_prog).getTime() - baseMs) / H)) : 0
  }

  for (const t of orden) {
    const len = durH(t)
    const need = tecDe(t)
    const p = t.bloqueado_por && t.bloqueado_por !== t.id ? t.bloqueado_por : null
    let h = p && byId.has(p) ? finAbs(p) : 0
    let guard = 0
    while (!cabe(h, len, need) && guard++ < 100000) h++
    startH[t.id] = h
    finH[t.id] = h + len
    for (let k = h; k < h + len; k++) usado[k] = (usado[k] ?? 0) + need
  }

  const res: Record<string, { s: number; e: number }> = {}
  for (const t of tareas) res[t.id] = { s: baseMs + startH[t.id] * H, e: baseMs + finH[t.id] * H }
  return res
}

/**
 * Nivela SIN extender la parada: busca el menor tope de técnicos/hora con el
 * que el makespan no supere el original (usa solo la holgura disponible).
 */
export function nivelarSinExtender(
  tareas: Tarea[],
  baseMs: number,
  makespanOrigH: number,
): { res: Record<string, { s: number; e: number }>; C: number } {
  const totalTec = tareas.reduce((s, t) => s + tecDe(t), 0)
  const maxTec = Math.max(1, ...tareas.map(tecDe))
  for (let C = maxTec; C <= Math.max(maxTec, totalTec); C++) {
    const res = nivelarPersonal(tareas, C, baseMs)
    let mk = 0
    for (const t of tareas) mk = Math.max(mk, (res[t.id].e - baseMs) / H)
    if (mk <= makespanOrigH + 0.01) return { res, C }
  }
  return { res: nivelarPersonal(tareas, totalTec, baseMs), C: totalTec }
}

/**
 * Nivela respetando la CAPACIDAD de cada cuadrilla por separado (multi-recurso).
 * Cada tarea consume técnicos de SU cuadrilla; ninguna cuadrilla supera su tope.
 * `caps`: tope por cuadrilla; las que no tengan tope usan su pico actual.
 */
export function nivelarPorCuadrilla(
  tareas: Tarea[],
  caps: Record<string, number>,
  baseMs: number,
): Record<string, { s: number; e: number }> {
  const crews = [...new Set(tareas.map(grpDe))]
  const eff: Record<string, number> = {}
  for (const c of crews) {
    if (caps[c]) { eff[c] = caps[c]; continue }
    const ev: [number, number][] = []
    for (const t of tareas)
      if (grpDe(t) === c && t.fecha_inicio_prog && t.fecha_fin_prog) {
        ev.push([new Date(t.fecha_inicio_prog).getTime(), tecDe(t)])
        ev.push([new Date(t.fecha_fin_prog).getTime(), -tecDe(t)])
      }
    ev.sort((a, b) => a[0] - b[0])
    let cur = 0, pk = 0
    for (const [, d] of ev) { cur += d; if (cur > pk) pk = cur }
    eff[c] = Math.max(1, pk)
  }

  const byId = new Map(tareas.map((t) => [t.id, t]))
  const startMs = (t: Tarea) => (t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : 0)
  const rest = [...tareas].sort((a, b) => startMs(a) - startMs(b))
  const placed = new Set<string>()
  const orden: Tarea[] = []
  while (rest.length) {
    let adv = false
    for (let i = 0; i < rest.length; i++) {
      const t = rest[i], p = t.bloqueado_por
      if (!p || !byId.has(p) || placed.has(p)) { orden.push(t); placed.add(t.id); rest.splice(i, 1); adv = true; break }
    }
    if (!adv) { for (const t of rest) { orden.push(t); placed.add(t.id) } break }
  }

  const used: Record<string, number[]> = {}
  const startH: Record<string, number> = {}, finH: Record<string, number> = {}
  const finAbs = (pid: string) => {
    if (finH[pid] != null) return finH[pid]
    const pt = byId.get(pid)
    return pt?.fecha_fin_prog ? Math.max(0, Math.round((new Date(pt.fecha_fin_prog).getTime() - baseMs) / H)) : 0
  }
  for (const t of orden) {
    const crew = grpDe(t), len = durH(t), need = tecDe(t)
    const cap = crew === '—' ? Infinity : eff[crew] // sin grupo ⇒ sin restricción de cuadrilla
    used[crew] ??= []
    const fits = (h0: number) => {
      for (let h = h0; h < h0 + len; h++) {
        const u = used[crew][h] ?? 0
        if (need >= cap) { if (u > 0) return false }
        else if (u + need > cap) return false
      }
      return true
    }
    const p = t.bloqueado_por && t.bloqueado_por !== t.id ? t.bloqueado_por : null
    let h = p && byId.has(p) ? finAbs(p) : 0
    let g = 0
    while (!fits(h) && g++ < 100000) h++
    startH[t.id] = h; finH[t.id] = h + len
    for (let k = h; k < h + len; k++) used[crew][k] = (used[crew][k] ?? 0) + need
  }
  const res: Record<string, { s: number; e: number }> = {}
  for (const t of tareas) res[t.id] = { s: baseMs + startH[t.id] * H, e: baseMs + finH[t.id] * H }
  return res
}

/**
 * Auto-balance de cuadrillas: reasigna cada tarea a la cuadrilla MÁS LIBRE
 * (sin solape en ese horario, y de menor carga) dentro de su misma disciplina.
 * Minimiza conflictos y equilibra HH. Devuelve mapa id -> cuadrilla nueva.
 */
export function balancearCuadrillas(tareas: Tarea[]): Record<string, string> {
  const dated = tareas.filter((t) => t.fecha_inicio_prog && t.fecha_fin_prog)
  const s = (t: Tarea) => new Date(t.fecha_inicio_prog!).getTime()
  const e = (t: Tarea) => new Date(t.fecha_fin_prog!).getTime()
  const crewsDisc: Record<string, string[]> = {}
  for (const t of dated) {
    const c = grpDe(t)
    if (c === '—') continue
    const d = discDe(t)
    ;(crewsDisc[d] ??= [])
    if (!crewsDisc[d].includes(c)) crewsDisc[d].push(c)
  }
  const busy: Record<string, [number, number][]> = {}
  const load: Record<string, number> = {}
  const res: Record<string, string> = {}
  for (const t of [...dated].sort((a, b) => s(a) - s(b))) {
    const opts = crewsDisc[discDe(t)] || [grpDe(t)]
    const ts = s(t), te = e(t)
    const free = opts.filter((c) => !(busy[c] || []).some(([bs, be]) => bs < te && ts < be))
    const pool = free.length ? free : opts
    let best = pool[0], bl = Infinity
    for (const c of pool) { const l = load[c] ?? 0; if (l < bl) { bl = l; best = c } }
    res[t.id] = best
    ;(busy[best] ??= []).push([ts, te])
    load[best] = (load[best] ?? 0) + tecDe(t) * durH(t)
  }
  return res
}

/** Datos para sugerir el tope recomendado de técnicos/hora. */
export function infoNivel(tareas: Tarea[]) {
  const dated = tareas.filter((t) => t.fecha_inicio_prog && t.fecha_fin_prog)
  if (!dated.length) return null
  const starts = dated.map((t) => new Date(t.fecha_inicio_prog!).getTime())
  const ends = dated.map((t) => new Date(t.fecha_fin_prog!).getTime())
  const baseMs = Math.min(...starts)
  const winH = Math.max(1, (Math.max(...ends) - baseMs) / H)
  const totalPH = dated.reduce((s, t) => s + tecDe(t) * durH(t), 0)
  const maxTec = Math.max(1, ...dated.map(tecDe))
  const recC = Math.max(maxTec, Math.ceil(totalPH / winH))
  return { dated, baseMs, recC, totalPH, winH: Math.round(winH) }
}
