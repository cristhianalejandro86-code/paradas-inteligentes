import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from './supabase'

/**
 * Mantiene la vista al día con la BD por DOS caminos:
 *
 * 1. REALTIME (Supabase): se suscribe a los cambios de `tarea` (de esta parada) y de
 *    la fila de `parada` (config de cuadrillas). Cualquier edición hecha en OTRA
 *    pestaña, otra vista, otro dispositivo u otro usuario refresca esta vista sola
 *    en ~1 s, sin tocar nada. Debounce de 500 ms para agrupar ráfagas (ediciones
 *    masivas, nivelaciones).
 *
 * 2. RE-FOCUS (respaldo): si Realtime se cae o el cambio ocurrió sin conexión,
 *    al volver a la pestaña (visibilitychange/focus) se refresca igual.
 *
 * Detalle de diseño: el callback vive en un ref para suscribir los listeners UNA
 * sola vez (las funciones que pasan las páginas se recrean en cada render).
 * La navegación entre vistas dentro de la app ya refresca sola (remonta la ruta).
 */
export function useRefreshOnFocus(onRefresh: () => void) {
  const { id } = useParams<{ id: string }>()
  const cb = useRef(onRefresh)
  cb.current = onRefresh // siempre el callback más reciente, sin re-suscribir

  // 1) Realtime: cambios en la BD → refresco automático (sin re-enfocar).
  useEffect(() => {
    if (!id) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => cb.current(), 500)
    }
    const ch = supabase
      .channel(`rt-parada-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarea', filter: `parada_id=eq.${id}` }, debounced)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'parada', filter: `id=eq.${id}` }, debounced)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(ch)
    }
  }, [id])

  // 2) Respaldo por re-focus.
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
