// Paleta de 16 colores con buena separación de matiz, lo bastante oscuros para
// leer texto blanco encima. Cada cuadrilla se distingue a simple vista en el Gantt.
const PALETA = [
  '#2563eb', // azul
  '#0d9488', // teal
  '#16a34a', // verde
  '#d97706', // ámbar
  '#dc2626', // rojo
  '#7c3aed', // violeta
  '#0891b2', // cian
  '#db2777', // rosa
  '#65a30d', // lima
  '#4f46e5', // índigo
  '#ea580c', // naranja
  '#0284c7', // celeste
  '#9333ea', // púrpura
  '#059669', // esmeralda
  '#e11d48', // carmín
  '#ca8a04', // mostaza
]

export function colorGrupo(name: string): string {
  // Para grupos tipo "G3"/"G12" usa el número → color estable y sin colisiones.
  const m = /(\d+)/.exec(name)
  if (m) return PALETA[(Number(m[1]) - 1 + PALETA.length) % PALETA.length]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % PALETA.length
  return PALETA[h]
}

// Inferir disciplina desde el texto de la actividad/sistema.
export function disciplina(texto: string): 'Mecánica' | 'Eléctrica' | 'Instrumentación' {
  const s = texto.toUpperCase()
  if (/EL[ÉE]CTR|MOTOR|VARIADOR|TABLERO|CABLE|ILUMINAC|SUBESTAC|CCM/.test(s)) return 'Eléctrica'
  if (/INSTRUMENT|SENSOR|TRANSMISOR|V[ÁA]LVULA CUCHILLA|CONTROL|FLUJ[OÓ]METR|MAN[ÓO]METR|CALIBRAC/.test(s)) return 'Instrumentación'
  return 'Mecánica'
}
