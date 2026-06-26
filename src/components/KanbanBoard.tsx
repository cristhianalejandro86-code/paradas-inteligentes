import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { getTareasByParada, updateTareaStatus } from '../lib/api'
import type { Tarea, TaskStatus } from '../types'

// Columnas del Kanban (Pantalla 1 del diseño).
const COLUMNS: { id: TaskStatus; title: string; accent: string }[] = [
  { id: 'Por_Hacer', title: 'Por Hacer', accent: 'border-t-slate-400' },
  { id: 'En_Progreso', title: 'En Progreso', accent: 'border-t-blue-500' },
  { id: 'En_Revision', title: 'En Revisión', accent: 'border-t-violet-500' },
  { id: 'Completada', title: 'Completada', accent: 'border-t-emerald-500' },
]

// Una tarea "Bloqueada" se muestra en la columna Por Hacer (aún no inicia).
function columnaDe(status: TaskStatus): TaskStatus {
  if (status === 'Bloqueada') return 'Por_Hacer'
  if (status === 'Cancelada') return 'Por_Hacer'
  return status
}

export function KanbanBoard({ paradaId }: { paradaId: string }) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  useEffect(() => {
    let alive = true
    getTareasByParada(paradaId)
      .then((data) => alive && setTareas(data))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [paradaId])

  const porColumna = useMemo(() => {
    const map: Record<TaskStatus, Tarea[]> = {
      Por_Hacer: [],
      En_Progreso: [],
      En_Revision: [],
      Completada: [],
      Bloqueada: [],
      Cancelada: [],
    }
    for (const t of tareas) map[columnaDe(t.status)].push(t)
    return map
  }, [tareas])

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const taskId = String(active.id)
    const newStatus = over.id as TaskStatus
    const tarea = tareas.find((t) => t.id === taskId)
    if (!tarea || tarea.status === newStatus) return

    // Optimista: actualiza local, persiste, revierte si falla.
    const prev = tarea.status
    setTareas((ts) =>
      ts.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
    )
    setSaving(taskId)
    try {
      await updateTareaStatus(taskId, newStatus)
    } catch (e) {
      setTareas((ts) =>
        ts.map((t) => (t.id === taskId ? { ...t, status: prev } : t)),
      )
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando tareas…</p>
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Error: {error}
      </div>
    )

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            id={col.id}
            title={col.title}
            accent={col.accent}
            tareas={porColumna[col.id]}
            saving={saving}
          />
        ))}
      </div>
    </DndContext>
  )
}

function Column({
  id,
  title,
  accent,
  tareas,
  saving,
}: {
  id: TaskStatus
  title: string
  accent: string
  tareas: Tarea[]
  saving: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border border-t-4 ${accent} bg-slate-100/60 p-3 transition-colors ${
        isOver ? 'bg-amber-50 ring-2 ring-amber-300' : 'border-slate-200'
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">
          {tareas.length}
        </span>
      </div>
      <div className="flex min-h-[120px] flex-col gap-2">
        {tareas.map((t) => (
          <Card key={t.id} tarea={t} saving={saving === t.id} />
        ))}
        {tareas.length === 0 && (
          <div className="grid flex-1 place-items-center rounded-lg border-2 border-dashed border-slate-200 py-6 text-xs text-slate-300">
            Soltar aquí
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ tarea, saving }: { tarea: Tarea; saving: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: tarea.id })
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }
  const bloqueada = tarea.status === 'Bloqueada'

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab touch-none rounded-lg border bg-white p-3 shadow-sm active:cursor-grabbing ${
        bloqueada ? 'border-red-200' : 'border-slate-200'
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5">
        {tarea.es_critica && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
            CRÍTICA
          </span>
        )}
        {bloqueada && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
            BLOQUEADA
          </span>
        )}
        {saving && (
          <span className="text-[10px] text-slate-400">guardando…</span>
        )}
      </div>
      <p className="text-sm font-medium text-slate-800">{tarea.nombre}</p>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>
          {tarea.duracion_estimada_horas != null
            ? `${tarea.duracion_estimada_horas}h`
            : ''}
          {tarea.turno_asignado ? ` · ${tarea.turno_asignado}` : ''}
        </span>
        <span>{tarea.porcentaje_completado}%</span>
      </div>
      {bloqueada && tarea.razon_bloqueo && (
        <p className="mt-1 text-[11px] text-red-600">⚠️ {tarea.razon_bloqueo}</p>
      )}
    </article>
  )
}
