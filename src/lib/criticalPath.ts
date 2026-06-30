import type { Tarea } from '../types'

/**
 * Ruta crítica (CPM) a partir de duraciones + dependencias (bloqueado_por).
 * Devuelve el conjunto de ids de tareas con holgura total ≈ 0 (críticas)
 * y la holgura por tarea (en horas).
 */
export function rutaCritica(tareas: Tarea[]): {
  criticas: Set<string>
  holgura: Record<string, number>
} {
  const byId = new Map(tareas.map((t) => [t.id, t]))
  const dur = (t: Tarea) => Number(t.duracion_estimada_horas ?? 0)
  const pred = (t: Tarea) => (t.bloqueado_por && t.bloqueado_por !== t.id && byId.has(t.bloqueado_por) ? t.bloqueado_por : null)
  // Nivel de esfuerzo / hamaca: la disponibilidad del puente grúa abarca toda la parada
  // y NO es una actividad de la ruta crítica (no la define ni la consume). Se excluye
  // del cálculo. También respeta una marca manual especificaciones.loe.
  const esLOE = (t: Tarea) => {
    if (t.especificaciones_tecnicas?.loe) return true
    const sis = String(t.especificaciones_tecnicas?.sistema ?? '').toUpperCase()
    return sis.includes('GRUA') && sis.includes('PUENT')
  }
  const succ: Record<string, string[]> = {}
  for (const t of tareas) {
    const p = pred(t)
    if (p) (succ[p] ??= []).push(t.id)
  }

  // Forward: earliest start/finish
  const ES: Record<string, number> = {}
  const EF: Record<string, number> = {}
  function fwd(id: string, stack = new Set<string>()): number {
    if (EF[id] != null) return EF[id]
    const t = byId.get(id)!
    const p = pred(t)
    let es = 0
    if (p && !stack.has(id)) {
      stack.add(id)
      es = fwd(p, stack)
      stack.delete(id)
    }
    ES[id] = es
    EF[id] = es + dur(t)
    return EF[id]
  }
  for (const t of tareas) fwd(t.id)
  // El fin de la parada lo definen las actividades reales, no las hamacas (grúa).
  const fin = Math.max(0, ...tareas.filter((t) => !esLOE(t)).map((t) => EF[t.id]))

  // Backward: latest start/finish
  const LF: Record<string, number> = {}
  const LS: Record<string, number> = {}
  function bwd(id: string, stack = new Set<string>()): number {
    if (LS[id] != null) return LS[id]
    const t = byId.get(id)!
    const ss = succ[id] ?? []
    let lf = fin
    if (ss.length && !stack.has(id)) {
      stack.add(id)
      lf = Math.min(...ss.map((s) => bwd(s, stack)))
      stack.delete(id)
    }
    LF[id] = lf
    LS[id] = lf - dur(t)
    return LS[id]
  }
  for (const t of tareas) bwd(t.id)

  const criticas = new Set<string>()
  const holgura: Record<string, number> = {}
  for (const t of tareas) {
    const h = Math.round((LS[t.id] - ES[t.id]) * 10) / 10
    holgura[t.id] = h
    if (h <= 0.01 && !esLOE(t)) criticas.add(t.id)   // las hamacas (grúa) nunca son críticas
  }
  return { criticas, holgura }
}
