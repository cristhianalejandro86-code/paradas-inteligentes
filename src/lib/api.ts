import { supabase } from './supabase'
import type { Parada, Tarea, TaskStatus } from '../types'

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
