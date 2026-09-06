# P1 Gate — Trusted Import Completion

**Baseline:** `276efc1f85666cc4d22707506a6d407cc1961e19`
**Branch:** `development`
**Gate:** `PASS_WITH_GAPS`

## Root cause

`createImport` fijaba el estado a `completed` y sólo se llamaba desde caminos con turnos listos
para escribir. Un bloqueo de identidad o un fallo total no dejaba una fila consultable en el
histórico. Además, un reintento podía leer una instantánea antigua de `employees` después de
completar una vinculación.

## Implementación

- Contrato `ImportOutcome` publicado en `docs/product/IMPORT_OUTCOME_CONTRACT.md`.
- Migración `0033_import_outcome.sql`, aditiva e idempotente: estados, motivo, detalle acotado,
  entidad bloqueante e índices.
- `createImport` valida outcomes, no consume idempotencia para `blocked`/`failed`, valida el
  empleado bloqueante dentro del tenant y emite auditoría.
- `PATCH /api/imports` actualiza el resultado de una fila creada antes de persistir turnos.
- `ImportResultModal` usa `ModalShell`, mantiene el resultado hasta cierre explícito y ofrece
  completar alta/reintentar.
- `MembersModal` puede abrir la pestaña de empleados enfocando el registro bloqueante.
- La resolución del reintento relee empleados desde backend para evitar carreras de hidratación.
- Documentación de R1-M09 y `AGENTS.md` actualizada.

## Evidencia

| Criterio | Resultado |
|---|---|
| Unit/integration | PASS — suite completa: 137 ficheros, 1231 tests |
| Outcome/data-access | PASS — estados, detalle acotado, idempotencia, tenant y actualización |
| Migration | PASS — `0033` incremental y desde cero; 33/33 migraciones |
| Lint/typecheck/build | PASS |
| E2E | PASS — 1 recorrido dirigido en Chromium, 31,9 s |
| Journey E2E | PASS — CSV pendiente → bloqueo → directorio → vinculación → reintento → turno |
| Native dialogs | PASS — el test falla si aparece cualquier `page.on('dialog')` |
| History | PASS — bloqueado y completado quedan visibles con motivo y conteos |
| Accessibility | PASS — `ImportResultModal.test.tsx`, `ModalShell` y foco por componente |
| Regression | PASS — importación existente, idempotencia y tests de empleados conservados |

## Estrategia E2E reducida

Se mantiene un único E2E de negocio para el journey diferencial de P1. Las variantes de estado,
validación de payload, aislamiento, idempotencia y saneamiento del detalle se prueban en Vitest y
data-access, evitando repetir login, seed y teardown por cada combinación.

## Gap no bloqueante

No se generaron cuatro recorridos E2E separados para las ramas `partial`/`failed` y las cuatro
combinaciones visuales ES/EN + light/dark + desktop/mobile. La misma superficie común está cubierta
por tests de componente y el journey bloqueado se observó en navegador. Se absorbe en el Gate final
visual, sin cambiar la lógica ni bloquear P2.

## Veredicto

`PASS_WITH_GAPS`: el journey principal es persistente, recuperable, aislado y verificable; el gap
restante es exclusivamente amplitud de evidencia visual repetida. P2 puede comenzar conforme a la
regla de dependencia del roadmap.
