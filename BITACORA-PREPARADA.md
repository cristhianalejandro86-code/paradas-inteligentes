# BITÁCORA — Loop multi-agente PRE-PARADA

> Una línea por ronda: frente auditado · qué se implementó · evidencia · commit. Para que el dueño vea el avance en 30 segundos.

| Ronda | Frente / mejora | Evidencia | Commit |
|------|------------------|-----------|--------|
| R0 | Estado inicializado (BACKLOG + BITÁCORA) + fan-out de 5 auditores | archivos creados | Inc 39 |
| R1 | **Export de Preparación a Excel** (hoja Recursos para Compras: tipo/recurso/cantidad/listos/faltan + hoja Alistamiento por actividad) + **blindaje** de ítem de recurso malformado (ya no revienta el tablero) | botón "⬇ Exportar a Excel (Compras)" en panel consolidado; tablero renderiza con recurso malformado inyectado (sin crash); export sin error de consola; 4 auditores procesados → backlog enriquecido (15+ ítems, convergencias marcadas) | Inc 39 |

**Auditoría R1 (4 frentes útiles; el visual dio ruido):** convergencias fuertes detectadas → edición masiva (cuello de botella 158 tareas), lead-time/qué-pedir-ya, export para Compras (entregado), ruta crítica que ignore recursos, holgura libre, plan vs ventana comprometida. Detalle en BACKLOG.
| R2 | **Plan vs ventana comprometida** — KPI en el header del Gantt (visible siempre, no solo al filtrar línea): compara duración del plan (span de todas las tareas) vs `duracion_planeada_horas`/ventana comprometida | C2 real: ventana 115h, plan ~141h → badge rojo "⚠ Plan +26h sobre la ventana (115h)"; build limpio, sin errores de consola, screenshot, sin regresión (cómputo read-only) | Inc 40 |

| R3 | **Holgura LIBRE** en el CPM (`holguraLibre` = min(ES sucesoras) − EF) + surfacing: tooltip del Gantt "Holgura total Xh · libre Yh" y panel "🟢 Tareas más flexibles" (top 5 por holgura libre) en Ruta crítica | C2 real: panel muestra 5 tareas con "holgura libre 48h" junto a la crítica (0h); build limpio, sin errores de consola, screenshot, sin regresión | Inc 41 |

| R4 | **Lead-time por ítem de recurso** ("qué pedir YA"): campo `lead` (días) en el item + modal; urgente = no listo y lead > días al inicio → chip "🛒 PEDIR YA" en el consolidado (ordenado urgentes primero) + contador "N por pedir YA" junto a la cuenta regresiva | C2 real: con "Junta especial" lead 30 y faltan 20 días → "🛒 1 por pedir YA" + chip; "Llave 24" listo no cuenta; build limpio, sin errores de consola, screenshot, datos restaurados | Inc 42 |

| R5 | **Edición MASIVA** en Preparación: checkbox por fila + "seleccionar todas (visibles)" + barra de acción "N sel. → Permiso ✓/✗ · Sin recursos · Requiere · Limpiar" que aplica el patch a todas las seleccionadas en una sola acción (setTareas optimista + Promise.all updateTareaEspec) | C2 real: seleccioné 3 tareas → "Permiso ✓" → seq 1,2,3 permiso=true en BD desde 1 click, contador 158→155 sin permiso; build limpio, sin errores de consola, screenshot con barra+selección, datos restaurados | Inc 43 |

| R6 | **Bulk de CUADRILLA**: input de grupo (datalist con G1..G18 existentes) en la barra de edición masiva → asigna esa cuadrilla a todas las seleccionadas en una acción | C2 real: seleccioné 2 tareas, "G7" → Cuadrilla → seq 1,2 grupo=G7 en BD desde 1 click, seq 3 intacto; build limpio, sin errores de consola, screenshot con el control, grupos restaurados (G1/G2) | Inc 44 |

| R7 | **Multi-filtro** en Preparación: dropdowns Sistema + Cuadrilla(G1..G18) + "Falta" (sin cuadrilla/recursos/permiso), combinables con Línea y Solo pendientes (aplican a la lista, no al gauge) → aísla un lote para la edición masiva | C2 real: 158 → 12 al filtrar cuadrilla G3 → 12 con "sin permiso"; screenshot con filtros, build limpio, sin errores de consola, filtros read-only (sin riesgo) | Inc 45 |

