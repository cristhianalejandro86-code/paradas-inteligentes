// Tipos del dominio (subset core v1). Se reemplazarán por tipos
// autogenerados de Supabase en un incremento posterior.

export type TaskStatus =
  | 'Por_Hacer'
  | 'En_Progreso'
  | 'En_Revision'
  | 'Completada'
  | 'Bloqueada'
  | 'Cancelada'

export type ParadaStatus =
  | 'Planificada'
  | 'Aprobada'
  | 'Activa'
  | 'Suspendida'
  | 'Cerrada'
  | 'Cancelada'

export type ShiftType = 'Mañana' | 'Noche' | 'Completo'

export interface Tarea {
  id: string
  nombre: string
  descripcion?: string | null
  secuencia?: number | null
  status: TaskStatus
  es_critica: boolean
  porcentaje_completado: number
  duracion_estimada_horas?: number | null
  turno_asignado?: ShiftType | null
  responsable_id?: string | null
  bloqueado_por?: string | null
  razon_bloqueo?: string | null
}

export interface Parada {
  id: string
  nombre: string
  descripcion: string | null
  equipo_afectado: string | null
  fecha_inicio_planeada: string
  fecha_fin_planeada: string
  status: ParadaStatus
  status_aprobacion: string
  duracion_planeada_horas: number | null
  tarea: Tarea[]
}
