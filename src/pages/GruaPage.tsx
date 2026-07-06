import { EquiposPlanView } from '../components/EquiposPlanView'

/** Grúas MÓVILES / camión grúa (el puente grúa tiene su propio panel en Cuadrillas). */
export function GruaPage() {
  return <EquiposPlanView cfg={{
    espKey: 'grua', titulo: 'grúas móviles', unidad: 'grúa', unidadTitulo: 'Grúa', icono: '🚛',
    mudanzaDefault: 2, mudanzaLabel: 'Traslado y posicionamiento',
    registroHint: 'Preparación → Equipos (🚛 grúa)',
  }} />
}
