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

export interface Tarea {
  id: string
  nombre: string
  status: TaskStatus
  es_critica: boolean
  porcentaje_completado: number
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
