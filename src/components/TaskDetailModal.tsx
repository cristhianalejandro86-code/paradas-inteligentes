import { useEffect, useState } from 'react'
import { getProgresoByTarea, registrarAvance } from '../lib/api'
import type { Progreso, Tarea, TaskStatus } from '../types'

const STATUS_OPTIONS: TaskStatus[] = [
  'Por_Hacer',
  'En_Progreso',
  'En_Revision',
  'Completada',
  'Bloqueada',
]

export function TaskDetailModal({
  tarea,
  onClose,
  onSaved,
}: {
  tarea: Tarea
  onClose: () => void
  onSaved: (porcentaje: number, status: TaskStatus) => void
}) {
  const [porcentaje, setPorcentaje] = useState(tarea.porcentaje_completado)
  const [status, setStatus] = useState<TaskStatus>(tarea.status)
  const [comentario, setComentario] = useState('')
  const [historial, setHistorial] = useState<Progreso[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getProgresoByTarea(tarea.id)
      .then(setHistorial)
      .catch(() => {})
  }, [tarea.id])

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await registrarAvance(tarea.id, { porcentaje, status, comentario })
      onSaved(porcentaje, status)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {tarea.nombre}
            </h3>
            <p className="text-xs text-slate-500">
              {tarea.es_critica && '⚠️ Crítica · '}
              {tarea.duracion_estimada_horas != null &&
                `${tarea.duracion_estimada_horas}h estimadas`}
              {tarea.turno_asignado ? ` · ${tarea.turno_asignado}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* % completado */}
        <label className="mb-1 block text-sm font-medium text-slate-700">
          % Completado: {porcentaje}%
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={porcentaje}
          onChange={(e) => setPorcentaje(Number(e.target.value))}
          className="mb-4 w-full accent-amber-500"
        />

        {/* Estado */}
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Estado
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TaskStatus)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>

        {/* Comentario */}
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Comentario de avance
        </label>
        <textarea
          value={comentario}
          maxLength={140}
          rows={2}
          placeholder="Ej: 3 pernos corrosivos, falta sacar los últimos…"
          onChange={(e) => setComentario(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mb-4 mt-1 text-right text-xs text-slate-400">
          {comentario.length}/140
        </p>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Registrar avance'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>

        {/* Historial */}
        {historial.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Historial de avances
            </h4>
            <ul className="grid gap-2">
              {historial.map((h) => (
                <li key={h.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{h.porcentaje_completado}%</span>
                    <span>{new Date(h.created_at).toLocaleString('es-PE')}</span>
                  </div>
                  {h.comentario && (
                    <p className="mt-0.5 text-slate-700">{h.comentario}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
