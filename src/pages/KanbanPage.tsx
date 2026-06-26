import { useParams } from 'react-router-dom'
import { KanbanBoard } from '../components/KanbanBoard'

export function KanbanPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return <KanbanBoard paradaId={id} />
}
