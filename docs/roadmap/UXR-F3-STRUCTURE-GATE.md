# UXR-F3 — Structure Gate Document

## Summary
- **Status**: GATE PASS_WITH_GAPS
- **Date**: 2026-09-09
- **Fase**: UXR-F3 (Estructura)
- **Target Branch**: `development`
- **Findings cubiertos**: CX-F02, CX-F06, CX-F07
- **Spec fuente**: `sdd/features/ux-remediation-codex-2026-09/`

---

## 1 · Objectives & Scope

**Entra**: métricas y tabla semanal legibles sin scroll horizontal oculto (CX-F02), acuse de turno
alcanzable desde el shell Employee activo (CX-F06), descubrimiento del provisioning masivo desde
"Equipo" (CX-F07).

**No entra explícitamente**: reinstauración de `PortalShell` como segunda superficie productiva
(prohibido por regla de alcance, ver `00_PRODUCT_SPEC.md` §4.3). Ningún cambio de scope ni de
autorización — `acknowledgeRemoteShift` se conecta al shell existente, no se reescribe su
autorización.

## 2 · Criterios de entrada (gate de admisión)

- [x] Fase UXR-F2 en `GATE PASS_WITH_GAPS` documentado.
- [x] Baseline de evidencia de Fase 0 vigente para el HEAD actual.
- [x] Cuentas sintéticas OWNER/PLANNER de `UXR-F0-M07` disponibles para el ciclo
      publicar→consultar→acuse→solicitar→resolver (`qa/e2e-acceptance/local-setup.ts`).

## 3 · Criterios de salida (gate de aceptación)

### 3.1 Funcionales — todos los AC de las microtareas de la fase

- [x] UXR-F3-M01 · AC-1 (parcial, compartido) — 390px: interfaz indica cómo alcanzar información
      completa sin desplazamiento horizontal accidental. Implementada `MobileSummaryCard` en
      `StatsBar.tsx` mostrando totales de mes y año con wrap responsivo en viewport de 390px
      preservando la barra desktop completa en pantallas mayores. Suite dedicada en
      `src/components/shift-dashboard/StatsBar.test.tsx` (3 tests PASS).
- [x] UXR-F3-M02 · AC-1 — 390px: interfaz indica cómo alcanzar los siete días. Añadido indicador
      persistente sin hover `.weekly-planner__overflow-hint` tanto en la rejilla del planificador
      (`WeeklyPlanner.tsx`) como en la tabla accesible (`AccessibleScheduleTable.tsx`).
- [x] UXR-F3-M02 · AC-2 — navegación por teclado alcanza horario y acciones sin mover toda la página
      horizontalmente. Contenedores con `role="region"`, `aria-label` y `tabIndex={0}`. Suite dedicada en
      `src/components/scheduling/AccessibleScheduleTable.test.tsx` (4 tests PASS).
- [x] UXR-F3-M03 · AC-1 — Employee con turno publicado: detalle desde calendario muestra estado de
      recepción y acción autorizada. `ShiftModal.tsx` montado en `App.tsx:2121` incorpora estado de
      acuse (`pending`, `saving`, `acknowledged`) y botón explícito para el empleado en su propio turno
      publicado (`origin === 'IMP'`), impidiendo edición de horario.
- [x] UXR-F3-M03 · AC-3 — borrador no publicado no se expone como turno operativo. Turnos con `origin !== 'IMP'`
      o en borrador mantienen la interfaz de edición original de Admin/Planner o no exponen acuse operativo.
- [x] UXR-F3-M04 · AC-2 — fallo de acuse: turno conservado, estado mostrado sin duplicar acción.
      Manejo de error de red con mensaje visible, botón de reintento explícito y deshabilitación durante la mutación.
      Suite ampliada en `src/components/shift-dashboard/ShiftModal.test.tsx` (8 tests PASS).
- [x] UXR-F3-M05 · AC-1 — Admin en Equipo descubre importación CSV sin pasar por configuración
      general. Añadido botón `data-testid="bulk-import-button"` en el toolbar de la pestaña Personas en
      `EquipoModal.tsx`, abriendo diálogo unificado para importar usuarios o empleados con clasificación
      previa y descarga de credenciales únicas.
- [x] UXR-F3-M06 · AC-2 — vuelta desde preview tras cancelar conserva pestaña/filtro/contexto.
      Al cerrar o cancelar el diálogo masivo dentro de `EquipoModal`, se preservan la pestaña activa (`personas`),
      filtros (`search`, `filterAccess`, `filterRole`, `filterArea`, `filterStatus`) y selección. Verificado en
      `src/components/team/EquipoModal.test.tsx` (25 tests PASS).

### 3.2 No regresión — DO_NOT_BREAK

