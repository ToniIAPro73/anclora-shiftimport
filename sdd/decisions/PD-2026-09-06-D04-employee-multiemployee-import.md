# PD-2026-09-06-D04 — Self-import de fichero multiempleado

## Metadatos

- Estado: Aprobada.
- Fecha de aprobación: 2026-09-06.
- Nivel: Product Decision (PD) local.
- Owner: Producto ShiftImport.
- Alcance: resolución de filas y alcance temporal del self-import.

## Contexto

Faltaba contrato para un fichero de EMPLOYEE que contiene filas de varias personas, para identidad
ausente o ambigua y para fechas futuras.

## Decisión

El flujo procesa únicamente las filas atribuidas inequívocamente al Employee autenticado. Las
filas ajenas se descartan con recuento visible antes de confirmar y en el resultado. También se
muestran filas totales, propias, ajenas, no identificables y turnos propios importados.

Si el Employee no aparece, el resultado es `blocked` con `SELF_IDENTITY_NOT_FOUND` y cero writes.
Si la identidad es ambigua, el resultado es `blocked` y exige desambiguación explícita; nunca se
elige silenciosamente.

El alcance temporal inicial permite turnos propios pasados y presentes. Las filas futuras se
excluyen con explicación visible: no crean `Shift`, `Schedule` ni `ScheduleVersion`, y no abren
acceso a publicación.

## Alternativas consideradas

- Rechazar el fichero completo ante cualquier fila ajena: no adoptada; penaliza un uso frecuente
  sin mejorar la comprensión frente al descarte explícito.
- Descartar filas ajenas silenciosamente: rechazada por el principio de no fallo silencioso.
- Permitir futuros en borrador: no adoptada; el self-import no debe crear planificación.

## Restricciones

Todo enforcement se realiza también en backend. Un `employee_id` ajeno o cross-tenant devuelve
403/404 según el contrato de aislamiento, sin mutaciones. Se preservan preview, atomicidad,
idempotencia y `ImportOutcome` persistente.

## Documentos relacionados

- `docs/specs/SPEC-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md` — D-04.
- `docs/roadmap/ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md` — P5-M05.
- `docs/product/IMPORT_OUTCOME_CONTRACT.md`.
