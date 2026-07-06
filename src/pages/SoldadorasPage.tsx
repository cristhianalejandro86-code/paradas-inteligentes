import { EquiposPlanView } from '../components/EquiposPlanView'

export function SoldadorasPage() {
  return <EquiposPlanView cfg={{
    espKey: 'soldadoras', titulo: 'máquinas de soldar', unidad: 'máquina', unidadTitulo: 'Máquina', icono: '🔥',
    mudanzaDefault: 1, mudanzaLabel: 'Traslado y conexión',
    registroHint: 'Preparación → Equipos (🔥 soldadora)',
  }} />
}
