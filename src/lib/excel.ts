import * as XLSX from 'xlsx'
import { disciplina as discDe } from './palette'
import type { Tarea } from '../types'

export const COLS = [
  'WBS', 'Area', 'Equipo_TAG', 'Actividad', 'Grupo', 'Tecnicos',
  'Disciplina', 'Duracion_h', 'Inicio', 'Fin', 'Predecesora', 'Estado', 'Avance_%',
] as const

const esp = (t: Tarea) => (t.especificaciones_tecnicas ?? {}) as Record<string, unknown>
const fmt = (s?: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Exporta las tareas de una parada a un archivo Excel descargable. */
export function exportarExcel(tareas: Tarea[], nombreParada: string) {
  const secById = new Map(tareas.map((t) => [t.id, t.secuencia ?? '']))
  const rows = [...tareas]
    .sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0))
    .map((t) => {
      const e = esp(t)
      return {
        WBS: e.wbs ?? '',
        Area: e.sistema ?? '',
        Equipo_TAG: e.tag ?? '',
        Actividad: t.nombre,
        Grupo: e.grupo ?? '',
        Tecnicos: e.tec ?? '',
        Disciplina: (e.disciplina as string) || discDe(`${t.nombre} ${e.sistema ?? ''}`),
        Duracion_h: t.duracion_estimada_horas ?? '',
        Inicio: fmt(t.fecha_inicio_prog),
        Fin: fmt(t.fecha_fin_prog),
        Predecesora: t.bloqueado_por ? secById.get(t.bloqueado_por) ?? '' : '',
        Estado: t.status,
        'Avance_%': t.porcentaje_completado,
      }
    })
  const ws = XLSX.utils.json_to_sheet(rows, { header: COLS as unknown as string[] })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trabajos')
  XLSX.writeFile(wb, `Trabajos_${nombreParada.replace(/[^\w]+/g, '_')}.xlsx`)
}

/** Descarga una plantilla en blanco con las columnas y un ejemplo. */
export function descargarPlantilla() {
  const ejemplo = {
    WBS: 'WB-01', Area: 'ESPESADOR 054-011', Equipo_TAG: '054-011',
    Actividad: 'CAMBIO DE CANASTILLA MOVIL', Grupo: 'G1', Tecnicos: 3,
    Disciplina: 'Mecánica', Duracion_h: 4, Inicio: '2026-07-20 08:00', Fin: '2026-07-20 12:00',
    Predecesora: '', Estado: 'Por_Hacer', 'Avance_%': 0,
  }
  const ws = XLSX.utils.json_to_sheet([ejemplo], { header: COLS as unknown as string[] })
  ws['!cols'] = COLS.map(() => ({ wch: 16 }))
  const notas = XLSX.utils.aoa_to_sheet([
    ['INSTRUCCIONES'],
    ['• Una fila por actividad. No borres la fila de encabezados.'],
    ['• Inicio/Fin: formato 2026-07-20 08:00 (AAAA-MM-DD HH:MM).'],
    ['• Predecesora: el número de fila (secuencia) de la actividad que debe terminar antes.'],
    ['• Estado: Por_Hacer, En_Progreso, En_Revision, Completada, Bloqueada.'],
    ['• Disciplina: Mecánica, Eléctrica o Instrumentación.'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trabajos')
  XLSX.utils.book_append_sheet(wb, notas, 'Instrucciones')
  XLSX.writeFile(wb, 'Plantilla_Paradas.xlsx')
}

/** Lee un Excel y devuelve las filas como objetos. */
export async function leerExcel(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' })
}
