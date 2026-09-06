# PD-2026-09-06-D03 — Employee self-import

## Metadatos

- Estado: Aprobada.
- Fecha de aprobación: 2026-09-06.
- Nivel: Product Decision (PD) local.
- Owner: Producto ShiftImport.
- Alcance: importación autenticada bajo scope `SELF`.

## Contexto

El código ya soportaba técnicamente imports bajo scope `SELF`, pero el producto no había fijado si
un `EMPLOYEE` podía importar sus propios turnos.

## Decisión

Un usuario con rol `EMPLOYEE` y Employee activo vinculado puede importar sus propios turnos,
siempre bajo scope `SELF`. No puede elegir otro `employee_id`, ensanchar scope, crear o reactivar
Employees, resolver identidades ajenas ni usar este flujo como importación de equipo.

## Alternativas consideradas

- Reservar la importación exclusivamente a `OWNER`/`ADMIN`: no adoptada; cerraría una capacidad
  coherente con el scope `SELF` ya existente.
- Permitirla mediante una política configurable por organización: no adoptada para esta versión;
  añade modelo y configuración sin necesidad inmediata.

## Restricciones

El backend es la autoridad. Se preservan aislamiento tenant, Employee `ACTIVE`, preview antes de
escritura, atomicidad e idempotencia. El EMPLOYEE no puede crear planificación futura ni publicar.

## Documentos relacionados

- `docs/specs/SPEC-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md` — D-03.
- `docs/roadmap/ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md` — P5-M05.
- `docs/product/IMPORT_OUTCOME_CONTRACT.md`.
