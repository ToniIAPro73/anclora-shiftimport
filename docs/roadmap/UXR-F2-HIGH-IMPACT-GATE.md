# UXR-F2 — High Impact Gate Document

## Summary
- **Status**: GATE PENDING
- **Date**: <vacío hasta cierre>
- **Fase**: UXR-F2 (Alto impacto)
- **Target Branch**: `development`
- **Findings cubiertos**: CX-F01, CX-F04, CX-F05
- **Spec fuente**: `sdd/features/ux-remediation-codex-2026-09/`

---

## 1 · Objectives & Scope

**Entra**: revisión de turnos legible en móvil (CX-F01), resumen temporal que no anuncia borradores
excluidos por rol (CX-F04), clasificación correcta de provisioning de usuarios/empleados (CX-F05).

**No entra explícitamente**: CX-F02/F06/F07 (Fase 3). Ningún cambio a la decisión de producto
`PD-2026-09-06-P5.5-future-import-draft-scheduling.md` (D-P5.5-01..05) — sólo presentación del
conteo. Ninguna revalidación server-side nueva para CX-F05 (el backend ya revalida
independientemente).

## 2 · Criterios de entrada (gate de admisión)

- [ ] Fase UXR-F1 en `GATE PASS` o `GATE PASS_WITH_GAPS` documentado.
- [ ] Baseline de evidencia de Fase 0 vigente para el HEAD actual.
- [ ] `UXR-F1-M04` (fixture CX-E01) en `PASS` — dependencia dura declarada por la auditoría: CX-F05
      no se puede validar por la ruta de usuario real sin ella.

## 3 · Criterios de salida (gate de aceptación)

### 3.1 Funcionales — todos los AC de las microtareas de la fase

- [ ] UXR-F2-M01 · AC-1 — 5 filas Ready a 390×844: al menos una fila completa visible y todas
      alcanzables.
- [ ] UXR-F2-M01 · AC-2 — 844×390: área de filas con altura positiva, acciones no recortadas.
- [ ] UXR-F2-M01 · AC-3 — cambio de orientación/expansión de archivo preserva cambios y selección
      temporal.
- [ ] UXR-F2-M02 · AC-2 — 768×1024: campos de fila legibles sin comprimirse.
- [ ] UXR-F2-M02 · AC-3 — edición en layout de tarjeta conserva foco y valor.
- [ ] UXR-F2-M04 · AC-1 — Employee con futuros: cero borradores a crear y razón explícita.
- [ ] UXR-F2-M04 · AC-2 — Admin con históricos-only → incluir futuros: conteos/destinos consistentes.
- [ ] UXR-F2-M06 · AC-1 — email nuevo sin external ID → clasificado nuevo sin vínculo, no ya miembro.
- [ ] UXR-F2-M06 · AC-2 — dos filas con mismo ID nuevo → segunda indica duplicado con referencia a
      primera.
- [ ] UXR-F2-M06 · AC-3 — suma de conteos (válidas+inválidas) coincide con total y política de
      confirmación.

### 3.2 No regresión — DO_NOT_BREAK

- [ ] Preview sigue sin escribir durante el parse.
- [ ] Ningún futuro se publica automáticamente.
- [ ] Identidad y período autoritativos intactos (CX-F01).
- [ ] Avisos de filas excluidas intactos (CX-F01).
- [ ] Focus y cierre seguro intactos (CX-F01).
- [ ] Self scope intacto (CX-F04).
- [ ] Decisión explícita de futuros intacta (CX-F04).
- [ ] Conteo sin descarte silencioso (CX-F04).
- [ ] Revalidación backend intacta (CX-F05).
- [ ] No se crea `Employee` al importar `User` (CX-F05).
- [ ] Aislamiento organización intacto (CX-F05).
- [ ] Motivos por fila intactos (CX-F05).

### 3.3 Calidad automatizada (umbral: cero tolerancia)

- [ ] `npm test` — 100% verde, sin tests eliminados ni `.skip` nuevos.
- [ ] `npx tsc --noEmit` — 0 errores.
- [ ] `npm run lint` — 0 errores, 0 warnings (`--max-warnings 0`).
- [ ] `npm run build` — success.

### 3.4 Matriz de evidencia visual

- [ ] 8 viewports × 2 temas × 2 locales para las pantallas afectadas (`ImportModal` revisión,
      badge temporal, preview de provisioning).
- [ ] `hide-scrollbars=false` en toda medición de overflow.

### 3.5 Accesibilidad

- [ ] Axe sin violaciones nuevas en las pantallas tocadas.
- [ ] Recorrido completo por teclado con foco visible y orden lógico en revisión móvil (CX-F01).
- [ ] `document.documentElement.lang` coincide con el locale efectivo.

### 3.6 Scorecards — objetivo de mejora declarado

| Dimensión | Antes (auditoría) | Objetivo de la fase |
|---|---|---|
| Responsive Task Completion | POOR | GOOD |
| Viewport Economy | POOR | FAIR |
| Modal Ergonomics | POOR | FAIR |
| Feedback | FAIR | GOOD |
| State Clarity | FAIR | GOOD |

## 4 · Evidencia adjunta

| Artefacto | Ruta | Quién lo generó | Fecha |
|---|---|---|---|
| *(vacío — se rellena al implementar)* | | | |

## 5 · Gate Status

**PENDING** — pasa a `PASS` o `PASS_WITH_GAPS` sólo cuando las 6 microtareas de Fase 2 tengan
evidencia adjunta en §4 y las casillas de §3 estén marcadas con justificación.
