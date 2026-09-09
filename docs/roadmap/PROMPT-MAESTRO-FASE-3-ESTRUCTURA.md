# PROMPT MAESTRO — Ejecución de FASE 3 · Estructura
## `UXR-F3-M01` … `UXR-F3-M06` · Findings: CX-F02, CX-F06, CX-F07
## Gate: `docs/roadmap/UXR-F3-STRUCTURE-GATE.md`

> **Uso**: entregar íntegramente como prompt inicial a un agente IA con acceso de lectura/escritura
> al repositorio `anclora-shiftimport`, rama `development`.

---

## 0 · ROL Y MISIÓN

Eres un **ingeniero frontend senior**. Esta fase corrige **problemas de estructura**, no de detalle:
información operativa que existe pero no se alcanza (CX-F02), una capacidad que existe en el código
pero no tiene puerta de entrada (CX-F06), y dos vocabularios distintos para el mismo dominio
(CX-F07).

Las tres tienen la misma forma: **el producto ya sabe hacer la cosa; el usuario no puede llegar a
ella.** Por eso la corrección es de navegación y señalización, no de capacidades nuevas.

⚠️ **Esta es la fase con mayor riesgo de sobre-ingeniería.** La auditoría lo dice explícitamente:
*"no reinstaurar un segundo portal entero solo para recuperar una acción"* y *"consolidar
gradualmente sin perder capacidades"*. Si tu solución empieza a parecer una reestructuración de la
navegación, has ido demasiado lejos.

### Qué puedes tocar
✅ `src/components/shift-dashboard/StatsBar.tsx`,
`src/components/scheduling/AccessibleScheduleTable.tsx`,
**`src/components/scheduling/WeeklyPlanner.tsx`** (añadido — ver §2.1bis, es donde vive el overflow
real de CX-F02), `src/App.tsx` (wiring de navegación),
`src/components/shift-dashboard/ShiftModal.tsx`, `src/components/shift-dashboard/MembersModal.tsx`,
`src/index.css`, y **tests nuevos** (ver §2.1).

### Qué NO puedes tocar
❌ `api/`, `db/`, `vercel.json`, lógica de autorización o de scope.
❌ Producción, secretos, `git push`, despliegues.
❌ **`ShiftDetail.tsx` y `PortalShell.tsx` no se borran.** Siguen siendo código válido; simplemente
dejan de ser el único acceso a la acción de acuse.
❌ **No retires la ruta existente** Ajustes→Equipo→Abrir Usuarios (M05 *añade* una entrada, no
sustituye).

### Precondición
Fases 0, 1 y 2 cerradas — las tres en `PASS_WITH_GAPS`, ninguna en `PASS` limpio; ningún hueco suyo
bloquea el arranque de ésta. En particular:
- `UXR-F0-M07` (cuentas OWNER/PLANNER verificadas y pobladas) — **dependencia dura de M03**. Sigue
  vigente: `owner@e2e.test`, `planner@e2e.test`, `planner-no-area@e2e.test`,
  `planner-global@e2e.test` verificados en `qa/e2e-acceptance/local-setup.ts`.
- `UXR-F0-M08` (baseline de viewports) — M01 y M02 se miden contra ella.
- `UXR-F1-M04`, `UXR-F2-M05`, `UXR-F2-M06` — **dependencia dura de M05**: la acción masiva en Equipo
  sólo tiene sentido si la clasificación que muestra ya es correcta. Cerrado en Fase 2 con evidencia
  real (`classify-user-row.test.ts`, 4 casos de la auditoría + regresión).
- El arrastre de etiquetas por fecha (§2.0.1 del prompt de Fase 2) **ya está resuelto** — Fase 2 lo
  cerró en `ImportModal.tsx` (`rowLabelByDate`/`rowLabelByOrdinal`). No es trabajo tuyo, no lo repitas.

---

## 1 · ENTRADAS OBLIGATORIAS

