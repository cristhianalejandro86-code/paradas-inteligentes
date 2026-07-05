import type { Tarea } from '../types'
import { disciplina } from './palette'

const H = 3600000

const durH = (t: Tarea) => Math.max(1, Math.round(Number(t.duracion_estimada_horas ?? 1)))
const tecDe = (t: Tarea) => Math.max(0, Number((t.especificaciones_tecnicas?.tec as number) ?? 0))
const grpDe = (t: Tarea) => (t.especificaciones_tecnicas?.grupo as string) || '—'
/** Turno de la tarea: 'N' (noche) o 'D' (día), desde la especificación o el turno asignado. */
const turnoDe = (t: Tarea): 'D' | 'N' => {
  const dn = (t.especificaciones_tecnicas?.turno_dn as string) || ''
  if (dn) return dn.toUpperCase().startsWith('N') ? 'N' : 'D'
  return (t.turno_asignado || '').toLowerCase().startsWith('n') ? 'N' : 'D'
}
// Ventanas de turno de la parada de planta: Día 07:00–22:00, Noche 19:00–10:00 (se solapan; se permite extensión).
const VENTANA = { D: [7, 22], N_ini: 19, N_fin: 10 }
const enVentanaTurno = (dn: 'D' | 'N', horaDelDia: number) =>
  dn === 'N' ? horaDelDia >= VENTANA.N_ini || horaDelDia < VENTANA.N_fin : horaDelDia >= VENTANA.D[0] && horaDelDia < VENTANA.D[1]

/** Infiere la especialidad que exige una tarea a partir de su nombre. */
export const especialidadRequerida = (t: Tarea): string | null => {
  const s = `${t.nombre} ${(t.especificaciones_tecnicas?.sistema as string) || ''}`.toUpperCase()
  if (/SOLDA|RELLENO DE COSTURA|APORTE/.test(s)) return 'Soldador'
  if (/ANDAMI/.test(s)) return 'Andamiero'
  if (/IZAJE|RIGG|MANIOBRA|TRASLAD|MONTAJE|DESMONTAJE/.test(s)) return 'Rigger'
  if (/PINTU|PINTAD|GRANALLA|ARENAD|RECUBRIMIENTO/.test(s)) return 'Pintor'
  if (/EL[EÉ]CTRIC|MOTOR|VARIADOR|TABLERO|CABLE/.test(s)) return 'Electricista'
  if (/ALINEA/.test(s)) return 'Alineador'
  return null  // sin especialidad específica → cualquier mecánico sirve
}
/**
 * Tramos de TRABAJO REAL de una tarea dentro de su ventana (inicio→fin). Cuando el
 * span (fin−inicio) excede el trabajo (duración) por ≥2h, se asume que hay ESPERA en
 * el medio (otra área limpia, llega un repuesto): la tarea trabaja al inicio y al
 * final, no de corrido. Ej.: "APERTURA Y CIERRE DE TAPA MANHOLE" 3h de trabajo en un
 * span de 93h → 2h al abrir + espera + 1h al cerrar. Se usa para que la barra y el
 * histograma NO cuenten recursos durante la espera.
 */
export function tramosTrabajo(t: Tarea): { s: number; e: number }[] {
  if (!t.fecha_inicio_prog || !t.fecha_fin_prog) return []
  const s = new Date(t.fecha_inicio_prog).getTime(), e = new Date(t.fecha_fin_prog).getTime()
  const work = Math.max(0, Number(t.duracion_estimada_horas ?? 0))
  const span = (e - s) / H
  if (work <= 0 || span - work < 2) return [{ s, e }]   // sin espera significativa
  const ini = Math.ceil(work / 2), fin = work - ini
  const tramos = [{ s, e: s + ini * H }]
  if (fin > 0) tramos.push({ s: e - fin * H, e })
  return tramos
}
/** ¿La tarea tiene espera (trabaja al inicio y al final, no de corrido)? */
export const tieneEspera = (t: Tarea): boolean => tramosTrabajo(t).length > 1

/** ¿La tarea necesita grúa / puente grúa? (recurso compartido por toda la planta). */
export const requiereGrua = (t: Tarea): boolean =>
  /IZAJE|IZAR|GR[UÚ]A|RIGG|MANIOBRA|TRASLAD|MONTAJE|DESMONTAJE|RETIR|INSTALAC|COLOC/.test(`${t.nombre}`.toUpperCase())
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
 * Resuelve choques de cuadrilla: re-secuencia para que NINGUNA cuadrilla haga
 * trabajos imposibles en paralelo. Modelo RCPSP por recurso renovable:
 *  - si la cuadrilla tiene capacidad (personas) definida → permite concurrencia
 *    mientras la suma de técnicos no supere ese tope;
 *  - si no → recurso UNARIO: la cuadrilla hace UNA tarea a la vez (1 frente).
 * Respeta predecesoras. Garantiza 0 solapamientos infeasibles por cuadrilla.
 */
