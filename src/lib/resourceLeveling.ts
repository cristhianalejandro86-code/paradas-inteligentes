import type { Tarea } from '../types'

const H = 3600000

const durH = (t: Tarea) => Math.max(1, Math.round(Number(t.duracion_estimada_horas ?? 1)))
const tecDe = (t: Tarea) => Math.max(0, Number((t.especificaciones_tecnicas?.tec as number) ?? 0))

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
    if (need >= C) return true // una sola tarea más grande que el tope: se acepta
    for (let h = h0; h < h0 + len; h++) if ((usado[h] ?? 0) + need > C) return false
    return true
  }

  for (const t of orden) {
    const len = durH(t)
    const need = tecDe(t)
    const p = t.bloqueado_por
    let h = p && finH[p] != null ? finH[p] : 0
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
