import { useEffect, useRef } from 'react'

/**
 * Re-fetch de datos cuando la pestaña/ventana vuelve a estar visible — útil cuando
 * otra pestaña, otro dispositivo u otro usuario modificó los datos en la BD.
 *
 * Detalle de diseño:
 * - Guarda el callback en un ref para suscribir el listener UNA sola vez (las
 *   funciones que le pasan las páginas se recrean en cada render; si estuvieran en
 *   las deps, el listener se quitaría y re-añadiría en cada render).
 * - Escucha `visibilitychange` (más confiable al cambiar de pestaña) y `focus`.
 * - No dispara mientras la pestaña está oculta ni recién montada (el fetch inicial
 *   ya lo hace el `useEffect` de carga de cada página).
 *
 * Nota: la navegación entre vistas DENTRO de la app ya refresca sola, porque cada
 * ruta se desmonta y re-monta (su efecto de carga vuelve a pedir los datos). Este
 * hook cubre el caso entre pestañas/dispositivos. La sincronización en vivo real
 * (sin volver a enfocar) llegará con Supabase Realtime.
 */
export function useRefreshOnFocus(onRefresh: () => void) {
  const cb = useRef(onRefresh)
  cb.current = onRefresh // siempre el callback más reciente, sin re-suscribir

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const trigger = () => {
      if (document.visibilityState !== 'visible') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => cb.current(), 200) // debounce: visibilitychange + focus pueden coincidir
    }
    window.addEventListener('focus', trigger)
    document.addEventListener('visibilitychange', trigger)
    return () => {
      window.removeEventListener('focus', trigger)
      document.removeEventListener('visibilitychange', trigger)
      if (timer) clearTimeout(timer)
    }
  }, [])
}