| # | Ruta | Uso |
|---|------|-----|
| 1 | `AGENTS.md` (raíz) | Convenciones |
| 2 | `sdd/features/ux-remediation-codex-2026-09/03_IMPLEMENTATION_PLAN.md` **líneas 953–1272** | Las 6 microtareas literales |
| 3 | `docs/roadmap/UXR-F3-STRUCTURE-GATE.md` | AC exactos |
| 4 | `sdd/decisions/ADR-2026-09-07-P5.7-team-roles-scopes.md` | Roles y scopes vigentes (M03, M05) |
| 5 | `sdd/decisions/PD-2026-09-06-D05-planner-scope-without-area.md` | PLANNER sin área (M01, M02) |
| 6 | `docs/roadmap/P5.7-M04-SIDEBAR-SHELL-GATE.md` y `P5.1-SHELL-NAVIGATION-INVENTORY.md` | Cómo está construida la navegación hoy (M05) |
| 7 | `docs/standards/ANCLORA_PREMIUM_APP_CONTRACT.md` | Densidad y jerarquía (M01, M02) |

---

## 2 · ESTADO REAL DEL REPO — CORRECCIONES A LA SPEC

### 2.1 ⚠️ Dos tests que la spec da por existentes **no existen**
La evidencia requerida de `UXR-F3-M01` cita `npm test (StatsBar.test.tsx)` y la de `UXR-F3-M02` cita
`AccessibleScheduleTable.test.tsx`. **Ninguno de los dos está en el repo.** Verificado:

```
src/components/shift-dashboard/StatsBar.tsx          ← existe (178 líneas), SIN test
src/components/scheduling/AccessibleScheduleTable.tsx ← existe (123 líneas), SIN test
src/components/scheduling/WeeklyPlanner.test.tsx      ← este sí existe
```

→ **Crear ambos ficheros de test es parte del trabajo de esta fase**, no un extra. Sin ellos no
puedes cerrar los AC. Usa `WeeklyPlanner.test.tsx` como patrón de estilo para el de scheduling.

### 2.2 CX-F06 — confirmado: la acción está huérfana
Verificado en el código:
- `src/App.tsx:2121` monta **`<ShiftModal ... />`** — ése es el detalle de turno activo.
- `src/App.tsx` **no importa `PortalShell` ni `ShiftDetail`** (grep sin resultados). Confirma el
  finding: el shell productivo no alcanza la capacidad.
- `src/components/employee-portal/ShiftDetail.tsx:3` importa `acknowledgeRemoteShift` desde
  `../../lib/remote`; la llamada está en la línea ~57, con estados `'saving'` y actualización de
  `acknowledgementStatus` / `acknowledgedAt`.
- `src/lib/remote.ts` es el módulo real (fichero, no directorio).
- `ShiftModal.test.tsx` **sí existe** — amplíalo para M03/M04.

→ El trabajo es **portar la llamada** al punto de montaje activo, reutilizando el patrón de estados
que `ShiftDetail.tsx` ya implementa. No reescribas la lógica de acuse: cópiala con criterio.

### 2.3 ⚠️ CX-F02 — la spec apunta al fichero equivocado para el overflow real del planificador

**Esto es una corrección de alcance, no un detalle.** `03_IMPLEMENTATION_PLAN.md` lista
`AccessibleScheduleTable.tsx` como el fichero a tocar para "indicador de overflow + scroll nombrado
por teclado" (M02). Verificado en el código: **`AccessibleScheduleTable` no es un fallback de
accesibilidad oculto — es una vista alternativa seleccionable por el usuario**
(`WeeklyPlanner.tsx:627`, `view === 'table'`), separada de la vista de rejilla por defecto
(`view !== 'table'`, líneas 648+: `<div ref={gridWrapRef} className="weekly-planner__grid-wrap"
role="region" aria-label={...} tabIndex={0}><table className="weekly-planner__grid">...`).

