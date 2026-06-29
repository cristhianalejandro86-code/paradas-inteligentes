import { useEffect, useRef } from 'react'

/**
 * Re-fetch datos cuando la ventana recupera foco (otra vista modificó los datos).
 * Uso: useRefreshOnFocus(() => getTareasByParada(id).then(setTareas))
 */
export function useRefreshOnFocus(onRefresh: () => void) {
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const handleFocus = () => {
      // Espera 200ms para que Realtime (futuro) cierre todas sus suscripciones
      timeoutRef.current = setTimeout(onRefresh, 200)
    }

    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [onRefresh])
}
