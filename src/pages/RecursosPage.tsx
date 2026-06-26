import { useEffect, useMemo, useState } from 'react'
import { getRecursos } from '../lib/api'
import type { Recurso, ResourceStatus } from '../types'

type Urgencia = 'CRÍTICA' | 'MEDIA' | 'OK'

function urgenciaDe(r: Recurso): Urgencia {
  if (r.estado === 'Dañado' || r.estado === 'Perdido') return 'CRÍTICA'
  if (r.stock_disponible <= 0) return 'CRÍTICA'
  if (r.stock_disponible < r.stock_total) return 'MEDIA'
  return 'OK'
}

export function RecursosPage() {
  const [recursos, setRecursos] = useState<Recurso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getRecursos()
      .then(setRecursos)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filas = useMemo(
    () =>
      recursos
        .map((r) => ({ r, urgencia: urgenciaDe(r) }))
        .sort((a, b) => orden(b.urgencia) - orden(a.urgencia)),
    [recursos],
  )

  const deficit = filas.filter((f) => f.urgencia === 'CRÍTICA').length

  function exportarCSV() {
    const header = [
      'Recurso',
      'Tipo',
      'Codigo',
      'Estado',
      'Disponible',
      'Total',
      'Urgencia',
      'Ubicacion',
    ]
    const rows = filas.map(({ r, urgencia }) => [
      r.nombre,
      r.tipo,
      r.codigo_activo ?? '',
      r.estado,
      String(r.stock_disponible),
      String(r.stock_total),
      urgencia,
      r.ubicacion_real ?? '',
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    a.download = `Demanda_${fecha}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando recursos…</p>
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Error: {error}
      </div>
    )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {recursos.length} recursos ·{' '}
          {deficit > 0 ? (
            <span className="font-medium text-red-600">{deficit} en déficit</span>
          ) : (
            <span className="text-emerald-600">sin déficit</span>
          )}
        </p>
        <button
          type="button"
          onClick={exportarCSV}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ⬇ Exportar CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Recurso</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Urgencia</th>
              <th className="px-4 py-3 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map(({ r, urgencia }) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{r.nombre}</div>
                  {r.codigo_activo && (
                    <div className="text-xs text-slate-400">{r.codigo_activo}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.tipo}</td>
                <td className="px-4 py-3 text-slate-600">
                  <span
                    className={
                      r.stock_disponible <= 0
                        ? 'font-semibold text-red-600'
                        : ''
                    }
                  >
                    {r.stock_disponible}
                  </span>
                  <span className="text-slate-400"> / {r.stock_total}</span>
                </td>
                <td className="px-4 py-3">
                  <EstadoChip estado={r.estado} />
                </td>
                <td className="px-4 py-3">
                  <UrgenciaChip urgencia={urgencia} />
                </td>
                <td className="px-4 py-3">
                  {urgencia === 'CRÍTICA' && r.es_alquilable ? (
                    <span className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white">
                      Alquilar
                      {r.costo_diario_alquiler
                        ? ` ($${r.costo_diario_alquiler}/día)`
                        : ''}
                    </span>
                  ) : urgencia === 'CRÍTICA' ? (
                    <span className="text-xs text-red-600">Comprar / reponer</span>
                  ) : (
                    <span className="text-xs text-slate-400">OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function orden(u: Urgencia) {
  return u === 'CRÍTICA' ? 2 : u === 'MEDIA' ? 1 : 0
}

function UrgenciaChip({ urgencia }: { urgencia: Urgencia }) {
  const map: Record<Urgencia, string> = {
    CRÍTICA: 'bg-red-100 text-red-700',
    MEDIA: 'bg-amber-100 text-amber-700',
    OK: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${map[urgencia]}`}>
      {urgencia}
    </span>
  )
}

function EstadoChip({ estado }: { estado: ResourceStatus }) {
  const map: Record<ResourceStatus, string> = {
    Disponible: 'bg-emerald-50 text-emerald-700',
    En_Uso: 'bg-blue-50 text-blue-700',
    En_Mantenimiento: 'bg-amber-50 text-amber-700',
    Dañado: 'bg-red-50 text-red-700',
    Perdido: 'bg-red-50 text-red-700',
    Devuelto: 'bg-slate-100 text-slate-500',
    En_Almacen: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${map[estado]}`}>
      {estado.replace('_', ' ')}
    </span>
  )
}