El desbordamiento horizontal que la auditoría midió (E021, "el planner deja horario fuera de
viewport") ocurre en **`weekly-planner__grid-wrap`, dentro de `WeeklyPlanner.tsx`** — un contenedor
distinto de `AccessibleScheduleTable.tsx`. Si sólo tocas `AccessibleScheduleTable.tsx`, el fix no
llega al sitio donde el usuario ve el problema en la vista por defecto.

**Además, verifica antes de escribir código nuevo — puede que ya esté parcialmente hecho:**
- `weekly-planner__grid-wrap` **ya tiene** `role="region"`, `aria-label={t('planner.gridLabel')}` y
  `tabIndex={0}` (`WeeklyPlanner.tsx:648`) — el nombrado ARIA del AC-2 puede que ya esté cubierto;
  verifícalo con axe y teclado real antes de reescribirlo.
- `src/index.css:3997-4015` define un degradado `::after` (`.weekly-planner__grid-wrap::after`,
  `.weekly-planner__table-wrap::after`) que ya pasa a `opacity: 1` bajo `@media (max-width: 980px)`
  (línea ~4388) — es decir, **ya existe una indicación visual persistente y sin hover** por debajo de
  980px. Antes de dar por hecho que hay que construirla desde cero, mide contra el AC-1 literal
  (*"la interfaz indica cómo alcanzar los siete días"*) si ese degradado estático basta, o si necesita
  reforzarse (por ejemplo, porque se muestra siempre en ese rango sin comprobar si realmente hay
  overflow, o porque un degradado sin texto es una señal débil comparada con lo que pide la
  auditoría). Documenta la decisión con la medición, no la supongas.

`AccessibleScheduleTable.tsx` sigue siendo territorio tuyo — **por el DO_NOT_BREAK** ("Tabla
alternativa accesible", §4.4), no porque sea la fuente del bug de overflow. Un commit reciente y
ajeno a esta fase (`3eabe9b`, colores canónicos de tipo de turno) tocó ese fichero: léelo de cero, no
confíes en tu memoria de la spec original.

**Ficheros previstos reales para M01/M02**: `StatsBar.tsx`, `AccessibleScheduleTable.tsx`,
**`WeeklyPlanner.tsx`**, `src/index.css`.

### 2.3bis El precedente de scroll interno ya está resuelto en el repo
`P5.7-M09-PREMIUM-UX-A11Y-GATE.md` documenta cómo se resolvió el mismo problema en `EquipoModal`:
scroll estrictamente contenido, sin doble scrollbar, tabs con `overflow-x: auto` y
`white-space: nowrap` en móvil, y ARIA (`role="tablist"`, `aria-label` en filtros). **Es el patrón de
la casa.** Léelo antes de diseñar el indicador de overflow.

### 2.4 CX-F07 — la ruta legacy y la nueva coexisten por diseño
`MembersModal.tsx` **ya no tiene 1897 líneas — tiene 1840** tras la extracción de Fase 2
(`classifyUserRow` salió a `src/lib/classify-user-row.ts`). Es la herramienta de provisioning con
preview; "Equipo" es el workspace nuevo con Personas/Roles/Áreas/Asignaciones. La auditoría **no pide
fusionarlos**: pide que la acción masiva sea *descubrible* desde Equipo. `MembersModal.test.tsx`
existe y ya cubre los casos de Fase 2 — no dupliques esa cobertura, añade sólo lo de M05/M06.

### 2.5 Oportunidad menor, no bloqueante: `import-preview` sigue marcada inestable
`qa/e2e-acceptance/compare-baseline-runs.mjs` sigue declarando la pantalla `import-preview` en
`DECLARED_UNSTABLE_SCREENS` por el layout sub-píxel que Fase 2 corrigió. Verificado de forma
independiente tras ese fix: doble corrida con `0 UNSTABLE`, el residuo que antes era una línea de 1px
(`maxDelta 43`, el defecto sistémico) bajó a `maxDelta 1` (ruido normal). **No es tu alcance
retirarlo** (no toca CX-F02/F06/F07), pero si generas evidencia visual nueva de esa pantalla para otra
cosa, ya sabes que la inestabilidad declarada probablemente ya no aplica.

---

## 3 · ORDEN DE EJECUCIÓN

```
Cadena A — CX-F02 (responsive; independiente)
  UXR-F3-M01  métrica total legible en StatsBar        + crear StatsBar.test.tsx
  UXR-F3-M02  indicador de overflow + scroll nombrado  + crear AccessibleScheduleTable.test.tsx

Cadena B — CX-F06 (la de mayor riesgo de alcance)
  UXR-F3-M03  conectar acuse al detalle activo
  UXR-F3-M04  fallo y reintento sin duplicar acción

Cadena C — CX-F07
  UXR-F3-M05  acción masiva explícita en Equipo
  UXR-F3-M06  conservar contexto al volver de la preview
```

**Empieza por la Cadena A**: es medible contra la baseline de Fase 0 y no toca autorización.
**La Cadena B al final** — es la única que roza el modelo de permisos y necesita el ciclo sintético
completo con cuentas de `UXR-F0-M07`.

---

## 4 · LOS PUNTOS DIFÍCILES

### 4.1 `UXR-F3-M03` — aquí es donde se rompe la seguridad si te descuidas
Vas a exponer una acción de escritura (`acknowledgeRemoteShift`) en un componente que hoy no la
tiene. **Tres condiciones no negociables**, y las tres deben estar cubiertas por test:

1. **Scope SELF** — sólo el EMPLOYEE dueño del turno, viendo su propio calendario. Un ADMIN mirando
   el turno de otra persona **no** ve la acción.
2. **Publicado, no borrador** — el AC-3 lo dice: *"Given borrador no publicado, When Employee
   consulta, Then no se expone como turno operativo."* Un borrador no se acusa porque no existe
   todavía para el empleado.
3. **No editar planificación con acuse** — acusar recibo no es editar. La acción no puede abrir
   ningún camino de modificación del turno.

⚠️ **La regla de alcance de la auditoría**: *"no reinstaurar un segundo portal entero solo para
recuperar una acción"*. Si tu solución empieza a montar `PortalShell` dentro de `App.tsx`, párate.

### 4.2 `UXR-F3-M04` — el AC es "sin duplicar acción"
Al fallar el acuse (red caída, sesión expirada) hay tres cosas que verificar, y la tercera es la que
se olvida:
- El turno queda **intacto** (no se pierde, no cambia de estado).
- El estado de fallo es **visible** y el reintento es **explícito**.
- **Un reintento concurrente no dispara dos llamadas.** Deshabilita el botón mientras `'saving'`.
  `ShiftDetail.tsx` ya tiene ese estado; reutiliza el patrón.

Simula el fallo en el test — no confíes en reproducirlo a mano.

### 4.3 `UXR-F3-M01` — "sin desplazamiento horizontal" con "métricas desktop" intactas
La tensión está en el DO_NOT_BREAK: la densidad de escritorio se conserva. Métricas de ~1135 px en un
viewport de 390 px no caben; wrap o carrusel-con-indicador son las salidas. **Lo que no vale** es
esconder métricas en móvil: la auditoría pide que el *total principal* sea legible sin scroll, no que
desaparezca el resto.

### 4.4 `UXR-F3-M02` — "indicación persistente" significa sin hover, y hay dos vistas que medir
El AC-1 pide que la interfaz *indique cómo alcanzar los siete días*. Una scrollbar que sólo aparece al
pasar el ratón no cumple: en táctil no hay hover. Y el AC-2 exige que **el teclado** alcance horario y
acciones sin mover la página entera — eso es `tabindex` en el contenedor de scroll más un
`aria-label`/`role` que lo nombre. Verifica con Axe y con recorrido de teclado real.

**Mide las dos vistas por separado** (§2.3): la vista de rejilla por defecto
(`weekly-planner__grid-wrap`, donde probablemente ya tengas la mayor parte del ARIA hecho y sólo
tengas que reforzar o confirmar el indicador visual) y la vista de tabla (`AccessibleScheduleTable`,
donde el DO_NOT_BREAK exige conservarla y mejorarla, no sustituirla por una vista de agenda que
elimine la tabla). Un AC cumplido en una vista y no verificado en la otra no es un AC cumplido.

### 4.5 `UXR-F3-M06` — el contexto es pestaña + filtro + posición
> *"Given vuelta desde preview, When cancela, Then conserva pestaña/filtro/contexto de personas."*

Son tres cosas, no una. Entra a bulk desde un tab concreto **con un filtro aplicado**, cancela, y
verifica que vuelves al mismo tab con el mismo filtro. Es el caso que más fácilmente se implementa a
medias.

---

## 5 · GATE — CÓMO CERRARLO

Actualiza `docs/roadmap/UXR-F3-STRUCTURE-GATE.md`:

1. **§3.1** — AC de las 6 microtareas con artefacto cada uno.
2. **§3.2 No regresión** — las 12 entradas DO_NOT_BREAK de esta fase:
   - CX-F02: siete días y detalle completo · tabla alternativa accesible · contexto de empleado ·
     métricas desktop.
   - CX-F06: scope SELF · publicado frente a borrador · solicitudes existentes · no editar
     planificación con acuse.
   - CX-F07: separación acceso/ficha · opciones de scope · preview de errores · credenciales de un
     solo uso.
3. **§3.3** — `npm test && npx tsc --noEmit && npm run lint && npm run build`, antes y después.
   Los dos tests nuevos (§2.1) deben aparecer en la salida.
4. **§3.4 Matriz visual**:
   - M01: 390×844, 430×932 × {claro, oscuro} de `StatsBar` **con datos poblados** (no vacío).
   - M02: 390×844, 768×1024 × {claro, oscuro} **de ambas vistas** (rejilla `weekly-planner__grid-wrap`
     y tabla `AccessibleScheduleTable`) con el indicador de overflow visible, y `hide-scrollbars=false`.
   - M03: 1440×900 y 390×844 × {claro, oscuro} del detalle con la acción de acuse.
   - M05: 1440×900 × {claro, oscuro} del workspace Equipo con la acción masiva visible.
5. **§3.5 Accesibilidad** — Axe sin violaciones nuevas y **recorrido de teclado completo** de la tabla
   semanal en 390 px y 768 px, con cuentas PLANNER y EMPLOYEE.
6. **Ciclo sintético** — el gate exige `publicar → consultar → acuse → solicitar → resolver` con las
   cuatro cuentas. Ejecútalo con datos sintéticos aislados y **autorización explícita para las
   mutaciones**. Si no obtienes esa autorización, declara `NOT_EVALUATED` con motivo; no lo simules
   ni lo des por hecho.
7. **§5** — `PASS` sólo con las 6 cerradas; cualquier hueco → `PASS_WITH_GAPS`.

---

## 6 · REGLAS DE INTEGRIDAD

- **Exponer una acción no es concederla.** La autorización la sigue decidiendo el servidor; el cliente
  sólo decide qué muestra. Si tu cambio hace visible algo que el servidor rechazaría, has creado un
  falso permiso.
- **Consolidar sin perder capacidades**: M05 añade una entrada, no elimina la existente.
- **No borres `ShiftDetail.tsx` ni `PortalShell.tsx`.**
- Mutaciones sólo con datos sintéticos aislados y autorización específica. Comprueba que **turnos
  manuales e imports ajenos sobreviven**.
- Si encuentras defectos fuera de CX-F02/F06/F07, **documéntalos, no los arregles**.
- Si una instrucción contradice `AGENTS.md`, un ADR o un contrato de `docs/standards/`, **detente y
  reporta la ambigüedad**.

---

## 7 · ENTREGA

1. Cambios acotados a los ficheros de §0, **incluidos los dos ficheros de test nuevos**.
2. Gate actualizado con evidencia real y con el resultado del ciclo sintético completo.
3. `05_PROGRESS_LOG.md` y `03_IMPLEMENTATION_PLAN.md` sincronizados (y corregida la referencia a los
   tests que no existían, §2.1).
4. **Sin commit ni push** salvo autorización explícita. Reporta `git status` al final.
5. Resumen de **máximo 20 líneas**: estado por microtarea, gate resultante, si el ciclo
   `publicar→acuse→solicitar→resolver` se ejecutó o quedó `NOT_EVALUATED`, y qué desbloquea para la
   Fase 4 (`UXR-F4-M05`, `M08`, `M10`).

**Nota**: Fase 3 no es la última fase de la spec — le sigue **Fase 4 · Cierre de evidencia**
(históricos F1/F2/F5/F6/F8/F9 y los 10 flags de cobertura en `false`), con su propio prompt
(`PROMPT-MAESTRO-FASE-4-CIERRE-EVIDENCIA.md`). No cierres el `UXR-MASTER-GATE.md` desde aquí.
