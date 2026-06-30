import { useEffect, useRef, useState } from 'react'

/**
 * Ancho de columna ARRASTRABLE y recordado (localStorage). Una sola fuente para que la
 * columna «Actividad» se pueda ensanchar/reducir igual en todas las vistas (Gantt,
 * Lista, Preparación…) y leer el nombre completo.
 */
export function useColWidth(key: string, def = 280, min = 140, max = 720) {
  const [w, setW] = useState(() => {
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    const n = s ? Number(s) : NaN
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
  })
  const drag = useRef<{ x0: number; w0: number } | null>(null)
  const onResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    drag.current = { x0: e.clientX, w0: w }
    const move = (ev: PointerEvent) => { const d = drag.current; if (!d) return; setW(Math.max(min, Math.min(max, Math.round(d.w0 + (ev.clientX - d.x0))))) }
    const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  useEffect(() => { try { localStorage.setItem(key, String(w)) } catch { /* sin persistencia */ } }, [key, w])
  return { w, onResize }
}

/** Manija de arrastre para el borde derecho del encabezado de una columna. El contenedor
 *  padre debe ser `relative`. */
export function ColResizeHandle({ onResize }: { onResize: (e: React.PointerEvent) => void }) {
  return <div onPointerDown={onResize} title="Arrastra para ensanchar/reducir la columna y leer el nombre completo" className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-amber-400/70" style={{ touchAction: 'none' }} />
}
