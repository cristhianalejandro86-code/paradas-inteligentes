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

type RecItem = { t: string; n: string; q: number; e: string }
const esTrabajo = (t: Tarea) => !esp(t).hito_inicio && Number(t.duracion_estimada_horas ?? 0) > 0
const conCuad = (t: Tarea) => { const g = esp(t).grupo as string; const a = esp(t).asignados as unknown[]; return (!!g && g !== '—') || (Array.isArray(a) && a.length > 0) }
const itemsDe = (t: Tarea): RecItem[] => (Array.isArray(esp(t).recursos) ? (esp(t).recursos as RecItem[]) : [])
const matListo = (t: Tarea) => { const it = itemsDe(t); return !!esp(t).matNA || (it.length > 0 && it.every((i) => i.e === 'listo')) }

/**
 * Exporta la PREPARACIÓN de la parada a Excel (para Compras/Logística): hoja "Recursos"
 * = consolidado de herramientas/equipos/materiales con cantidad y cuántos faltan; hoja
 * "Alistamiento" = estado por actividad (cuadrilla/recursos/permiso/listo). Opcional:
 * filtra por línea.
 */
export function exportarPreparacion(tareas: Tarea[], nombreParada: string, linea?: string) {
  const work = tareas.filter(esTrabajo).filter((t) => !linea || linea === 'Todas' || String(esp(t).linea ?? '') === linea)
  // Hoja 1 — consolidado de recursos por tipo+nombre
  const agg: Record<string, { Tipo: string; Recurso: string; Cantidad: number; Listos: number; En_ruta: number; Faltan: number }> = {}
  for (const t of work) for (const it of itemsDe(t)) {
    const k = `${it.t}|${String(it.n).trim().toLowerCase()}`
    const r = (agg[k] ??= { Tipo: it.t, Recurso: String(it.n).trim(), Cantidad: 0, Listos: 0, En_ruta: 0, Faltan: 0 })
    const q = Number(it.q) || 0
    r.Cantidad += q
    if (it.e === 'listo') r.Listos += q; else if (it.e === 'en_ruta') r.En_ruta += q; else r.Faltan += q
  }
  const recursos = Object.values(agg).sort((a, b) => a.Tipo.localeCompare(b.Tipo) || a.Recurso.localeCompare(b.Recurso))
  // Hoja 2 — alistamiento por actividad
  const alist = [...work].sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0)).map((t) => ({
    Secuencia: t.secuencia ?? '',
    Actividad: t.nombre,
    Sistema: esp(t).sistema ?? '',
    Linea: esp(t).linea ?? '',
    Cuadrilla: conCuad(t) ? (esp(t).grupo || 'asignada') : 'FALTA',
    Recursos: esp(t).matNA ? 'N/A' : matListo(t) ? 'Listo' : (itemsDe(t).length ? 'Pendiente' : 'Sin definir'),
    Permiso: esp(t).permiso ? 'OK' : 'FALTA',
    Listo: conCuad(t) && matListo(t) && !!esp(t).permiso ? 'SÍ' : 'no',
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recursos.length ? recursos : [{ Tipo: '', Recurso: '(sin recursos listados aún)', Cantidad: '', Listos: '', En_ruta: '', Faltan: '' }]), 'Recursos')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(alist), 'Alistamiento')
  const suf = linea && linea !== 'Todas' ? `_${linea.replace(/[^\w]+/g, '_')}` : ''
  XLSX.writeFile(wb, `Preparacion_${nombreParada.replace(/[^\w]+/g, '_')}${suf}.xlsx`)
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
