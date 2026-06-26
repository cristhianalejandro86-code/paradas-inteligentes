import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTareasByParada } from '../lib/api'
import type { Tarea } from '../types'

export function RutaCriticaPage() {
  const { id } = useParams<{ id: string }>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getTareasByParada(id)
      .then(setTareas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const resumen = useMemo(() => {
    const total = tareas.length
    const completadas = tareas.filter((t) => t.status === 'Completada').length
    const avancePct = total ? Math.round((completadas / total) * 100) : 0
    const avancePonderado = total
      ? Math.round(
          tareas.reduce((s, t) => s + (t.porcentaje_completado ?? 0), 0) / total,
        )
      : 0
    const horasEstimadas = tareas.reduce(
      (s, t) => s + Number(t.duracion_estimada_horas ?? 0),
      0,
    )

    // Top tareas críticas que ponen en riesgo la parada.
    const nombrePorId = new Map(tareas.map((t) => [t.id, t.nombre]))
    const enRiesgo = tareas
      .filter(
        (t) =>
          t.es_critica &&
          t.status !== 'Completada' &&
          t.status !== 'Cancelada',
      )
      .map((t) => ({
        tarea: t,
        bloqueadaPor: t.bloqueado_por
          ? nombrePorId.get(t.bloqueado_por) ?? '—'
          : null,
        // Riesgo: lo que falta (100-%) ponderado por duración; bloqueada pesa más.
        riesgo:
          (100 - (t.porcentaje_completado ?? 0)) *
            Number(t.duracion_estimada_horas ?? 1) +
          (t.status === 'Bloqueada' ? 200 : 0),
      }))
      .sort((a, b) => b.riesgo - a.riesgo)

    return { total, completadas, avancePct, avancePonderado, horasEstimadas, enRiesgo }
  }, [tareas])

  if (loading) return <p className="text-sm text-slate-400">Calculando ruta crítica…</p>
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Error: {error}
      </div>
    )

  return (
    <div className="grid gap-6">
      {/* Avance general */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Avance general
        </h3>
        <div className="mb-2 flex items-end justify-between">
          <span className="text-3xl font-bold text-slate-900">
            {resumen.avancePct}%
          </span>
          <span className="text-sm text-slate-500">
            {resumen.completadas} de {resumen.total} tareas · {resumen.horasEstimadas}h estimadas
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${resumen.avancePct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Avance ponderado por progreso real: {resumen.avancePonderado}%
        </p>
      </section>

      {/* Top tareas que atrasan */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          ⚠️ Tareas críticas que atrasan todo
        </h3>
        {resumen.enRiesgo.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700">
            ✓ Ninguna tarea crítica pendiente. Ruta crítica sin riesgos activos.
          </div>
        ) : (
          <ol className="grid gap-3">
            {resumen.enRiesgo.map((r, i) => (
              <li
                key={r.tarea.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-100 text-sm font-bold text-red-700">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-slate-900">
                        {r.tarea.nombre}
                      </h4>
                      <StatusChip status={r.tarea.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                      <span>Estimado: {r.tarea.duracion_estimada_horas ?? '—'}h</span>
                      <span>Completado: {r.tarea.porcentaje_completado}%</span>
                      {r.tarea.turno_asignado && (
                        <span>Turno: {r.tarea.turno_asignado}</span>
                      )}
                      {r.bloqueadaPor && (
                        <span className="text-red-600">
                          Bloqueada por: {r.bloqueadaPor}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${r.tarea.porcentaje_completado}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Impacto: está en la ruta crítica — si atrasa 1h, la parada
                      se atrasa ~1h.
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function StatusChip({ status }: { status: Tarea['status'] }) {
  const map: Record<string, string> = {
    Por_Hacer: 'bg-slate-100 text-slate-600',
    En_Progreso: 'bg-blue-50 text-blue-700',
    En_Revision: 'bg-violet-50 text-violet-700',
    Completada: 'bg-emerald-50 text-emerald-700',
    Bloqueada: 'bg-red-50 text-red-700',
    Cancelada: 'bg-slate-100 text-slate-400',
  }
  return (
    <span
      className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${map[status]}`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}
