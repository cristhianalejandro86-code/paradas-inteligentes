import { useEffect, useState } from 'react'
import { createTarea, getUsuarios } from '../lib/api'
import type { Tarea } from '../types'

export function NuevaTareaModal({
  paradaId,
  onClose,
  onCreated,
}: {
  paradaId: string
  onClose: () => void
  onCreated: (tarea: Tarea) => void
}) {
  const [nombre, setNombre] = useState('')
  const [duracion, setDuracion] = useState('2')
  const [turno, setTurno] = useState('')
  const [critica, setCritica] = useState(false)
  const [responsable, setResponsable] = useState('')
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getUsuarios()
      .then(setUsuarios)
      .catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const tarea = await createTarea(paradaId, {
        nombre: nombre.trim(),
        duracion_estimada_horas: Number(duracion) || 1,
        turno_asignado: turno || null,
        es_critica: critica,
        responsable_id: responsable || null,
      })
      onCreated(tarea)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear')
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Nueva tarea</h3>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Nombre
        </label>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Ej: Desmontar bomba"
        />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Duración (h)
            </label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              required
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Turno
            </label>
            <select
              value={turno}
              onChange={(e) => setTurno(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="Mañana">Mañana</option>
              <option value="Noche">Noche</option>
              <option value="Completo">Completo</option>
            </select>
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Responsable
        </label>
        <select
          value={responsable}
          onChange={(e) => setResponsable(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Sin asignar</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>

        <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={critica}
            onChange={(e) => setCritica(e.target.checked)}
            className="accent-red-500"
          />
          Tarea crítica (ruta crítica)
        </label>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {saving ? 'Creando…' : 'Crear tarea'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