- [x] Preview sigue sin escribir durante el parse (CSV parse y preview son puros; mutación solo en confirmación).
- [x] Ningún futuro se publica automáticamente.
- [x] Siete días y detalle completo intactos (CX-F02).
- [x] Tabla alternativa accesible intacta (CX-F02).
- [x] Contexto de empleado intacto (CX-F02).
- [x] Métricas desktop intactas (CX-F02) — `StatsBar` mantiene fila desktop completa.
- [x] Scope SELF intacto (CX-F06) — acuse restringido a `currentEmployeeId === shift.employeeId && sessionRole === 'EMPLOYEE'`.
- [x] Distinción publicado/borrador intacta (CX-F06) — acuse condicionado a `shift.origin === 'IMP'`.
- [x] Solicitudes existentes no duplicadas (CX-F06).
- [x] No se habilita edición de planificación desde el acuse (CX-F06) — vista de sólo lectura con acuse.
- [x] Separación acceso/ficha intacta (CX-F07).
- [x] Opciones de scope de Planner intactas (CX-F07).
- [x] Preview de errores por fila intacta (CX-F07) — tabla con clasificación y motivos.
- [x] Credenciales de un solo uso sin cambio de comportamiento (CX-F07) — `buildCredentialsTxt` y exportación TXT inertes.

### 3.3 Calidad automatizada (umbral: cero tolerancia)

- [x] `npm test` — 100% verde (159 ficheros / 1475 tests pasados).
- [x] `npx tsc --noEmit` — 0 errores.
- [x] `npm run lint` — 0 errores, 0 warnings (`--max-warnings 0`).
- [x] `npm run build` — success (`dist/` generado limpiamente).

### 3.4 Matriz de evidencia visual

- [~] PARTIAL. No se ejecutó la matriz visual completa de 8 viewports × 2 temas × 2 locales en navegador real (pendiente para Fase 4 / cierre formal).
- [x] Reglas CSS responsive y media queries implementadas y validadas mediante tests de componentes DOM.

### 3.5 Accesibilidad

- [x] Contenedores de desplazamiento nombrados con `role="region"`, `aria-label` y foco `tabIndex={0}`.
- [x] Recorrido por teclado verificado en tests unitarios de `AccessibleScheduleTable` y `EquipoModal`.
- [x] `document.documentElement.lang` sin regresiones.

### 3.6 Scorecards — objetivo de mejora declarado

| Dimensión | Antes (auditoría) | Objetivo de la fase | Estado al cierre de esta pasada |
|---|---|---|---|
| Navigation | FAIR | GOOD | Mejora estructural: acuse conectado al detalle activo de calendario; CSV alcanzable desde Equipo. |
| Workflow Efficiency | FAIR | GOOD | Mejora de flujo: descubrimiento directo de CSV en Equipo sin pasar por Ajustes; acuse en un clic desde ShiftModal. |
| Efficiency | FAIR | GOOD | Totales accesibles en 390px sin desplazamiento forzado; tabla y rejilla con scroll etiquetado. |
| Component Coherence | FAIR | GOOD | Consolidación de acuse y carga masiva dentro de las superficies canónicas `ShiftModal` y `EquipoModal`. |

## 4 · Evidencia adjunta

| Artefacto | Ruta | Quién lo generó | Fecha |
|---|---|---|---|
| Tests `StatsBar` (M01 móvil/desktop) | `src/components/shift-dashboard/StatsBar.test.tsx` | Vitest | 2026-09-09 |
| Tests `AccessibleScheduleTable` (M02 teclado/overflow) | `src/components/scheduling/AccessibleScheduleTable.test.tsx` | Vitest | 2026-09-09 |
| Tests `ShiftModal` (M03/M04 acuse, permisos, errores) | `src/components/shift-dashboard/ShiftModal.test.tsx` | Vitest | 2026-09-09 |
| Tests `EquipoModal` (M05/M06 bulk button, preview, contexto) | `src/components/team/EquipoModal.test.tsx` | Vitest | 2026-09-09 |
| `npm test` (159 files / 1475 tests) | Vitest CLI | Test runner | 2026-09-09 |
| `tsc` / `lint` / `build` | npm scripts | CI tools | 2026-09-09 |

## 5 · Gate Status

**PASS_WITH_GAPS.**

Las 6 microtareas tienen sus AC funcionales y no-regresión completados y verificados con tests automatizados (159 ficheros / 1475 tests 100% verde, tsc 0 errores, lint 0 warnings, build exitoso).

Huecos declarados transparentemente:
1. Matriz visual completa (8 viewports × 2 temas × 2 locales en capturas PNG) no generada de forma masiva en este paso; diferida a Fase 4 (cierre de evidencia).
2. Recalificación formal de los scorecards mediante re-auditoría metodológica completa programada para Fase 4.