export function resolverCuadrillas(
  tareas: Tarea[],
  caps: Record<string, number>,
  baseMs: number,
): Record<string, { s: number; e: number }> {
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
    const crew = grpDe(t), len = durH(t)
    if (crew === '—') {
      // Sin cuadrilla ⇒ sin restricción de recurso, solo respeta la predecesora.
      const p0 = t.bloqueado_por && t.bloqueado_por !== t.id ? t.bloqueado_por : null
      const h0 = p0 && byId.has(p0) ? finAbs(p0) : 0
      startH[t.id] = h0; finH[t.id] = h0 + len
      continue
    }
    const hasCap = (caps[crew] ?? 0) > 0
    const need = hasCap ? Math.max(1, tecDe(t)) : 1 // unario: 1 frente por cuadrilla
    const cap = hasCap ? caps[crew] : 1
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
    while (!fits(h) && g++ < 1000000) h++
    startH[t.id] = h; finH[t.id] = h + len
    for (let k = h; k < h + len; k++) used[crew][k] = (used[crew][k] ?? 0) + need
  }
  const res: Record<string, { s: number; e: number }> = {}
  for (const t of tareas) res[t.id] = { s: baseMs + startH[t.id] * H, e: baseMs + finH[t.id] * H }
  return res
}

export type Tecnico = { id: string; nombre: string; rol: string; cargo?: string | null; especialidad?: string | null; area?: string | null; linea?: string | null }
export type Roster = Record<string, Tecnico[]>

/**
 * Nivelación TRABAJADOR POR TRABAJADOR. Cada técnico es un recurso UNARIO: no
 * puede estar en dos tareas a la vez. Reglas, por tarea:
 *  - Si ya tiene técnicos nominados (especificaciones.asignados) → esos deben
 *    estar libres en su ventana.
 *  - Si no, pero su cuadrilla tiene un ROSTER de técnicos → se le AUTO-ASIGNA
 *    el/los técnico(s) del roster con menos carga que estén libres (distribuye
 *    el trabajo del grupo entre su gente, sin solapes).
 *  - Si no hay roster ni nominados → la cuadrilla funciona como recurso unario
 *    (1 frente); sin cuadrilla, solo respeta la predecesora.
 * Devuelve el cronograma y las asignaciones automáticas (para persistir/mostrar).
 */
