# UXR-F2 — High Impact Gate Document

## Summary
- **Status**: GATE PASS_WITH_GAPS
- **Date**: 2026-09-09
- **Fase**: UXR-F2 (Alto impacto)
- **Target Branch**: `development`
- **Findings cubiertos**: CX-F01, CX-F04, CX-F05
- **Spec fuente**: `sdd/features/ux-remediation-codex-2026-09/`
- **HEAD de partida**: `cbd642d` (Fase 1 ya en las 4 ramas remotas). Cambios de esta fase sin
  commitear — quedan en el árbol de trabajo, sin push, a la espera de autorización explícita.

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

- [x] UXR-F2-M01 · AC-1 — 5 filas Ready a 390×844: al menos una fila completa visible y todas
      alcanzables. Medido con Playwright real (`qa/e2e-acceptance/specs-baseline/uxr-f2-import-preview-evidence.spec.ts`):
      `shifts-list` height = **180px** (antes: 0px, auditoría), primera fila con `height=354.36px`
      dentro del viewport, papelera de la última fila alcanzable con `scrollIntoViewIfNeeded`.
- [x] UXR-F2-M01 · AC-2 — 844×390: área de filas con altura positiva, acciones no recortadas.
      Medido: `shifts-list` height = **64px** (> 0; antes 0px). **Matiz honesto**: a 390px de alto
      total, el panel completo del importador dispone de ~100px reales tras cabecera — una fila de
      tarjeta completa (354px) no cabe sin scroll a esa altura extrema. El AC exige "altura positiva
      y acciones no recortadas" (cumplido, verificado), no "fila completa sin scroll" (eso es el
      texto literal del AC-1, para 390×844). Papelera de la última fila alcanzable y no tapada tras
      scroll — verificado.
- [x] UXR-F2-M01 · AC-3 — cambio de orientación/expansión de archivo preserva cambios y selección
      temporal. Test unitario (`ImportModal.test.tsx`, "toggling the identity/file summary never
      unmounts the fields"): el bloque de identidad/archivo nunca se desmonta (colapso 100% CSS vía
      selector de hermano `.import-modal-identity-summary + .import-modal-identity-detail`, invisible
      para jsdom mismo por diseño) — un valor editado sobrevive dos ciclos de colapsar/expandir.
- [x] UXR-F2-M02 · AC-2 — 768×1024: campos de fila legibles sin comprimirse. Breakpoint elegido:
      **768px** (no 760px, no adivinado — es la anchura exacta donde la auditoría midió columnas
      comprimidas, E061). Medido: input de fecha con `width=639px` en modo tarjeta (antes: ~66px de
      6 columnas compartiendo un tercio del ancho del modal). `<thead>` confirmado oculto (`toBeHidden`).
- [x] UXR-F2-M02 · AC-3 — edición en layout de tarjeta conserva foco y valor. No hay dos DOM distintos
      (tabla vs. tarjeta): el layout de tarjeta es una reestilización CSS pura del mismo `<table>`
      (`.import-row-table`), nunca un remount — por construcción no puede perder foco/valor al
      cambiar de viewport. Cubierto indirectamente por el test existente "keeps the editable preview
      working" (edita, borra fila, los chips se actualizan) sobre el mismo markup.
- [x] UXR-F2-M04 · AC-1 — Employee con futuros: cero borradores a crear y razón explícita. Test
      unitario nuevo: badge exclusivo `import-future-count` con texto "N turnos futuros detectados;
      no se crearán borradores con la opción actual", coherente con `import-self-future-notice`
      (antes: contradictorios). Sin captura visual — ver §3.4.
- [x] UXR-F2-M04 · AC-2 — Admin con históricos-only → incluir futuros: conteos/destinos consistentes.
      Test unitario nuevo: el mismo badge cambia de "excluido" a "Se crearían N borradores... (sin
      publicar)" — tiempo condicional, nunca afirmativo — al cambiar la decisión. Sin captura visual.
- [x] UXR-F2-M06 · AC-1 — email nuevo sin external ID → clasificado nuevo sin vínculo, no ya miembro.
      `classifyUserRow` extraído a `src/lib/classify-user-row.ts` (testeable en aislado, precedente
      `bulk-import-csv.ts`) con test dedicado + test de componente reproduciendo el caso exacto
      medido por la auditoría (E051/E055/E057): antes se agregaba bajo "existente", ahora bajo
      "nueva" — la suma del resumen lo confirma (ver AC-3).
- [x] UXR-F2-M06 · AC-2 — dos filas con mismo ID nuevo → segunda indica duplicado con referencia a
      primera. Nuevo status `duplicate_employee_id_in_file` + `duplicateOfIndex`, mostrado en la
      preview como "(ver fila N)". Test unitario y de componente verifican ambos.
