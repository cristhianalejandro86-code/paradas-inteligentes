import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTareasByParada } from '../lib/api'
import { rutaCritica } from '../lib/criticalPath'
import type { Tarea } from '../types'

export function RutaCriticaPage() {
  const { id } = useParams<{ id: string }>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getTareasByParada(id).then(setTareas).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [id])

  const r = useMemo(() => {
    const { criticas, holgura } = rutaCritica(tareas)
    const total = tareas.length
    const completadas = tareas.filter((t) => t.status === 'Completada').length
    const avance = total ? Math.round((completadas / total) * 100) : 0
    const crit = tareas
      .filter((t) => criticas.has(t.id))
      .sort((a, b) => {
        const sa = a.fecha_inicio_prog ? new Date(a.fecha_inicio_prog).getTime() : (a.secuencia ?? 0)
        const sb = b.fecha_inicio_prog ? new Date(b.fecha_inicio_prog).getTime() : (b.secuencia ?? 0)
        return sa - sb
      })
    const durCrit = crit.reduce((s, t) => s + Number(t.duracion_estimada_horas ?? 0), 0)
    return { criticas, holgura, total, completadas, avance, crit, durCrit }
  }, [tareas])

  if (loading) return <p className="text-sm text-slate-400">Calculando ruta crítica…</p>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Avance general" value={`${r.avance}%`} sub={`${r.completadas}/${r.total} tareas`} />
        <Kpi label="Tareas críticas" value={String(r.crit.length)} sub="holgura ≈ 0" accent="text-red-600" />
        <Kpi label="Duración ruta crítica" value={`${r.durCrit}h`} sub="suma de críticas" />
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          🔴 Ruta crítica — si una se atrasa, atrasa toda la parada
        </h3>
        {r.crit.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700">Sin ruta crítica calculable (faltan dependencias).</div>
        ) : (
          <ol className="grid gap-2">
            {r.crit.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-100 text-sm font-bold text-red-700">{i + 1}</span>
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{t.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {(t.especificaciones_tecnicas?.sistema as string) || ''} · {t.duracion_estimada_horas}h ·{' '}
                    {t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
                <span className="rounded bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">holgura {r.holgura[t.id]}h</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  )
}