export function resolverPorPersona(
  tareas: Tarea[],
  baseMs: number,
  roster: Roster = {},
  opts: { maxJornadaH?: number; descansoH?: number; turnos?: boolean; gruas?: number } = {},
): { schedule: Record<string, { s: number; e: number }>; asignaciones: Record<string, Tecnico[]> } {
  // Regla de fatiga (parada de planta): un técnico puede correr largo (incluso
  // >12h, cruzando turnos), pero tras `maxJornadaH` horas CONTINUAS necesita
  // `descansoH` de descanso antes de encadenar otra tarea. No parte tareas
  // individuales largas; solo evita encadenar jornadas sin descanso.
  const maxJor = Math.max(1, opts.maxJornadaH ?? 48)
  const descanso = Math.max(0, opts.descansoH ?? 6)
  const usarTurnos = opts.turnos ?? true
  const nGruas = Math.max(0, opts.gruas ?? 0)   // 0 = sin límite de grúas
  const gruaUso: number[] = []                   // grúas ocupadas por hora (compartidas por toda la planta)
  // Cada tarea debe ARRANCAR dentro de su ventana de turno (Día 07–22 / Noche 19–10);
  // puede extenderse más allá (las paradas se alargan), solo se controla el inicio.
  const horaDia = (h: number) => new Date(baseMs + h * H).getUTCHours()
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
    if (!adv) { const t = rest.shift()!; orden.push(t); placed.add(t.id) }
  }

  const busy: Record<string, number[]> = {}
  const load: Record<string, number> = {}
  const blkStart: Record<string, number> = {}   // inicio del bloque continuo actual por persona
  const lastEnd: Record<string, number> = {}     // fin del último bloque por persona
  const startH: Record<string, number> = {}, finH: Record<string, number> = {}
  const asign: Record<string, Tecnico[]> = {}
  // ¿Colocar [h,h+len) deja al recurso k dentro del límite de jornada continua?
  const fatigaOK = (k: string, h: number, len: number) => {
    const le = lastEnd[k]
    if (le == null) return true                 // primera tarea del recurso: nunca se parte
    if (h - le >= descanso) return true          // descansó lo suficiente → bloque nuevo
    return (h + len) - (blkStart[k] ?? h) <= maxJor
  }
  const finAbs = (pid: string) => {
    if (finH[pid] != null) return finH[pid]
    const pt = byId.get(pid)
    return pt?.fecha_fin_prog ? Math.max(0, Math.round((new Date(pt.fecha_fin_prog).getTime() - baseMs) / H)) : 0
  }
  const libre = (key: string, h0: number, len: number) => {
    const b = busy[key]
    if (!b) return true
    for (let h = h0; h < h0 + len; h++) if (b[h]) return false
    return true
  }
  for (const t of orden) {
    const len = durH(t)
    const explicit = ((t.especificaciones_tecnicas?.asignados as Tecnico[]) ?? []).filter((a) => a?.id)
    const crew = grpDe(t)
    const pool = crew !== '—' ? roster[crew] ?? [] : []
    const p = t.bloqueado_por && t.bloqueado_por !== t.id ? t.bloqueado_por : null
    let h = p && byId.has(p) ? finAbs(p) : 0
    const dn = turnoDe(t)
    const turnoOK = (hh: number) => !usarTurnos || enVentanaTurno(dn, horaDia(hh))
    // Grúa: recurso compartido por toda la planta; máx nGruas tareas con grúa a la vez.
    const reqGrua = nGruas > 0 && requiereGrua(t)
    const gruaOK = (hh: number) => { if (!reqGrua) return true; for (let z = hh; z < hh + len; z++) if ((gruaUso[z] ?? 0) >= nGruas) return false; return true }
    let keys: string[] = []
    let g = 0

    if (explicit.length) {
      while ((!explicit.every((a) => libre('u:' + a.id, h, len) && fatigaOK('u:' + a.id, h, len)) || !turnoOK(h) || !gruaOK(h)) && g++ < 1000000) h++
      keys = explicit.map((a) => 'u:' + a.id)
    } else if (pool.length) {
      const need = Math.min(pool.length, Math.max(1, tecDe(t) || 1))
      const req = especialidadRequerida(t)   // especialidad que pide la tarea (inferida del nombre)
      const matchEsp = (a: Tecnico) => (req && (a.especialidad ?? '').toLowerCase().includes(req.toLowerCase()) ? 0 : 1)
      const libresEn = (hh: number) => pool.filter((a) => libre('u:' + a.id, hh, len) && fatigaOK('u:' + a.id, hh, len))
      while ((libresEn(h).length < need || !turnoOK(h) || !gruaOK(h)) && g++ < 1000000) h++
      const elegidos = libresEn(h)
        // prioriza la especialidad correcta (soldadura→soldador, etc.) y luego al de menor carga
        .sort((a, b) => matchEsp(a) - matchEsp(b) || (load['u:' + a.id] ?? 0) - (load['u:' + b.id] ?? 0))
        .slice(0, need)
      asign[t.id] = elegidos
      keys = elegidos.map((a) => 'u:' + a.id)
    } else if (crew !== '—') {
      while ((!libre('g:' + crew, h, len) || !turnoOK(h) || !gruaOK(h)) && g++ < 1000000) h++
      keys = ['g:' + crew]
    } else {
      while ((!turnoOK(h) || !gruaOK(h)) && g++ < 1000000) h++
    }
    // Si las restricciones blandas (turno/fatiga/grúa) son infactibles, el bucle se agota:
    // caemos al piso duro (fin de predecesora) en vez de devolver fechas basura (~año +114k).
    if (g >= 999999) h = p && byId.has(p) ? finAbs(p) : 0

    startH[t.id] = h; finH[t.id] = h + len
    if (reqGrua) for (let z = h; z < h + len; z++) gruaUso[z] = (gruaUso[z] ?? 0) + 1
    for (const k of keys) {
      busy[k] ??= []; for (let x = h; x < h + len; x++) busy[k][x] = 1
      load[k] = (load[k] ?? 0) + len
      // bloque continuo: si descansó (gap ≥ descanso) o es el primero, arranca bloque nuevo
      if (lastEnd[k] == null || h - lastEnd[k] >= descanso) blkStart[k] = h
      lastEnd[k] = h + len
    }
  }
  const schedule: Record<string, { s: number; e: number }> = {}
  for (const t of tareas) schedule[t.id] = { s: baseMs + startH[t.id] * H, e: baseMs + finH[t.id] * H }
  return { schedule, asignaciones: asign }
}

/**
 * Detecta CHOQUES DE PERSONA: el mismo técnico nominado (especificaciones.asignados)
 * en dos tareas que se solapan en el tiempo. Devuelve los ids de tareas en choque
 * y, por tarea, los nombres de los técnicos duplicados (para avisar en pantalla).
 */