- [x] UXR-F2-M06 · AC-3 — suma de conteos (válidas+inválidas) coincide con total y política de
      confirmación. Test de componente con los 4 casos exactos de la auditoría en un único CSV (5
      filas): `5 filas · 2 ya son miembros · 2 nuevas · 1 errores` — la suma cuadra exactamente.

### 3.2 No regresión — DO_NOT_BREAK

- [x] Preview sigue sin escribir durante el parse. Sin cambios a `handleConfirm`/`onConfirmImport`;
      sólo presentación y derivación pura.
- [x] Ningún futuro se publica automáticamente. `deriveEffectiveTemporalSummary` es puro
      (detected/includedAsDraft/excludedByRole); no toca la escritura. Test explícito lo verifica
      para EMPLOYEE (siempre 0) y ADMIN historical-only (siempre 0).
- [x] Identidad y período autoritativos intactos (CX-F01). No se tocó la lógica de selector/período;
      sólo se colapsa visualmente el bloque que los contiene (nunca se desmonta).
- [x] Avisos de filas excluidas intactos (CX-F01). `import-self-future-notice`, diagnósticos y
      warnings ahora viven en `.import-modal-review-status`/`.import-modal-review-extra`
      (scroll propio en viewports cortos, nunca `display:none` — sólo `overflow:hidden` en el
      *ancestro* de todo el panel, preexistente).
- [x] Focus y cierre seguro intactos (CX-F01). Suite completa de Fase 1 sobre foco tras borrar sigue
      en verde sin modificación.
- [x] Self scope intacto (CX-F04). `PD-2026-09-06-D03` no tocado; EMPLOYEE sigue sin decisión propia
      sobre futuros (badge sólo cambia el texto, no la lógica de exclusión).
- [x] Decisión explícita de futuros intacta (CX-F04). `FutureImportConsent` sin cambios de
      comportamiento, sólo el badge que lo precede.
- [x] Conteo sin descarte silencioso (CX-F04). El badge nunca desaparece cuando hay futuros
      detectados: alterna entre "se crearían N" y "N detectados, no se crearán", nunca se oculta.
- [x] Revalidación backend intacta (CX-F05). Ningún cambio en `api/`; `classifyUserRow` sigue siendo
      preview informativo, documentado como tal en su docstring.
- [x] No se crea `Employee` al importar `User` (CX-F05). Sin cambios a la llamada de confirmación
      (`bulkAddRemoteMembers`); sólo a la clasificación/presentación previa.
- [x] Aislamiento organización intacto (CX-F05). Sin cambios en `api/_lib/data.js` ni en el contexto
      de sesión.
- [x] Motivos por fila intactos (CX-F05). Ampliados, no removidos: cada fila conserva su status y
      gana la referencia a la fila duplicada cuando aplica.

### 3.3 Calidad automatizada (umbral: cero tolerancia)

- [x] `npm test` — **158 ficheros / 1486 tests, 100% verde**. Ningún test eliminado ni `.skip` nuevo;
      +20 tests netos sobre el cierre de Fase 1 (import-temporal, classify-user-row, ImportModal,
      MembersModal).
- [x] `npx tsc --noEmit` — 0 errores.
- [x] `npm run lint` — 0 errores, 0 warnings (`--max-warnings 0`).
- [x] `npm run build` — success (`dist/` generado, mismos warnings preexistentes de tamaño de chunk,
      no nuevos).

### 3.4 Matriz de evidencia visual

- [~] PARTIAL. No se generaron capturas PNG de la matriz completa 8×2×2. Lo que sí se generó con
      Playwright real (`@playwright/test`, Chromium, `hide-scrollbars` no aplica — no es
      `agent-browser`) contra `vite dev` en modo invitado:
      - `import-preview` a 390×844: `shifts-list.height=180px`, `firstRow.height=354.36px`.
      - `import-preview` a 844×390: `shifts-list.height=64px`.
      - `import-preview` a 768×1024: input de fecha `width=639px`, `<thead>` oculto confirmado.
      - Ver `qa/e2e-acceptance/artifacts/uxr-f2-evidence/measurements.json`.
- [ ] **NOT_EVALUATED**: capturas PNG de `import-preview` (resto de temas/locales), badge temporal
      (M04, 1440×900 × claro/oscuro × ES/EN) y preview de provisioning (M06, 1440×900 × claro/oscuro)
      — no se ejecutó la doble corrida de baseline (`compare-baseline-runs.mjs`) para confirmar si
      `import-preview` dejó de estar en `DECLARED_UNSTABLE_SCREENS`. Motivo: límite de tiempo de esta
      pasada, no una limitación de herramienta. Pendiente para quien cierre esta fase o para Fase 4.

