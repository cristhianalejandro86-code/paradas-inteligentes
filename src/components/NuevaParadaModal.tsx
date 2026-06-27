import { useState } from 'react'
import { createParada } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Parada } from '../types'

export function NuevaParadaModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (parada: Parada) => void
}) {
  const { perfil } = useAuth()
  const [nombre, setNombre] = useState('')
  const [equipo, setEquipo] = useState('')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [horas, setHoras] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!perfil?.id) {
      setError('Tu cuenta no está vinculada a un usuario del sistema.')
      return
    }
    if (inicio >= fin) {
      setError('La fecha de inicio debe ser anterior a la de fin.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const parada = await createParada(
        {
          nombre: nombre.trim(),
          equipo_afectado: equipo.trim() || undefined,
          fecha_inicio_planeada: inicio,
          fecha_fin_planeada: fin,
          duracion_planeada_horas: horas ? Number(horas) : undefined,
        },
        perfil.id,
      )
      onCreated(parada)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h3 className="mb-4 text-lg font-semibold text-slate-900">
          Nueva parada
        </h3>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Nombre
        </label>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Ej: Mantenimiento Reactor 3"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Equipo afectado
        </label>
        <input
          value={equipo}
          onChange={(e) => setEquipo(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Ej: Reactor 3 / Bomba TI-305"
        />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Inicio
            </label>
            <input
              type="date"
              required
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Fin
            </label>
            <input
              type="date"
              required
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Duración planeada (horas, opcional)
        </label>
        <input
          type="number"
          min={1}
          value={horas}
          onChange={(e) => setHoras(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Ej: 48"
        />

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
            {saving ? 'Creando…' : 'Crear parada'}
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