export function choquesPersona(tareas: Tarea[]): { ids: Set<string>; porTarea: Record<string, string[]> } {
  const ids = new Set<string>()
  const porTarea: Record<string, string[]> = {}
  type Iv = { id: string; s: number; e: number; nombre: string }
  const byTec: Record<string, Iv[]> = {}
  for (const t of tareas) {
    if (!t.fecha_inicio_prog || !t.fecha_fin_prog) continue
    const s = new Date(t.fecha_inicio_prog).getTime(), e = new Date(t.fecha_fin_prog).getTime()
    for (const a of (t.especificaciones_tecnicas?.asignados as Tecnico[]) ?? [])
      if (a?.id) (byTec[a.id] ??= []).push({ id: t.id, s, e, nombre: a.nombre })
  }
  for (const ivs of Object.values(byTec)) {
    ivs.sort((a, b) => a.s - b.s)
    for (let i = 0; i < ivs.length; i++)
      for (let j = i + 1; j < ivs.length && ivs[j].s < ivs[i].e; j++) {
        ids.add(ivs[i].id); ids.add(ivs[j].id)
        for (const x of [ivs[i], ivs[j]]) (porTarea[x.id] ??= []).includes(x.nombre) || (porTarea[x.id] ??= []).push(x.nombre)
      }
  }
  return { ids, porTarea }
}

/** ¿El TRABAJO REAL de dos tareas se solapa? La espera de tareas tipo apertura/cierre
 *  (manhole) NO cuenta: durante la espera la cuadrilla está libre. */
export const solapanTrabajo = (a: Tarea, b: Tarea) => {
  const ta = tramosTrabajo(a), tb = tramosTrabajo(b)
  for (const x of ta) for (const y of tb) if (x.s < y.e && y.s < x.e) return true
  return false
}

/**
 * Detecta CHOQUES DE CUADRILLA: el mismo grupo (especificaciones.grupo) trabajando dos
 * tareas a la vez (su TRABAJO REAL se solapa — la espera no cuenta). Una cuadrilla no
 * puede estar en dos frentes a la vez, así que el plan no es ejecutable hasta resolverlos.
 * Única fuente de verdad para la vista Cuadrillas y el control de Ruta crítica.
 */
export function choquesCuadrilla(tareas: Tarea[]): { ids: Set<string> } {
  const ids = new Set<string>()
  const byG: Record<string, Tarea[]> = {}
  for (const t of tareas) {
    if (!t.fecha_inicio_prog || !t.fecha_fin_prog) continue
    ;(byG[grpDe(t)] ??= []).push(t)
  }
  for (const ts of Object.values(byG))
    for (let i = 0; i < ts.length; i++)
      for (let j = i + 1; j < ts.length; j++)
        if (solapanTrabajo(ts[i], ts[j])) { ids.add(ts[i].id); ids.add(ts[j].id) }
  return { ids }
}

/**
 * Sugiere PRECEDENCIAS automáticas: dentro de un mismo equipo (sistema) y cuadrilla,
 * encadena las tareas en orden de inicio (una espera a la anterior). Es el patrón
 * real de una parada (una cuadrilla trabaja un equipo en serie) y habilita la ruta
 * crítica. Solo propone para tareas SIN predecesora; nunca crea ciclos (encadena por
 * tiempo). Devuelve mapa id -> id_predecesora.
 */
export function sugerirPrecedencias(tareas: Tarea[]): Record<string, string> {
  const sug: Record<string, string> = {}
  const buckets: Record<string, Tarea[]> = {}
  for (const t of tareas) {
    if (!t.fecha_inicio_prog) continue
    const key = `${(t.especificaciones_tecnicas?.sistema as string) || '—'}|${grpDe(t)}`
    ;(buckets[key] ??= []).push(t)
  }
  for (const ts of Object.values(buckets)) {
    ts.sort((a, b) => new Date(a.fecha_inicio_prog!).getTime() - new Date(b.fecha_inicio_prog!).getTime())
    for (let i = 1; i < ts.length; i++)
      if (!ts[i].bloqueado_por) sug[ts[i].id] = ts[i - 1].id
  }
  return sug
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
    // Sin cuadrilla asignada → el balanceador NO la toca (antes escribía el
    // placeholder '—' como si fuera una cuadrilla real). Asignarla es decisión
    // de planeamiento, no del balanceo.
    if (grpDe(t) === '—') continue
    const opts = crewsDisc[discDe(t)] || [grpDe(t)]
    const ts = s(t), te = e(t)
    const free = opts.filter((c) => !(busy[c] || []).some(([bs, be]) => bs < te && ts < be))
    // Si ninguna cuadrilla está libre, NO inventes un choque: conserva la suya.
    const pool = free.length ? free : [grpDe(t)]
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
