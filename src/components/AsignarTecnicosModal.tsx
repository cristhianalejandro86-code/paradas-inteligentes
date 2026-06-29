import { useState } from 'react'
import { updateTareaEspec } from '../lib/api'
import type { Tarea } from '../types'

interface Usuario { id: string; nombre: string; rol: string; cargo?: string | null; especialidad?: string | null; area?: string | null; linea?: string | null }

/** Asigna múltiples técnicos (con su cargo y especialidad) a una tarea. */
export function AsignarTecnicosModal({
  tarea,
  usuarios,
  area,
  onClose,
  onSaved,
}: {
  tarea: Tarea
  usuarios: Usuario[]
  area?: string | null
  onClose: () => void
  onSaved: (espec: Record<string, unknown>) => void
}) {
  const actuales = ((tarea.especificaciones_tecnicas?.asignados as { id: string }[]) ?? []).map((a) => a.id)
  const [sel, setSel] = useState<Set<string>>(new Set(actuales))
  const [q, setQ] = useState('')
  const [soloArea, setSoloArea] = useState(true)

  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  function guardar() {
    const asignados = usuarios.filter((u) => sel.has(u.id)).map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol, especialidad: u.especialidad ?? null }))
    const espec = { ...(tarea.especificaciones_tecnicas ?? {}), asignados, tec: asignados.length }
    updateTareaEspec(tarea.id, espec).then(() => { onSaved(espec); onClose() }).catch(() => onClose())
  }

  const lista = usuarios.filter((u) =>
    (!q || u.nombre.toLowerCase().includes(q.toLowerCase()) || (u.especialidad ?? '').toLowerCase().includes(q.toLowerCase())) &&
    (!soloArea || !area || !u.area || u.area === area))

  return (
    <div role="dialog" aria-modal="true" onKeyDown={(e) => e.key === 'Escape' && onClose()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-slate-900">Asignar técnicos</h3>
        <p className="mb-2 truncate text-xs text-slate-500" title={tarea.nombre}>{tarea.nombre}</p>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o especialidad…" className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        {area && <label className="mb-2 flex items-center gap-1 text-[11px] text-slate-600"><input type="checkbox" checked={soloArea} onChange={(e) => setSoloArea(e.target.checked)} className="accent-amber-500" />Solo personal de {area}</label>}
        <div className="grid gap-0.5 overflow-y-auto">
          {lista.map((u) => (
            <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} className="accent-amber-500" />
              <span className="flex-1 truncate">{u.nombre}{u.linea ? <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] text-slate-400">{u.linea}</span> : null}</span>
              {u.especialidad && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{u.especialidad}</span>}
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{(u.cargo || u.rol).replace('_', ' ')}</span>
            </label>
          ))}
          {lista.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">Sin coincidencias.</p>}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">{sel.size} técnico{sel.size === 1 ? '' : 's'}</span>
          <div className="flex gap-2">
            <button onClick={guardar} className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">Guardar</button>
            <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
