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
  fecha_inicio_prog?: string | null
  fecha_fin_prog?: string | null
  fecha_inicio_base?: string | null
  fecha_fin_base?: string | null
  especificaciones_tecnicas?: Record<string, unknown> | null
}

export type ResourceType =
  | 'Personal'
  | 'Herramienta'
  | 'Equipo'
  | 'Repuesto'
  | 'Material'

export type ResourceStatus =
  | 'Disponible'
  | 'En_Uso'
  | 'En_Mantenimiento'
  | 'Dañado'
  | 'Perdido'
  | 'Devuelto'
  | 'En_Almacen'

export interface Recurso {
  id: string
  nombre: string
  tipo: ResourceType
  codigo_activo: string | null
  estado: ResourceStatus
  ubicacion_real: string | null
  stock_total: number
  stock_disponible: number
  costo_diario_alquiler: number | null
  es_alquilable: boolean
}

export interface Progreso {
  id: string
  tarea_id: string
  porcentaje_completado: number
  comentario: string | null
  foto_url: string | null
  registrado_por: string | null
  created_at: string
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
  tarea?: Tarea[]
}
