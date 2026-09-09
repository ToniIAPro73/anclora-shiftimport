# UX Remediation Codex 2026-09 — Technical Design

Diseño por finding: causa raíz medida, cambio propuesto a nivel de arquitectura de componente,
superficies y componentes tocados. El detalle paso a paso vive en `03_IMPLEMENTATION_PLAN.md`; este
documento fija el **por qué** técnico y las restricciones de diseño que las microtareas heredan.

## Verificación de anclajes (hecha antes de escribir esta spec)

Todos los ficheros citados por los 10 findings fueron leídos contra el HEAD actual del repo:

| Fichero | Líneas totales | Anclaje citado verificado |
|---|---|---|
| `src/components/shift-dashboard/ImportModal.tsx` | 1806 | Sí — `readyShifts`/`temporalSummary` en torno a la línea 1735 |
| `src/index.css` | 6811 | Sí (fichero global de estilos, sin anclaje de línea específico en el JSON) |
| `src/components/shift-dashboard/StatsBar.tsx` | 178 | Sí |
| `src/components/scheduling/AccessibleScheduleTable.tsx` | 123 | Sí |
| `src/lib/import-temporal.ts` | 22 | Sí — `splitImportByOperationalDate` es la única función exportada |
| `src/components/shift-dashboard/MembersModal.tsx` | 1897 | Sí — `classifyUserRow` (línea 125) y el conteo del resumen (línea 999) |
| `src/lib/bulk-import-csv.ts` | 99 | Sí — `columnIndex(table.headers, 'external_employee_id')` (líneas 38 y 81) |
| `src/App.tsx` | 2569 | Sí — importa y monta `ShiftModal` (línea 2121); **no** importa `PortalShell` ni `ShiftDetail` |
| `src/components/employee-portal/PortalShell.tsx` | 132 | Sí — único punto que monta `ShiftDetail` (línea 108) |
| `src/components/employee-portal/ShiftDetail.tsx` | 196 | Sí — `acknowledgeRemoteShift` importado y usado (líneas 3, 57) |
| `index.html` | 14 | Sí — línea 2 es literalmente `<html lang="es">` |
| `src/lib/use-i18n.ts` | 10 | Sí — no toca `document.documentElement.lang` |
| `src/lib/plans.ts` | 106 | Sí — `priceHypothesis` hardcodeado en español (líneas 48, 57, 66) |
| `src/pages/PricingPage.tsx` | 125 | Sí — renderiza `plan.priceHypothesis` sin transformación (línea 47) |
| `test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv` | 46 | Sí — cabecera `name,externalEmployeeId,area,areaCode,status` (camelCase) |

---

## CX-F01 · La revisión de turnos desaparece en móvil

**Causa raíz (medida)**: altura de workspace fija repartida entre uploader, formulario y resúmenes
que no ceden espacio tras el parse. A 390×844 y 844×390 hay cinco filas en el DOM pero su lista de
lista mide 0px porque el panel padre recorta el contenido; a 768px los campos quedan estrechos.

**Diseño de la corrección**: dos ejes independientes, cada uno revisable por separado:

1. **Compactación post-parse** (`UXR-F2-M01`): tras terminar el parse, el bloque de
   archivo/identidad (hoy fijo y expandido) pasa a un resumen colapsable. El espacio liberado se
   asigna con prioridad al contenedor de revisión de filas (`min-height` positivo garantizado, nunca
   0px, con `overflow-y: auto` propio cuando el contenido no cabe). Esto es una redistribución de
   `flex`/`grid` dentro de `ImportModal.tsx` y `src/index.css`, sin tocar el modelo de datos de
   `readyShifts`.
2. **Adaptación de fila para lectura móvil** (`UXR-F2-M02`): por debajo de un breakpoint (a definir
   contra los 8 viewports de la matriz de Fase 0, candidato `768px`), cada fila de revisión cambia de
   layout de tabla a layout de tarjeta apilada (fecha/hora/empleado/acciones en bloque vertical en
   vez de columnas), conservando los mismos controles editables y la papelera por fila.

**Restricción de diseño heredada de `MODAL_CONTRACT.md`**: la primera estrategia es reorganizar
layout y ampliar superficie útil, no introducir scroll de modal completo; si un bloque concreto (la
lista de filas) crece demasiado, el scroll vive en ese bloque, no en el modal entero. Esto es
literalmente lo que pide `recommended_change` del finding.

