import { EquiposPlanView } from '../components/EquiposPlanView'

export function AndamiosPage() {
  return <EquiposPlanView cfg={{
    espKey: 'andamios', titulo: 'andamios', unidad: 'cuerpo', unidadTitulo: 'Cuerpo', icono: '🏗',
    mudanzaDefault: 4, mudanzaLabel: 'Desarme + traslado + armado',
    registroHint: 'Preparación → Equipos (🏗 andamio)',
  }} />
}
