# BACKLOG — Mejoras operativas PRE-PARADA (priorizado valor×esfuerzo)

> Loop multi-agente. Solo lo operativo/planificación. NADA de seguridad (se ve al final).
> Estado: ⬜ pendiente · 🔄 en curso · ✅ hecho (con evidencia + commit). ⭐ = coincidencia entre ≥2 auditores (señal fuerte).

## ✅ Hecho
- ✅ **R7 — Multi-filtro** en Preparación: dropdowns Sistema + Cuadrilla(G) + "Falta" (sin cuadrilla/recursos/permiso), combinables con Línea y Solo pendientes → aísla un lote para la edición masiva. Inc 45. (Usabilidad #4)
- ✅ **R6 — Bulk de CUADRILLA**: input de grupo (con datalist de los existentes) en la barra masiva → asigna esa cuadrilla a las seleccionadas en una acción. Inc 44.
- ✅ **R5 — Edición MASIVA** (Preparación): checkbox por fila + "seleccionar todas (visibles)" + barra "N sel. → Permiso ✓/✗ · Sin recursos · Requiere · Limpiar" que aplica a todas las seleccionadas en una acción. Inc 43. (Usabilidad #1/#2). Falta: bulk de CUADRILLA (siguiente).
- ✅ **R4 — Lead-time por ítem de recurso** ("qué pedir YA"): campo Lead(d) en el modal de recursos; ítem urgente = no listo y lead > días al inicio → chip "🛒 PEDIR YA" en el consolidado + contador "N por pedir YA" junto a la cuenta regresiva. Inc 42. (Recursos #1)
- ✅ **R3 — Holgura LIBRE** (CPM `holguraLibre` = min(ES sucesoras) − EF): tooltip del Gantt "total Xh · libre Yh" + panel "🟢 Tareas más flexibles" en Ruta crítica (top 5 por holgura libre). Inc 41. (Operativo #2)
- ✅ **R2 — Plan vs ventana comprometida** (KPI en header del Gantt, visible siempre): C2 muestra "⚠ Plan +26h sobre la ventana (115h)". Inc 40. (Operativo #3)
- ✅ **R1 — Exportar consolidado de recursos + alistamiento a Excel** (hoja Recursos para Compras + hoja Alistamiento). Inc 39. (valida auditor Recursos #4)
- ✅ **R1 — Blindaje: ítem de recurso malformado ya NO revienta el tablero de Preparación** (itemsDe saneado). Inc 39. (auditor Robustez #2)
- ✅ Verificado falso positivo: `diasParaInicio` NaN ya está guardado por `isFinite` (Robustez #3) — no requería cambio.

## Alta prioridad (próximas rondas, por valor×esfuerzo)
- ⬜ **Personal disponible vs demanda por línea/turno**: alertar déficit de dotación (pico de demanda > roster cargado en cuadrillas_config). A/M. ← próximo (R8)
- ⬜ **Demanda (consolidado) vs inventario real** (`tabla recurso`): déficit = requerido − disponible. A/M. (Recursos #2)
- ⬜ **Demanda (consolidado) vs inventario real** (`tabla recurso`/getRecursos): déficit = requerido − disponible. A/M. (Recursos #2)
- ⬜ **Capacidad de equipos compartidos en Preparación** (pico de grúas/soldadoras vs disponible, no solo en el nivelador del Gantt). A/M. (Recursos #3)
- ⬜ **Ruta crítica que considere recursos (critical chain)**: tras nivelar, marcar como crítica la cadena por recurso, no solo por dependencia. A/M. (Operativo #1)

## Media
- ⬜ **% completado en Lista: onChange→onBlur** (hoy floodea updates por tecla + race). M/S. (Robustez #1)
- ⬜ **Multi-filtro** (disciplina/sistema/grupo/estado, combinables) en Lista y Preparación. M/M. (Usabilidad #4)
- ⬜ **Targets táctiles ≥40px para tablet** en grillas densas. M/S. (Usabilidad #5)
- ⬜ **Deshacer** en edición fila-a-fila (Lista y Preparación). M/M. (Usabilidad #3)
- ⬜ **Rollback** en updates optimistas masivos (nivelación) si falla el guardado. M/M. (Robustez #4)
- ⬜ **Preparación ponderada por criticidad** (faltante en ruta crítica pesa más que con holgura). M/M. (Operativo #5)
- ⬜ **Import Excel: colisión de secuencia** rompe precedencias en silencio. M/M. (Robustez #5)
- ⬜ **Alquiler vs compra cuantificado** ($/día × días de parada). M/S. (Recursos #5)
- ⬜ **Multi-predecesora** (hoy bloqueado_por es FK único; un montaje que espera mecánica Y eléctrica no se expresa). M/L. (Operativo #4)
- ⬜ Filtro de línea en Ruta crítica y Recursos (consistencia entre vistas). S.
- ⬜ Especialidad por línea (desglose soldadores/mecánicos). M.

## Por confirmar
- ⬜ Timezone: grid muestra hora local (-5) vs UTC almacenado. Confirmar si confunde al planificar.
- ⬜ Calendario de no-laborables/paros intermedios por línea (¿se trabaja 24/7? probablemente sí → no urgente).