**Qué no cambia**: el modelo de datos de `readyShifts`/`importDiff`/`temporalSummary`, la lógica de
edición/borrado por fila, el cierre del modal (Escape, foco), la ausencia de escritura antes de
confirmar.

## CX-F02 · Calendario, métricas y tabla semanal dependen de scroll horizontal poco evidente

**Causa raíz (medida)**: densidad de escritorio mantenida en varios contenedores independientes
(`StatsBar.tsx` ~1135px, `AccessibleScheduleTable.tsx` ~780px) que no colapsan ni señalizan overflow
en viewports móviles.

**Diseño de la corrección**: dos contenedores, dos microtareas independientes:

1. **`StatsBar.tsx`** (`UXR-F3-M01`): la métrica total/principal debe ser legible sin desplazamiento
   horizontal en 390px — layout responsivo (wrap o carrusel con indicador) en vez de fila fija.
2. **`AccessibleScheduleTable.tsx`** (`UXR-F3-M02`): mantener la tabla semanal accesible-por-teclado
   existente (no sustituirla), pero añadir indicación persistente de que hay más columnas fuera de
   viewport (no depender de que el usuario descubra el scroll por ensayo) y verificar que el scroll
   interno de la tabla está nombrado (`aria-label`/`role` ya presente, a confirmar) para no requerir
   mover toda la página horizontalmente.

**Convergencia con histórico F6**: la brecha de tabla semanal (`E023`) es el mismo síntoma que
`CX-F02`; `UXR-F3-M02` cierra ambos, con verificación explícita en Fase 4 (`UXR-F4-M05`).

## CX-F03 · Campos y papeleras de preview sin nombre accesible por fila

**Causa raíz (medida)**: las cabeceras visuales de la tabla de preview no se vinculan como nombres
programáticos de cada control de fila (axe + inspección DOM detectan 4 papeleras sin nombre y campos
sin `label` asociado).

