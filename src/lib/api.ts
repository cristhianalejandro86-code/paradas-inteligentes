import { supabase } from './supabase'
import type { Parada, Progreso, Recurso, Tarea, TaskStatus } from '../types'

const TAREA_FIELDS =
  'id, nombre, descripcion, secuencia, status, es_critica, porcentaje_completado, duracion_estimada_horas, turno_asignado, responsable_id, bloqueado_por, razon_bloqueo, fecha_inicio_prog, fecha_fin_prog, fecha_inicio_base, fecha_fin_base, especificaciones_tecnicas'

/** Lee la configuración de cuadrillas (tamaño/turno) de una parada. */
export async function getCuadrillasConfig(paradaId: string): Promise<Record<string, { cap?: number; turno?: string; dias?: number; tecnicos?: { id: string; nombre: string; rol: string }[] }>> {
  const { data, error } = await supabase.from('parada').select('cuadrillas_config').eq('id', paradaId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.cuadrillas_config as Record<string, { cap?: number; turno?: string; dias?: number; tecnicos?: { id: string; nombre: string; rol: string }[] }>) ?? {}
}

/** Guarda la configuración de cuadrillas de una parada. */
export async function setCuadrillasConfig(paradaId: string, config: Record<string, { cap?: number; turno?: string; dias?: number; tecnicos?: { id: string; nombre: string; rol: string }[] }>): Promise<void> {
  const { error } = await supabase.from('parada').update({ cuadrillas_config: config }).eq('id', paradaId)
  if (error) throw new Error(error.message)
}

/** Un "previo" de una ACTIVIDAD: trabajo de preparación a hacer antes de empezar esa
 *  tarea (separar sus pernos, verificar sus medidas, llevar su aceite…). Se guarda en
 *  especificaciones_tecnicas.previos de la tarea. */
export type Previo = { id: string; texto: string; estado: 'pendiente' | 'en_proceso' | 'hecho' }

