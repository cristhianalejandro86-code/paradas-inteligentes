import type { Tarea } from '../types'

const H = 3600000

/** Claves de EQUIPOS COMPARTIDOS por actividad (mismo motor: andamios, soldadoras, grúa). */
export type EquipoKey = 'andamios' | 'soldadoras' | 'grua'

/** Equipos de una actividad: nº de unidades + detallado. Saneado (no rompe con datos malos). */
export const equipoDe = (t: Tarea, key: EquipoKey): { c: number; det: string } => {
  const raw = (t.especificaciones_tecnicas ?? {})[key] as { c?: unknown; det?: unknown } | undefined
  const c = Number(raw?.c)
  return { c: Number.isFinite(c) && c > 0 ? Math.round(c) : 0, det: String(raw?.det ?? '') }
}
export const andamiosDe = (t: Tarea) => equipoDe(t, 'andamios')

export type ActAndamio = { t: Tarea; c: number; det: string; s: number; e: number }
export type CuerpoPlan = { etiqueta: string; cadena: { t: Tarea; s: number; e: number }[] }

/**
 * PLAN DE ANDAMIOS con reutilización. Modelo: cada CUERPO es un recurso unario; una
 * actividad ocupa sus `c` cuerpos durante su ventana (inicio→fin). Un cuerpo liberado
 * puede reutilizarse en otra actividad solo si entre el fin de una y el inicio de la
 * otra hay al menos `mudanzaH` horas (desarmar + trasladar + rearmar).
 *
 * Greedy por orden de inicio (interval partitioning con retardo): da el nº de cuerpos
 * necesario y la CADENA de actividades de cada cuerpo físico (la "serie"). Actividades
 * solapadas caen en cuerpos distintos (el "paralelo").
 */
export function planEquipos(tareas: Tarea[], key: EquipoKey, mudanzaH: number, etiquetaUnidad = 'Cuerpo'): {
  acts: ActAndamio[]
  sinFecha: { t: Tarea; c: number; det: string }[]
  cuerpos: CuerpoPlan[]
  necesarios: number
  totalSinReusar: number
  pico: number
  histo: number[]
  base: number
  horas: number
} {
  const conAndamio = tareas.map((t) => ({ t, ...equipoDe(t, key) })).filter((a) => a.c > 0)
  const sinFecha = conAndamio.filter((a) => !a.t.fecha_inicio_prog || !a.t.fecha_fin_prog)
  const acts: ActAndamio[] = conAndamio
    .filter((a) => a.t.fecha_inicio_prog && a.t.fecha_fin_prog)
    .map((a) => ({ ...a, s: new Date(a.t.fecha_inicio_prog!).getTime(), e: new Date(a.t.fecha_fin_prog!).getTime() }))
    .filter((a) => a.e > a.s)
    .sort((a, b) => a.s - b.s || a.e - b.e)

  const totalSinReusar = conAndamio.reduce((s, a) => s + a.c, 0)

  // Asignación greedy de cuerpos (reutilización con mudanza).
  const cuerpos: (CuerpoPlan & { libreEn: number })[] = []
  for (const a of acts) {
    let faltan = a.c
    // primero reutiliza cuerpos ya libres (el que quedó libre HACE MÁS tiempo primero,
    // para dejar margen a los recién liberados)
    const libres = cuerpos.filter((u) => u.libreEn <= a.s).sort((x, y) => x.libreEn - y.libreEn)
    for (const u of libres) {
      if (!faltan) break
      u.cadena.push({ t: a.t, s: a.s, e: a.e })
      u.libreEn = a.e + mudanzaH * H
      faltan--
    }
    while (faltan-- > 0) {
      cuerpos.push({ etiqueta: `${etiquetaUnidad} ${cuerpos.length + 1}`, cadena: [{ t: a.t, s: a.s, e: a.e }], libreEn: a.e + mudanzaH * H })
    }
  }

  // Histograma de cuerpos ocupados por hora (uso en paralelo, sin contar la mudanza)
  let base = 0, horas = 0, pico = 0
  let histo: number[] = []
  if (acts.length) {
    const minS = Math.min(...acts.map((a) => a.s))
    base = new Date(minS).setHours(0, 0, 0, 0)
    const maxE = Math.max(...acts.map((a) => a.e))
    horas = Math.max(1, Math.ceil((maxE - base) / H))
    histo = new Array(horas).fill(0)
    for (const a of acts)
      for (let h = Math.max(0, Math.floor((a.s - base) / H)); h < Math.min(horas, Math.ceil((a.e - base) / H)); h++) histo[h] += a.c
    pico = Math.max(0, ...histo)
  }

  return { acts, sinFecha, cuerpos, necesarios: cuerpos.length, totalSinReusar, pico, histo, base, horas }
}

export const planAndamios = (tareas: Tarea[], mudanzaH: number) => planEquipos(tareas, 'andamios', mudanzaH)