| R8 | **Filtro de línea en Ruta crítica**: KPIs (avance/críticas/duración), ruta crítica, holguras, tareas flexibles y Curva S todo scopeado a la línea elegida (cada línea = su propia ruta crítica) | C2 real: KPI total 158 → 80 (L1) → 76 (L2); screenshot L1 con su crítica y curva; build limpio, sin errores de consola, filtro read-only. Pivot desde "déficit de dotación" (roster casi vacío, no demostrable) | Inc 46 |

| R9 | **Preparación ponderada por criticidad**: cruza readiness con ruta crítica → indicador "🔴 Ruta crítica: X/Y listas — prioriza estas" en el header de Preparación + marca 🔴 en las filas críticas (un faltante en la crítica pesa mucho más que con holgura) | C2 real: "🔴 Ruta crítica: 0/1 listas — prioriza estas" + 1 marca 🔴 en la lista; screenshot, build limpio, sin errores de consola, cómputo read-only | Inc 47 |

| R10 | **Deshacer en edición masiva**: snapshot de las especificaciones previas antes de cada bulk (permiso/recursos/cuadrilla) + botón "↶ Deshacer (N tarea(s) · acción)" que revierte estado + BD | C2 real: bulk Permiso ✓ a 2 tareas → BD=2 → "Deshacer" → BD=0 (revierte limpio, botón desaparece); build limpio, sin errores de consola, el propio undo limpia los datos de prueba | Inc 48 |

| R11 | **Fix robustez % completado** (Lista): el input usaba value+onChange (persistía en cada tecla → flood + race + borrar=0). Cambiado a defaultValue+key+onBlur con guard de vacío, consistente con el resto de la grilla | C2 real: tecleé 35 sin persistir, blur → seq 1 = 35 en BD (1 update); el flood se elimina por construcción (sin onChange); build limpio, sin errores de consola, dato restaurado a 0 | Inc 49 |
| R12 | **Fix choque-de-cuadrilla FALSO durante la espera**: la detección de choques usaba el span completo (inicio→fin), mientras el histograma de técnicos/hora ya usaba `tramosTrabajo` (solo trabajo real). Una tarea apertura/cierre (1h+espera+1h) bloqueaba a su cuadrilla toda la ventana → toda tarea del grupo en la espera se marcaba choque, aunque la cuadrilla está libre. Ahora compara tramos de trabajo real (helper `solapanTrabajo`, reusa `tramosTrabajo`) — una sola verdad por vista | C2 real: tareas marcadas como choque **77 → 65** (12 falsos positivos; a nivel de pares 79 → 55, 24 falsos); el badge en vivo "65 choque cuadrilla" coincide EXACTO con el recomputo en BD; build limpio, cero errores de consola, sin tocar datos | Inc 50 |

**Auditoría R12 (in-line, audit de DELTAS sobre datos reales):** verifiqué qué datos tiene C2 de verdad antes de elegir → línea/grupo(18)/sistema/fecha/duración ricos; **recursos=0, deps(bloqueado_por)=0, roster≈vacío** → los ítems de recursos/critical-chain/demanda-vs-inventario siguen NO demostrables con datos reales (descartados, no churn). El único problema real abundante en los datos (choques de cuadrilla) YA estaba detectado en Cuadrillas → no reinventé; en su lugar corregí el bug de falsos positivos en esa detección.
| R13 | **Factibilidad de cuadrilla en el control de Ruta crítica + 1 sola fuente de verdad**: extraje `choquesCuadrilla`/`solapanTrabajo` a resourceLeveling.ts (lógica de R12); Cuadrillas la consume (elimina loop duplicado, conteo idéntico) y Ruta crítica (vista de decisión del jefe) muestra banner rojo "N tareas con choque de cuadrilla — el plan aún no es ejecutable" + cómo resolverlo, o verde si está limpio. Antes el jefe era ciego a la infactibilidad | C2 real: banner 65 = badge Cuadrillas (65); filtro LINEA 1 → 31 = recálculo en BD (31); 158 barras sin ErrorBoundary; build EXIT=0, sin tocar datos | Inc 51 |