**Diseño de la corrección** (`UXR-F1-M01`, quick win): nombrar cada control con
fecha/empleado o índice estable (`aria-label` contextual, ej. "Eliminar turno de {empleado} del
{fecha}"), asociar cabeceras de columna a inputs vía `aria-describedby`/`<label>` explícito, y
anunciar el nuevo conteo de filas tras un borrado (región `aria-live` ya usada en otras partes del
modal, a confirmar patrón existente). Sin texto visual repetitivo — el nombre es programático, no
una etiqueta visible añadida que rompa la densidad de la fila.

## CX-F04 · El resumen temporal anuncia borradores que la opción efectiva excluye

**Causa raíz (medida)**: el badge muestra el conteo de fechas futuras detectadas como si fueran a
convertirse en borrador, antes de aplicar la decisión de rol/consentimiento. Un EMPLOYEE con filas
futuras ve "N futuros → borrador" aunque su rol excluye la creación de planificación futura
(`D-P5.5-05`).

**Diseño de la corrección**: separar "detectado" de "incluido" de "excluido", dos capas:

1. **Lógica** (`UXR-F2-M03`): `src/lib/import-temporal.ts` hoy sólo expone
   `splitImportByOperationalDate` (histórico/futuro por fecha). Se añade una función que, dado el
   split temporal más el rol/decisión efectiva (`identityLocked`, consentimiento de borrador), derive
   `{ detected, includedAsDraft, excludedByRole }` — pura, sin efectos secundarios, testable en
   aislamiento.
2. **UI** (`UXR-F2-M04`): `ImportModal.tsx` (entorno de la línea 1735, bloque `temporalSummary`)
   consume la nueva derivación en vez de mostrar directamente el conteo de futuros detectados; usa
   futuro condicional ("se crearían N borradores" en vez de "N borradores") antes de que el usuario
   confirme la decisión.

**Restricción heredada de `PD-2026-09-06-P5.5-future-import-draft-scheduling.md`**: esta corrección
es puramente de presentación del conteo — no toca `D-P5.5-01`..`D-P5.5-05`; en particular no cambia
qué filas se excluyen ni introduce publicación automática.

**Convergencia con histórico F8**: "destino efectivo impreciso" es el mismo síntoma; `UXR-F2-M04`
cierra ambos, con verificación en Fase 4 (`UXR-F4-M06`).

## CX-F05 · La preview de provisioning clasifica mal nuevos usuarios e IDs repetidos

**Causa raíz (medida, verificada línea a línea)**: dos bugs distintos en el mismo flujo:

1. `classifyUserRow` (`MembersModal.tsx:172`) devuelve `status: 'no_employee'` para un email nuevo
   sin `externalEmployeeId` y sin `existingMember` — es decir, un usuario genuinamente nuevo sin
   ficha vinculada. El resumen (`MembersModal.tsx:999`) cuenta `no_employee` dentro de `existing`
   (junto a `existing_and_link`/`already_linked`), mostrando "ya miembro" para alguien que no lo es.
2. `classifyUserRow` resuelve `employee` por `externalEmployeeId` contra la lista `employees` ya
   persistida (línea 144), pero no compara la fila actual contra las filas **ya procesadas del mismo
   fichero** en esta pasada — así, dos filas con el mismo `externalEmployeeId` nuevo se clasifican
   ambas como `new_and_link` de forma independiente, sin detectar el conflicto intra-fichero.

**Diseño de la corrección**:

1. **Lógica de clasificación** (`UXR-F2-M05`, toca `bulk-import-csv.ts` + la función
   `classifyUserRow` en `MembersModal.tsx`): separar el estado "existencia de cuenta" del estado
   "vínculo a empleado" como dos ejes explícitos en el tipo de resultado; añadir seguimiento de
   `externalEmployeeId` ya vistos en la pasada actual (análogo al `seenEmails` que ya existe en la
   línea 140) para detectar duplicado intra-fichero y devolver un status dedicado con referencia a la
   primera fila.
2. **UI de preview** (`UXR-F2-M06`): el resumen de conteos (línea 999) se recalcula sobre los nuevos
   ejes — "nuevos sin vínculo", "existentes", "duplicados/conflicto" — de forma que la suma de
   categorías coincida exactamente con el total y con lo que la confirmación va a ejecutar.

**Restricción heredada**: no se toca la revalidación server-side (el finding es puramente de
preview/UX; el backend ya re-valida independientemente, ver `AGENTS.md` §Reglas para cambios). No se
crea un `Employee` al importar un `User` (regla `do_not_break` del finding).

**Dependencia dura declarada por la auditoría**: `CX-F05` no se puede validar por la ruta de usuario
real sin `CX-E01` resuelto primero (el fixture de prueba debe ser cargable). Ver `UXR-F1-M04`.

## CX-F06 · El acuse de turno no tiene entrada en el shell Employee activo

**Causa raíz (medida por código, `MEASURED_CODE`, sin evidencia de navegador —
`browser_environment: UNKNOWN`)**: `ShiftDetail.tsx` implementa `acknowledgeRemoteShift` (importado
de `src/lib/remote`), pero el único punto que monta `ShiftDetail` es `PortalShell.tsx` (línea 108),
y `PortalShell` no está en el árbol que `App.tsx` monta — `App.tsx` importa y usa `ShiftModal` (línea
2121) como el detalle de turno del calendario activo. La migración al shell común dejó la capacidad
de recepción fuera de la navegación alcanzable.

**Diseño de la corrección** (respetando "no reinstaurar un segundo portal completo" — regla de
alcance §4.3 de `00_PRODUCT_SPEC.md`):

1. **Conexión de la acción** (`UXR-F3-M03`): el detalle de turno que el shell activo ya usa
   (`ShiftModal`, montado desde `App.tsx`) gana la capacidad de acuse cuando el turno pertenece al
   EMPLOYEE visualizando su propio calendario (`scope SELF`) y está publicado (no borrador). Esto es
   portar la llamada a `acknowledgeRemoteShift` desde `ShiftDetail.tsx` al punto de montaje activo, no
   reescribir `PortalShell`. `ShiftDetail.tsx`/`PortalShell.tsx` no se eliminan (siguen siendo
   código válido, simplemente no son el único punto de acceso).
2. **Estado de fallo y reintento** (`UXR-F3-M04`): si el acuse falla (red, sesión), el turno se
   conserva, se muestra el estado sin duplicar la acción (no doble-envío), y se permite reintentar.

**DO_NOT_BREAK específico**: scope SELF (nunca el Employee ve turnos ajenos), distinción
publicado/borrador (nunca se expone un borrador como turno operativo acusable), solicitudes de
cambio existentes no se duplican con esta acción, no se habilita edición de planificación desde el
acuse.

## CX-F07 · Provisioning se descubre en un segundo workspace de gestión

**Causa raíz (medida)**: el alta individual vive en "Equipo" (Personas/Roles/Áreas/Asignaciones,
`App.tsx` + tabs de `MembersModal.tsx`) mientras la importación masiva CSV se descubre en
Ajustes→Equipo→Abrir Usuarios — dos vocabularios y rutas de entrada distintas para el mismo dominio.

**Diseño de la corrección**:

1. **Entrada explícita** (`UXR-F3-M05`): añadir una acción masiva explícita y visible dentro del
   workspace "Equipo" (mismo componente/tab donde ya vive el alta individual), sin retirar la ruta
   existente vía Ajustes (evita regresión de descubribilidad para quien ya la conoce).
2. **Persistencia de contexto** (`UXR-F3-M06`): al cancelar desde la preview de importación masiva y
   volver a "Equipo", se conserva la pestaña/filtro/contexto de personas activo antes de entrar al
   flujo de importación.

**DO_NOT_BREAK específico**: separación acceso/ficha (User≠Employee sigue siendo dos conceptos
distintos en la UI), opciones de scope de Planner intactas, preview de errores por fila intacta,
credenciales de un solo uso (si el flujo las genera) sin cambio de comportamiento.

## CX-F08 · La interfaz EN mantiene el idioma del documento en español

**Causa raíz (medida, confirmada en `index.html:2` — literalmente `<html lang="es">` — y en
producción)**: `document.documentElement.lang` permanece `es` de forma estática (fijado en el HTML
base) mientras el locale visual cambia vía `I18nContext`/`useI18n` (`src/lib/use-i18n.ts`, que no
toca el DOM raíz — sólo expone el contexto de traducción).

**Diseño de la corrección** (`UXR-F1-M02`, quick win): al cambiar de locale, sincronizar
`document.documentElement.lang` con el locale efectivo (probablemente en el proveedor de
`I18nContext`, punto de entrada único de todos los cambios de locale — confirmar el fichero exacto
del provider durante la implementación, ya que `use-i18n.ts` es sólo el hook consumidor). Debe
conservar el valor inicial coherente en carga fría y sobrevivir recarga.

**Restricción heredada de `LOCALIZATION_CONTRACT.md`** (aplicada como restricción de diseño, ver
§4.4 de `00_PRODUCT_SPEC.md`): no mezclar idiomas en una misma vista.

## CX-F09 · Pricing EN mezcla unidades y texto español

**Causa raíz (medida, confirmada en `plans.ts:48,57,66`)**: `priceHypothesis` es un string
hardcodeado en español (`'4,99 €/mes'`, `'Desde 19 €/mes'`) usado tal cual por
`PricingPage.tsx:47` (`{plan.priceHypothesis}`) sin pasar por la capa de traducción; en EN, un sufijo
`/mo` añadido en otro punto se concatena sobre el string español ya completo, produciendo
`"4,99 €/mes/mo"`.

**Diseño de la corrección** (`UXR-F1-M03`, quick win): separar `priceHypothesis` en campos
estructurados — importe, moneda, intervalo, y el prefijo "Desde" como flag booleano — y renderizar
cada campo a través de la capa de i18n existente en `PricingPage.tsx`, de forma que EN nunca
concatene un sufijo sobre un string ya localizado. La terminología de comparación de roles (donde
aparezca "Manager" residual) se alinea con "Planner" vigente (`ADR-2026-09-07-P5.7-team-roles-scopes.md`).

**DO_NOT_BREAK específico**: distinción Free/Personal/Team intacta; el importe numérico (`4,99`,
`19`) no cambia — sólo su composición/presentación (regla de alcance §4.3).

## CX-E01 · Fixture sintética de empleados incompatible con el header del parser

**Causa raíz (medida, confirmada por diff exacto)**: el fixture
`test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv` usa cabecera
`name,externalEmployeeId,area,areaCode,status` (camelCase); `bulk-import-csv.ts` busca literalmente
la columna `external_employee_id` (snake_case) vía `columnIndex(table.headers,
'external_employee_id')` en las líneas 38 y 81. El fixture nunca puede alcanzar preview por la UI
real de importación masiva de empleados.

**Diseño de la corrección** (`UXR-F1-M04`, quick win, **dependencia dura de Fase 2**): renombrar la
cabecera del fixture a `external_employee_id` (alinear el dato, no el parser — el parser define el
contrato de producto real que un ADMIN real usaría) y añadir una prueba contractual que falle si el
header del fixture y el header esperado por el parser vuelven a divergir.

**DO_NOT_BREAK específico**: el fixture sigue siendo sintético (sin datos reales); los casos de
incidencia deliberados que el escenario ya contenga (filas inválidas, duplicados, etc., si existen)
se preservan.