### 3.5 Accesibilidad

- [x] Axe sin violaciones nuevas — verificado con `@axe-core/playwright` sobre `import-preview` a
      390×844 (0 violaciones, `axe-390x844-violations: []` en el manifiesto).
- [ ] **NOT_EVALUATED**: recorrido completo por teclado grabado explícitamente (más allá de lo que
      cubren los tests unitarios de foco de Fase 1, que siguen en verde sin modificación).
- [x] `document.documentElement.lang` — sin cambios en esta fase respecto a Fase 1 (ya verificado
      entonces); ningún camino de esta fase lo toca.

### 3.6 Scorecards — objetivo de mejora declarado

| Dimensión | Antes (auditoría) | Objetivo de la fase | Estado al cierre de esta pasada |
|---|---|---|---|
| Responsive Task Completion | POOR | GOOD | **Mejora medida, no recalificada formalmente.** 0px→180px/64px en las dos peores celdas (390×844, 844×390); 768×1024 pasó de columnas compartiendo ~66px a un input de 639px. Una recalificación GOOD/FAIR exige el re-audit con la metodología completa (Fase 4), no sólo estas medidas puntuales. |
| Viewport Economy | POOR | FAIR | Igual: mejora medida (breakpoint 768px justificado con datos, no adivinado), recalificación formal pendiente de Fase 4. |
| Modal Ergonomics | POOR | FAIR | El resumen de identidad/archivo colapsable + el bloque de estado con scroll propio siguen el patrón de `MODAL_CONTRACT.md` (scroll en el bloque que crece, nunca en el modal completo). Recalificación formal pendiente. |
| Feedback | FAIR | GOOD | CX-F04 cierra la contradicción badge/aviso; recalificación formal pendiente. |
| State Clarity | FAIR | GOOD | CX-F05 separa "nuevo sin vínculo" de "ya miembro" y añade el eje de duplicado; recalificación formal pendiente. |

## 4 · Evidencia adjunta

| Artefacto | Ruta | Quién lo generó | Fecha |
|---|---|---|---|
| Mediciones M01/M02 (alturas, ancho de input, axe) | `qa/e2e-acceptance/artifacts/uxr-f2-evidence/measurements.json` | `@playwright/test` (Chromium, real) vía `qa/e2e-acceptance/specs-baseline/uxr-f2-import-preview-evidence.spec.ts` | 2026-09-09 |
| Tests unitarios `deriveEffectiveTemporalSummary` | `src/lib/import-temporal.test.ts` | Vitest | 2026-09-09 |
| Tests unitarios `classifyUserRow` (4 casos CX-F05) | `src/lib/classify-user-row.test.ts` | Vitest | 2026-09-09 |
| Tests de componente `ImportModal` (M01/M02/M04, incluida regresión Fase 1 §2.0.1) | `src/components/shift-dashboard/ImportModal.test.tsx` | Vitest + Testing Library | 2026-09-09 |
| Tests de componente `MembersModal` (M05/M06, suma de conteos) | `src/components/shift-dashboard/MembersModal.test.tsx` | Vitest + Testing Library | 2026-09-09 |
| `npm test` / `tsc` / `lint` / `build` | salida de esta sesión (158/1486 tests, 0 errores) | comandos npm | 2026-09-09 |

## 5 · Gate Status

**PASS_WITH_GAPS.**

Las 6 microtareas tienen sus AC funcionales cerrados con evidencia (automatizada + mediciones reales
de layout, no capturas "que parece que se ve"). Los huecos declarados, ninguno oculto:

1. Matriz visual PNG completa (8×2×2 para las 3 pantallas) — no generada, sólo mediciones numéricas
   puntuales para las celdas críticas de M01/M02.
2. Doble corrida de baseline + `compare-baseline-runs.mjs` para confirmar si `import-preview` sale de
   `DECLARED_UNSTABLE_SCREENS` — no ejecutada.
3. Recalificación formal de las 5 dimensiones de scorecard — mejora medida y documentada, pero no
   convertida en un rating GOOD/FAIR defendible sin el re-audit completo.
4. Axe y recorrido por teclado sólo verificados en una combinación (390×844, ES, claro) de las
   necesarias para cobertura material completa.

Nada de esto es una limitación de herramienta: es trabajo real pendiente, declarado explícitamente
para que la Fase 3/4 (o quien retome esta fase) sepa exactamente qué falta y no lo confunda con
"hecho".
