# PD-2026-09-06-D05 — Alcance del PLANNER sin área

## Metadatos

- Estado: Aprobada.
- Fecha de aprobación: 2026-09-06.
- Nivel: Product Decision (PD) local.
- Owner: Producto ShiftImport.
- Alcance: derivación server-side del scope de `PLANNER`.

## Contexto

`resolveAccessScope` convertía cualquier PLANNER sin `scoped_area_id` en scope
`ORGANIZATION`. Era necesario distinguir una organización que no usa áreas de una organización
con áreas operativas configuradas.

## Decisión

- Si la organización no tiene áreas activas, un PLANNER sin área puede operar con scope
  `ORGANIZATION` y sigue siendo PLANNER, sin capacidades administrativas.
- Si la organización tiene una o más áreas activas, un PLANNER sin área queda bloqueado con
  `SCOPE_UNAVAILABLE` (o código de dominio equivalente) hasta que OWNER/ADMIN le asigne un área.
- Un PLANNER con área sólo opera dentro de ella.
- El cliente nunca decide si el alcance es global; se deriva en backend del estado real de la
  organización y del membership.

## Alternativas consideradas

- Fallback incondicional a `ORGANIZATION`: no adoptado; produce una ampliación silenciosa en
  organizaciones con áreas.
- Bloquear siempre a PLANNER sin área: no adoptado; impediría usar el modelo opcional de áreas.
- Exigir confirmación al asignar PLANNER sin área: no adoptada; no sustituye la derivación segura
  del scope en cada operación.

## Restricciones

No se convierte PLANNER en ADMIN. No puede gestionar memberships ni roles. La autorización y el
aislamiento tenant siguen siendo server-side y fail-closed.

## Documentos relacionados

- `docs/specs/SPEC-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md` — D-05.
- `docs/roadmap/ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md` — P5-M03.
- `api/_lib/auth.js`.
