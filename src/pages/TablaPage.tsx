import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTareasByParada, updateTarea } from '../lib/api'
import { colorGrupo, disciplina as discDe } from '../lib/palette'
import { NuevaTareaModal } from '../components/NuevaTareaModal'
import type { Tarea, TaskStatus } from '../types'

const ESTADOS: TaskStatus[] = ['Por_Hacer', 'En_Progreso', 'En_Revision', 'Completada', 'Bloqueada', 'Cancelada']
const COLOR: Record<TaskStatus, string> = {
  Por_Hacer: 'bg-slate-100 text-slate-600', En_Progreso: 'bg-blue-50 text-blue-700',
  En_Revision: 'bg-violet-50 text-violet-700', Completada: 'bg-emerald-50 text-emerald-700',
  Bloqueada: 'bg-red-50 text-red-700', Cancelada: 'bg-slate-100 text-slate-400',
}
const sysOf = (t: Tarea) => (t.especificaciones_tecnicas?.sistema as string) || 'General'
const grpOf = (t: Tarea) => (t.especificaciones_tecnicas?.grupo as string) || '—'
const tecOf = (t: Tarea) => (t.especificaciones_tecnicas?.tec as number) ?? ''
const discOf = (t: Tarea) => discDe(`${t.nombre} ${sysOf(t)}`)
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')

type SortKey = 'secuencia' | 'nombre' | 'sistema' | 'grupo' | 'duracion_estimada_horas' | 'fecha_inicio_prog' | 'status' | 'porcentaje_completado'

export function TablaPage() {
  const { id } = useParams<{ id: string }>()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fDisc, setFDisc] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'secuencia', dir: 1 })
  const [creando, setCreando] = useState(false)
  const [secById, setSecById] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!id) return
    getTareasByParada(id).then((d) => {
      setTareas(d)
      setSecById(Object.fromEntries(d.map((t) => [t.id, t.secuencia ?? 0])))
    }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [id])

  function save(idt: string, fields: Partial<Tarea>) {
    setTareas((ts) => ts.map((t) => (t.id === idt ? { ...t, ...fields } : t)))
    updateTarea(idt, fields as never).catch((e) => setError(String(e)))
  }

  const filas = useMemo(() => {
    let r = tareas
    if (q) r = r.filter((t) => t.nombre.toLowerCase().includes(q.toLowerCase()) || sysOf(t).toLowerCase().includes(q.toLowerCase()))
    if (fEstado) r = r.filter((t) => t.status === fEstado)
    if (fDisc) r = r.filter((t) => discOf(t) === fDisc)
    const val = (t: Tarea): string | number => {
      switch (sort.key) {
        case 'sistema': return sysOf(t)
        case 'grupo': return grpOf(t)
        case 'fecha_inicio_prog': return t.fecha_inicio_prog ? new Date(t.fecha_inicio_prog).getTime() : 0
        case 'nombre': return t.nombre
        case 'status': return t.status
        default: return (t[sort.key as keyof Tarea] as number) ?? 0
      }
    }
    return [...r].sort((a, b) => { const x = val(a), y = val(b); return x < y ? -sort.dir : x > y ? sort.dir : 0 })
  }, [tareas, q, fEstado, fDisc, sort])

  if (loading) return <p className="text-sm text-slate-400">Cargando…</p>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>

  const Th = ({ k, children, className = '' }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`whitespace-nowrap px-2 py-2 text-left font-semibold ${k ? 'cursor-pointer select-none hover:text-slate-900' : ''} ${className}`}
      onClick={k ? () => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 1 ? -1 : 1 })) : undefined}>
      {children}{k && sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar actividad o sistema…" className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Estado: todos</option>{ESTADOS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={fDisc} onChange={(e) => setFDisc(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Disciplina: todas</option>{['Mecánica', 'Eléctrica', 'Instrumentación'].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="text-xs text-slate-400">{filas.length} de {tareas.length}</span>
        <button onClick={() => setCreando(true)} className="ml-auto rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">+ Nueva tarea</button>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: '72vh' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Th k="secuencia">#</Th><Th k="nombre">Actividad</Th><Th k="sistema">Área / Sistema</Th>
              <Th k="grupo">Grupo</Th><Th>Téc</Th><Th>Disciplina</Th><Th k="duracion_estimada_horas">Hrs</Th>
              <Th k="fecha_inicio_prog">Comienzo</Th><Th>Fin</Th><Th>Pred</Th><Th k="status">Estado</Th><Th k="porcentaje_completado">%</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((t, i) => (
              <tr key={t.id} className={i % 2 ? 'bg-white' : 'bg-slate-50/40'}>
                <td className="px-2 py-1 text-slate-400">{t.secuencia}</td>
                <td className="px-2 py-1 min-w-[260px]">
                  <input defaultValue={t.nombre} onBlur={(e) => e.target.value !== t.nombre && save(t.id, { nombre: e.target.value })}
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none" />
                </td>
                <td className="px-2 py-1 text-slate-600">{sysOf(t)}</td>
                <td className="px-2 py-1"><span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: colorGrupo(sysOf(t)) }}>{grpOf(t)}</span></td>
                <td className="px-2 py-1 text-center text-slate-600">{tecOf(t)}</td>
                <td className="px-2 py-1 text-slate-600">{discOf(t)}</td>
                <td className="px-2 py-1">
                  <input type="number" min={0} step={0.5} defaultValue={Number(t.duracion_estimada_horas ?? 0)} onBlur={(e) => Number(e.target.value) !== Number(t.duracion_estimada_horas) && save(t.id, { duracion_estimada_horas: Number(e.target.value) })}
                    className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none" />
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-xs text-slate-500">{fmt(t.fecha_inicio_prog)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-xs text-slate-500">{fmt(t.fecha_fin_prog)}</td>
                <td className="px-2 py-1 text-slate-500">{t.bloqueado_por ? `#${secById[t.bloqueado_por] ?? ''}` : ''}</td>
                <td className="px-2 py-1">
                  <select value={t.status} onChange={(e) => save(t.id, { status: e.target.value as TaskStatus })}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${COLOR[t.status]}`}>
                    {ESTADOS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input type="number" min={0} max={100} step={5} value={t.porcentaje_completado} onChange={(e) => save(t.id, { porcentaje_completado: Math.min(100, Math.max(0, Number(e.target.value))) })}
                    className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creando && id && <NuevaTareaModal paradaId={id} onClose={() => setCreando(false)} onCreated={(t) => { setTareas((ts) => [...ts, t]); setSecById((m) => ({ ...m, [t.id]: t.secuencia ?? 0 })) }} />}
    </div>
  )
}
