import { supabase } from './supabase'
import type { Parada, Progreso, Recurso, Tarea, TaskStatus } from '../types'

const TAREA_FIELDS =
  'id, nombre, descripcion, secuencia, status, es_critica, porcentaje_completado, duracion_estimada_horas, turno_asignado, responsable_id, bloqueado_por, razon_bloqueo'

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
  'id, nombre, descripcion, equipo_afectado, fecha_inicio_planeada, fecha_fin_planeada, status, status_aprobacion, duracion_planeada_horas'

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
  { id: string; nombre: string; rol: string }[]
> {
  const { data, error } = await supabase
    .from('usuario')
    .select('id, nombre, rol')
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
