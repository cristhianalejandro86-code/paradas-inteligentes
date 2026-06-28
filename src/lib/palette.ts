// Paleta ejecutiva sobria para colorear grupos/sistemas en el Gantt.
const PALETA = [
  '#1f3a5f', // navy
  '#2e6171', // teal oscuro
  '#3d5a45', // verde bosque
  '#6b4e3d', // marrón
  '#544a6e', // ciruela
  '#41607a', // azul acero
  '#5c6b45', // oliva
  '#2d4a4a', // pizarra verdosa
  '#7a5448', // terracota apagado
  '#4a4f63', // grafito azulado
  '#6e5a3d', // ocre
  '#455c5a', // verde grisáceo
  '#5a4860', // morado apagado
  '#3a4a5e', // azul humo
  '#664a4a', // burdeos apagado
  '#4d5e4a', // salvia
]

export function colorGrupo(name: string): string {
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