| R14 | **Guard de fechas inválidas en el Gantt** (fin ≤ inicio): audit de datos reales encontró 2 tareas con cronograma corrupto e invisible entre 158 (#100 span −20h; #98 span 0h con duración 11h) que corrompen barra/ruta crítica y se pierden en el histograma de técnicos/hora. Badge rojo "⛔ N con fecha inválida" + tooltip que nombra cada tarea; regla excluye hitos reales (dur 0, fin=inicio) | C2 real: badge "⛔ 2 con fecha inválida" nombra #98 y #100 = recálculo en BD; badge de ventana (R2) intacto; Cuadrillas 65 y 158 barras sin regresión; build EXIT=0, sin tocar datos | Inc 52 |

| R15 | **Balance de los 2 turnos en Cuadrillas** (Día vs Noche): objetivo central de la parada, pero ninguna vista mostraba el reparto (solo filtro D/N). Panel "🕑 Balance de los 2 turnos" con barras HH/actividades/% por turno, respeta filtro de línea + aviso cuando la noche <25% | C2 real: Día 2560 HH/86% vs Noche 415 HH/14% (= BD); LINEA 1 1263/81% vs 292/19% (= BD); aviso de noche infrautilizada visible; build EXIT=0, sin ErrorBoundary, sin tocar datos | Inc 53 |

---

## 🏁 RESUMEN EJECUTIVO — Loop multi-agente PRE-PARADA (DETENIDO en R15)

**Veredicto:** el backlog operativo PRE-PARADA *demostrable con los datos reales de C2* quedó agotado tras 15 mejoras. El loop se detiene por su propia regla de PARADA (no quedan huecos operativos relevantes que se puedan implementar Y verificar con evidencia) — antes que caer en churn.

**Qué se mejoró (15 incrementos, Inc 39→53, todos con build limpio + verificación en preview + round-trip contra BD, sin tocar seguridad):**
- **Planificación / ruta crítica:** plan vs ventana comprometida (R2), holgura LIBRE + tareas flexibles (R3), filtro de línea en ruta crítica = cada línea su propia ruta (R8), readiness ponderada por criticidad (R9), factibilidad de cuadrilla en la vista del jefe (R13).
- **Recursos / Compras:** export a Excel para Compras (R1), lead-time "qué pedir YA" (R4).
- **Cuadrillas / 2 turnos:** fix de choque-de-cuadrilla falso durante esperas (R12, 77→65), balance Día/Noche con aviso de turno infrautilizado (R15, 86/14).
- **Edición a escala:** edición masiva de permiso/recursos/cuadrilla (R5, R6), multi-filtro para aislar lotes (R7), deshacer del bulk (R10).
- **Integridad de datos:** blindaje de recurso malformado (R1), fix del input % que floodeaba (R11), guard de fechas inválidas fin≤inicio (R14).

**Hallazgos de valor encontrados auditando los datos reales:** 2 tareas con cronograma corrupto (#98, #100); 65 tareas con choque de cuadrilla (plan no ejecutable como está); turno noche al 14% (capacidad ociosa que alarga la parada); plan +26h sobre la ventana de 115h. Todos ahora VISIBLES para el planificador.

**Lo que queda y por qué NO se hizo (honesto):**
- **BLOQUEADO por datos vacíos en C2** (verificado por SQL): `recursos`=0/158, `bloqueado_por`(dependencias)=0/158, roster≈vacío. ⇒ demanda-vs-inventario, equipos-compartidos-en-Preparación, alquiler-vs-compra, critical-chain, personal-vs-demanda, multi-predecesora **no son huecos de código sino de carga de datos**. Cárgalos y se vuelven implementables.
- **Robustez de valor bajo o difícil de evidenciar:** rollback en nivelación masiva (real, pero sin forma limpia de probarlo en preview), resolver-choques tramo-aware (L, riesgoso), import colisión de secuencia, targets táctiles tablet.

**Para reanudar con valor:** carga recursos/herramientas por tarea (la RecursosModal de R4 ya existe) y el roster por cuadrilla; eso desbloquea la familia de mejoras de Compras/Logística y dotación. O pide explícitamente los ítems de robustez aunque su evidencia sea por código y no por screenshot.
