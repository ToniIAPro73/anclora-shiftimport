# UXR-F3 — Structure Gate Document

## Summary
- **Status**: GATE PENDING
- **Date**: <vacío hasta cierre>
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

- [ ] Fase UXR-F2 en `GATE PASS` o `GATE PASS_WITH_GAPS` documentado.
- [ ] Baseline de evidencia de Fase 0 vigente para el HEAD actual.
- [ ] Cuentas sintéticas OWNER/PLANNER de `UXR-F0-M07` disponibles para el ciclo
      publicar→consultar→acuse→solicitar→resolver.

## 3 · Criterios de salida (gate de aceptación)

### 3.1 Funcionales — todos los AC de las microtareas de la fase

- [ ] UXR-F3-M01 · AC-1 (parcial, compartido) — 390px: interfaz indica cómo alcanzar información
      completa sin desplazamiento horizontal accidental.
- [ ] UXR-F3-M02 · AC-1 — 390px: interfaz indica cómo alcanzar los siete días.
- [ ] UXR-F3-M02 · AC-2 — navegación por teclado alcanza horario y acciones sin mover toda la página
      horizontalmente.
- [ ] UXR-F3-M03 · AC-1 — Employee con turno publicado: detalle desde calendario muestra estado de
      recepción y acción autorizada.
- [ ] UXR-F3-M03 · AC-3 — borrador no publicado no se expone como turno operativo.
- [ ] UXR-F3-M04 · AC-2 — fallo de acuse: turno conservado, estado mostrado sin duplicar acción.
- [ ] UXR-F3-M05 · AC-1 — Admin en Equipo descubre importación CSV sin pasar por configuración
      general.
- [ ] UXR-F3-M06 · AC-2 — vuelta desde preview tras cancelar conserva pestaña/filtro/contexto.

### 3.2 No regresión — DO_NOT_BREAK

- [ ] Preview sigue sin escribir durante el parse.
- [ ] Ningún futuro se publica automáticamente.
- [ ] Siete días y detalle completo intactos (CX-F02).
- [ ] Tabla alternativa accesible intacta (CX-F02).
- [ ] Contexto de empleado intacto (CX-F02).
- [ ] Métricas desktop intactas (CX-F02).
- [ ] Scope SELF intacto (CX-F06).
- [ ] Distinción publicado/borrador intacta (CX-F06).
- [ ] Solicitudes existentes no duplicadas (CX-F06).
- [ ] No se habilita edición de planificación desde el acuse (CX-F06).
- [ ] Separación acceso/ficha intacta (CX-F07).
- [ ] Opciones de scope de Planner intactas (CX-F07).
- [ ] Preview de errores por fila intacta (CX-F07).
- [ ] Credenciales de un solo uso sin cambio de comportamiento (CX-F07).

### 3.3 Calidad automatizada (umbral: cero tolerancia)

- [ ] `npm test` — 100% verde, sin tests eliminados ni `.skip` nuevos.
- [ ] `npx tsc --noEmit` — 0 errores.
- [ ] `npm run lint` — 0 errores, 0 warnings (`--max-warnings 0`).
- [ ] `npm run build` — success.

### 3.4 Matriz de evidencia visual

- [ ] 8 viewports × 2 temas × 2 locales para `StatsBar`/`AccessibleScheduleTable`, detalle de turno
      activo, workspace Equipo.
- [ ] `hide-scrollbars=false` en toda medición de overflow.

### 3.5 Accesibilidad

- [ ] Axe sin violaciones nuevas en las pantallas tocadas.
- [ ] Recorrido completo por teclado con foco visible y orden lógico en la tabla semanal.
- [ ] `document.documentElement.lang` coincide con el locale efectivo.

### 3.6 Scorecards — objetivo de mejora declarado

| Dimensión | Antes (auditoría) | Objetivo de la fase |
|---|---|---|
| Navigation | FAIR | GOOD |
| Workflow Efficiency | FAIR | GOOD |
| Efficiency | FAIR | GOOD |
| Component Coherence | FAIR | GOOD |

## 4 · Evidencia adjunta

| Artefacto | Ruta | Quién lo generó | Fecha |
|---|---|---|---|
| *(vacío — se rellena al implementar)* | | | |

## 5 · Gate Status

**PENDING** — pasa a `PASS` o `PASS_WITH_GAPS` sólo cuando las 6 microtareas de Fase 3 tengan
evidencia adjunta en §4 y las casillas de §3 estén marcadas con justificación.
