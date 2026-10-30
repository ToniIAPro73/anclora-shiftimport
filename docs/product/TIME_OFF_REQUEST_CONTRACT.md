# Time Off Request Contract

**Estado**: aprobado como contrato (F0, 2026-10-30) · **no implementado** hasta F2/F3; con `TIME_OFF_ENABLED=false` la aplicación se comporta como hoy.
**Autoridad de implementación**: `docs/specs/SPEC-SHIFTIMPORT-PLANNING-SIMPLIFICATION-MOBILE-AND-VACATIONS.md` (§2.3, §3, §4.2–§4.4, §5.4, §17.3, §19). Este contrato resume las reglas normativas; el detalle de esquema, API y fases vive solo en la spec.
**Relacionados** (referenciados, no duplicados): `RBAC_SCOPE_MATRIX.md`, `EFFECTIVE_CALENDAR_CONTRACT.md`, `SCHEDULING_DOMAIN.md`, `FUTURE_IMPORT_DRAFT_CONTRACT.md`, `IMPORT_REVERSION_CONTRACT.md`, `OPERATIONAL_NAVIGATION_TIME_SCOPE_CONTRACT.md`.

## 1. Alcance

Una solicitud de vacaciones es **un rango de fechas de un empleado**, aprobada o rechazada por un gestor con scope sobre ese empleado. Los alcances aprobados son únicamente `SHIFT_CHANGE` y `TIME_OFF`; no existe un motor genérico de aprobaciones.

Fuera de alcance: rondas, puntos, ranking, saldos devengados, justificantes, datos médicos, revocar o cancelar tras aprobar, editar una solicitud pendiente, notificaciones fuera de la app. ShiftImport no es un HRIS.

## 2. Tipos

`request_type ∈ { VACATION, SICK_LEAVE, PERMISSION, OTHER }` es un catálogo cerrado; **el MVP habilita solo `VACATION`** (`ENABLED_TIME_OFF_TYPES=['VACATION']`, lista blanca en código). Un tipo no habilitado no puede crearse (`422 TIME_OFF_TYPE_NOT_ENABLED`) ni materializarse (`422 TIME_OFF_TYPE_NOT_MATERIALIZABLE`). Habilitar otro tipo exige contrato, `shift_type` propio y claves i18n, sin migración.

**`Baja` significa exclusivamente baja médica.** Ninguna vacación ni permiso genérico se materializa como `Baja`.

## 3. Ciclo de vida

```text
PENDING → APPROVED | REJECTED | CANCELLED
```

`APPROVED`, `REJECTED` y `CANCELLED` son terminales. Crear una solicitud equivale a enviarla (no hay borrador). Solo el solicitante cancela, y solo mientras `PENDING`. Rechazar exige motivo. La creación exige `start_date ≥ hoy` (Europe/Madrid), `end_date ≥ start_date`, ≤366 días y ningún solape con otra solicitud viva (`PENDING`/`APPROVED`) del mismo empleado.

## 4. Autorización y scope

Sin autoaprobación: nadie aprueba ni rechaza su propia solicitud, comprobado por `userId` **y** por `employeeId`, aunque sea `OWNER`, `ADMIN` o `PLANNER`. Los endpoints nuevos autorizan con `resolveEffectiveAccessScope` → `isTargetInScope` → `can(actor, action, target)` sobre el scope real (`ORGANIZATION`, `AREAS`, `EMPLOYEES`, `SELF`), nunca con `scoped_area_id` suelto; el empleado nunca viene del cliente; toda consulta se acota por `organization_id` (`D-01_NEW_ENDPOINTS=BLOCKING_REQUIREMENT`). Detalle: `RBAC_SCOPE_MATRIX.md` §6.

## 5. Materialización al aprobar

Se materializa solo el rango efectivo `[max(start_date, hoy_en_la_aprobación), end_date]`. Los días anteriores **no se retrofechan ni modifican historia** y el efecto parcial es explícito: la respuesta informa `requestedDays`, `materializedDays`, `skippedPastDays` y `effectiveStartDate`; la solicitud guarda `applied_start_date` y `applied_days`; la UI del gestor advierte antes de confirmar y el empleado ve el rango aplicado. Si `end_date < hoy`: `422 TIME_OFF_START_PASSED_ALL`, sin cambio de estado.

La aprobación, en una sola transacción: supersede los turnos `EFFECTIVE` del rango, inserta turnos `Vacaciones` de día completo (`provenance='EMPLOYEE_REQUEST'`, `counts_as_work=false`, enlazados a la solicitud), registra `calendar_changes` y reemplaza las asignaciones de los borradores afectados.

## 6. Protección del calendario y de la planificación

Una vacación aprobada protege Calendario, planificador semanal, importación, asignación manual, publicación y herencia de borradores: no pueden coexistir un turno operativo incompatible y una vacación aprobada sin override explícito y auditable.

- **Importación**: una propuesta que difiere de la ausencia ⇒ `REQUIRES_REVIEW` con motivo `APPROVED_VACATION_CONFLICT` (también en fechas pasadas); la ausencia sigue `EFFECTIVE`.
- **Planificación**: asignar sobre un día protegido ⇒ `422 PROTECTED_ABSENCE_DAY`; la publicación excluye esas asignaciones (`PROTECTED_ABSENCE`); un borrador nuevo no las hereda.
- **Override manual**: solo `OWNER` o `ADMIN`; `PLANNER` y `EMPLOYEE` reciben `403 PROTECTED_ABSENCE_OVERRIDE_FORBIDDEN`. Se audita como `time_off_request.manual_override`.

## 7. Auditoría

Eventos: `time_off_request.created`, `.approved`, `.rejected`, `.cancelled`, `.manual_override`. El actor es siempre el de la sesión. Sin credenciales ni PII nueva. El historial de la solicitud (`history`) es una línea temporal derivada de sus propias columnas, sin tabla nueva.

## 8. Feature flag

`TIME_OFF_ENABLED` (servidor) y `VITE_TIME_OFF_ENABLED` (build), por defecto `false`. Con el flag apagado los endpoints responden `404`, la UI no aparece y los datos existentes permanecen. Orden de activación y rollback: spec §17.3.

## 9. Navegación

La entrada de producto es **Solicitudes** (gestores: «Solicitudes pendientes»; empleados: «Tus solicitudes»), nunca «Aprobaciones».