/** Actualiza las especificaciones técnicas (p. ej. mover de cuadrilla). */
export async function updateTareaEspec(
  id: string,
  espec: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('tarea')
    .update({ especificaciones_tecnicas: espec, fecha_actualizacion: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Guarda la línea base (copia la programación actual a la base). */
export async function guardarLineaBase(paradaId: string): Promise<void> {
  const { error } = await supabase.rpc('guardar_linea_base', { p_parada: paradaId })
  if (error) throw new Error(error.message)
}

/** Restaura la programación a la línea base guardada. */
export async function restaurarLineaBase(paradaId: string): Promise<void> {
  const { error } = await supabase.rpc('restaurar_linea_base', { p_parada: paradaId })
  if (error) throw new Error(error.message)
}

/** Trae la parada más reciente (la "activa" en el MVP de una sola parada). */
export async function getPrimeraParada(): Promise<Parada | null> {
  const { data, error } = await supabase
    .from('parada')
    .select(
      'id, nombre, descripcion, equipo_afectado, fecha_inicio_planeada, fecha_fin_planeada, status, status_aprobacion, duracion_planeada_horas, tarea(' +
        TAREA_FIELDS +
        ')',
    )
    .order('fecha_inicio_planeada', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as unknown as Parada) ?? null
}

const PARADA_FIELDS =
  'id, nombre, descripcion, equipo_afectado, area, fecha_inicio_planeada, fecha_fin_planeada, status, status_aprobacion, duracion_planeada_horas'

/** Trae todas las paradas con sus tareas (para el dashboard). */
export async function getParadas(): Promise<Parada[]> {
  const { data, error } = await supabase
    .from('parada')
    .select(PARADA_FIELDS + ', tarea(id, nombre, status, es_critica, porcentaje_completado)')
    .order('fecha_inicio_planeada', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as unknown as Parada[]) ?? []
}

/** Lista de usuarios (para asignar responsables). */
export async function getUsuarios(): Promise<
  { id: string; nombre: string; rol: string; cargo?: string | null; especialidad?: string | null; area?: string | null; linea?: string | null }[]
> {
  const { data, error } = await supabase
    .from('usuario')
    .select('id, nombre, rol, cargo, especialidad, area, linea')
    .eq('es_activo', true)
    .order('nombre')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Crea una parada nueva. El creador es jefe y autor. */
export async function createParada(
  input: {
    nombre: string
    equipo_afectado?: string
    fecha_inicio_planeada: string
    fecha_fin_planeada: string
    duracion_planeada_horas?: number
  },
  creadorId: string,
): Promise<Parada> {
  const { data, error } = await supabase
    .from('parada')
    .insert({
      ...input,
      jefe_parada_id: creadorId,
      creado_por: creadorId,
      status: 'Planificada',
      status_aprobacion: 'Pendiente',
    })
    .select('id, nombre, status')
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as Parada
}

/** Crea una tarea dentro de una parada. */
export async function createTarea(
  paradaId: string,
  input: {
    nombre: string
    duracion_estimada_horas: number
    turno_asignado?: string | null
    es_critica?: boolean
    responsable_id?: string | null
    secuencia?: number | null
  },
): Promise<Tarea> {
  const { data, error } = await supabase
    .from('tarea')
    .insert({
      parada_id: paradaId,
      nombre: input.nombre,
      duracion_estimada_horas: input.duracion_estimada_horas,
      turno_asignado: input.turno_asignado || null,
      es_critica: input.es_critica ?? false,
      responsable_id: input.responsable_id || null,
      secuencia: input.secuencia ?? null,
      status: 'Por_Hacer',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as Tarea
}

/** Trae una parada por id (sin tareas; el Kanban las carga aparte). */
export async function getParadaById(id: string): Promise<Parada | null> {
  const { data, error } = await supabase
    .from('parada')
    .select(PARADA_FIELDS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as unknown as Parada) ?? null
}

/** Trae todas las tareas de una parada. */
export async function getTareasByParada(paradaId: string): Promise<Tarea[]> {
  const { data, error } = await supabase
    .from('tarea')
    .select(TAREA_FIELDS)
    .eq('parada_id', paradaId)
    .order('secuencia', { ascending: true })

  if (error) throw new Error(error.message)
  return (data as unknown as Tarea[]) ?? []
}

/** Trae el inventario de recursos (catálogo global en el MVP). */
export async function getRecursos(): Promise<Recurso[]> {
  const { data, error } = await supabase
    .from('recurso')
    .select(
      'id, nombre, tipo, codigo_activo, estado, ubicacion_real, stock_total, stock_disponible, costo_diario_alquiler, es_alquilable',
    )
    .order('nombre', { ascending: true })

  if (error) throw new Error(error.message)
  return (data as unknown as Recurso[]) ?? []
}

/** Actualiza el estado de una tarea (mover tarjeta en el Kanban). */
export async function updateTareaStatus(
  id: string,
  status: TaskStatus,
): Promise<void> {
  const { error } = await supabase
    .from('tarea')
    .update({ status, fecha_actualizacion: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/** Actualiza la programación de una tarea (mover/redimensionar en el Gantt). */
export async function updateTareaSchedule(
  id: string,
  startISO: string,
  endISO: string,
  durHoras: number,
): Promise<void> {
  const { error } = await supabase
    .from('tarea')
    .update({
      fecha_inicio_prog: startISO,
      fecha_fin_prog: endISO,
      duracion_estimada_horas: durHoras,
      fecha_actualizacion: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Actualiza campos sueltos de una tarea (edición en línea de la tabla). */
export async function updateTarea(
  id: string,
  fields: Partial<{
    nombre: string
    duracion_estimada_horas: number
    status: TaskStatus
    porcentaje_completado: number
    fecha_inicio_prog: string | null
    fecha_fin_prog: string | null
    bloqueado_por: string | null
    responsable_id: string | null
    secuencia: number
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('tarea')
    .update({ ...fields, fecha_actualizacion: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Inserción masiva de tareas (para importar desde Excel). */
export async function createTareasBulk(
  rows: Record<string, unknown>[],
): Promise<{ id: string; secuencia: number }[]> {
  const { data, error } = await supabase.from('tarea').insert(rows).select('id, secuencia')
  if (error) throw new Error(error.message)
  return (data as { id: string; secuencia: number }[]) ?? []
}

/** Historial de avances de una tarea (más reciente primero). */
export async function getProgresoByTarea(tareaId: string): Promise<Progreso[]> {
  const { data, error } = await supabase
    .from('progreso')
    .select('*')
    .eq('tarea_id', tareaId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as unknown as Progreso[]) ?? []
}

/**
 * Registra un avance: inserta una fila en `progreso` y actualiza la tarea
 * (porcentaje y estado). Devuelve la tarea con los valores nuevos.
 */
export async function registrarAvance(
  tareaId: string,
  input: { porcentaje: number; status: TaskStatus; comentario?: string },
): Promise<{ porcentaje_completado: number; status: TaskStatus }> {
  const { error: insErr } = await supabase.from('progreso').insert({
    tarea_id: tareaId,
    porcentaje_completado: input.porcentaje,
    comentario: input.comentario || null,
  })
  if (insErr) throw new Error(insErr.message)

  const { error: updErr } = await supabase
    .from('tarea')
    .update({
      porcentaje_completado: input.porcentaje,
      status: input.status,
      fecha_actualizacion: new Date().toISOString(),
    })
    .eq('id', tareaId)
  if (updErr) throw new Error(updErr.message)

  return { porcentaje_completado: input.porcentaje, status: input.status }
}
