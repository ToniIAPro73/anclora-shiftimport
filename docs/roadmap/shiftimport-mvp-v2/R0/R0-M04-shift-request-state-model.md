# R0-M04 — Shift / Request State Model

## 1. Objetivo

Formalizar como diseño futuro (sin implementar todavía) tres máquinas de estado separadas: Shift lifecycle, Acknowledgement, y Change Request — evitando fusionarlas en una única mega-state-machine, tal como exige el master prompt §17.

## 2. Problema que resuelve

R3 (Scheduling), R4 (Employee Portal) y R5 (Approval Lite) introducirán conceptos de estado nuevos (turno publicado/bloqueado, confirmación de lectura del empleado, solicitud de cambio). Sin un diseño previo, existe riesgo real de colapsar "turno con solicitud de cambio pendiente" en un estado del propio turno (p.ej. `CHANGE_REQUESTED`), lo cual el master prompt prohíbe explícitamente: un turno publicado debe poder seguir `PUBLISHED` mientras existe una solicitud `PENDING` como recurso independiente.

## 3. Estado actual del repositorio

Hoy `shifts` no tiene ninguna columna de estado de lifecycle (draft/published/locked) — todo shift creado por import ya se considera "real" (no hay concepto de borrador). No existen tablas de `Acknowledgement` ni `ChangeRequest`. Esta microfase es diseño puro hacia adelante; no cambia el comportamiento actual de creación de turnos vía import (R1), que permanece intacto.

## 4. Alcance IN

- Diseñar Shift lifecycle: `DRAFT → PUBLISHED → LOCKED → COMPLETED`, con reglas de transición (quién puede mover cada transición, qué la dispara).
- Diseñar Acknowledgement como recurso independiente: `PENDING → ACKNOWLEDGED`, ligado a un shift publicado y a un empleado.
- Diseñar Change Request como recurso independiente: `PENDING → APPROVED / REJECTED / CANCELLED`, ligado a un shift y a un empleado, sin mutar el estado del shift al crearse.
- Documentar explícitamente que un shift `PUBLISHED` permanece `PUBLISHED` mientras tenga un `ChangeRequest` en estado `PENDING` — el shift no adopta un estado compuesto.
- Marcar qué parte de este modelo aplica a los shifts creados hoy por import (respuesta: ninguna todavía — los shifts de import no tienen lifecycle hasta que R3 lo introduzca).

## 5. Alcance OUT

- No crear tablas ni columnas nuevas (eso es R3-M01/M02/M03 para Shift lifecycle, R4-M04/M06 para Acknowledgement/Change Request).
- No implementar ningún endpoint ni UI.
- No modificar `shifts` existente ni su comportamiento de creación por import.

## 6. Dependencias

R0-M02 (vocabulario debe estar fijado antes de diseñar transiciones de estado).

## 7. Decisiones arquitectónicas

Tres máquinas de estado separadas, no una — decisión explícita heredada del master prompt §17, justificada porque fusionar "turno" y "solicitud de cambio" en un único estado impediría representar múltiples solicitudes de cambio concurrentes o el estado real del turno mientras se resuelve una solicitud.

## 8. Modelo de datos afectado

Diseño únicamente — tablas futuras a introducir en R3/R4 (no en esta microfase): `schedule_versions`/`shift_assignments` (Shift lifecycle, R3), `acknowledgements` (R4), `change_requests` (R4/R5). Esquema exacto se especifica en esas microfases; aquí solo se fija el contrato de estados y transiciones.

## 9. API / Backend

N/A en esta microfase — contratos de API para estas máquinas de estado se diseñan en R3/R4/R5 respectivamente.

## 10. Frontend / UX

N/A en esta microfase — UI para lifecycle/acknowledgement/change request llega en R3-M08..M12 y R4.

## 11. Seguridad y autorización

N/A en el detalle (se resuelve en R2-M07/M08 + R3-M13/R5-M09), pero el diseño debe anotar qué rol puede disparar cada transición (p.ej. solo PLANNER/ADMIN publica un Schedule; solo el propio EMPLOYEE puede acknowledge su propio turno).

## 12. i18n

N/A — motivo: microfase de diseño de estados, sin strings de usuario todavía.

## 13. Accesibilidad

N/A — motivo: sin UI en esta microfase.

## 14. Responsive / temas

N/A — motivo: sin UI en esta microfase.

## 15. Observabilidad / errores

N/A — motivo: sin código ejecutable en esta microfase.

## 16. Migraciones

N/A — motivo: ninguna tabla se crea aquí; el diseño alimenta las migraciones de R3/R4.

## 17. Compatibilidad y datos existentes

Los shifts creados hoy por import (R1) no tienen lifecycle y no lo necesitan retroactivamente para el MVP — se documenta explícitamente que la introducción de Shift lifecycle en R3 aplica solo a turnos futuros planificados vía Scheduling, no reescribe el histórico importado.

## 18. Tasks

### T01 — Diseñar máquina de estado Shift lifecycle

Objetivo: Especificar estados, transiciones válidas y disparadores para DRAFT/PUBLISHED/LOCKED/COMPLETED.

Archivos / módulos probables: nuevo documento `docs/roadmap/shiftimport-mvp-v2/R0/STATE-MODEL.md`.

Cambios: Diagrama/tabla de transiciones con rol requerido por transición.

No hacer: No incluir estados compuestos que mezclen lifecycle con acknowledgement o change request.

Criterios de aceptación:
- [ ] Tabla de transiciones válidas DRAFT→PUBLISHED→LOCKED→COMPLETED con rol requerido.
- [ ] Nota explícita: no aplica a shifts creados por import hoy.

Tests: N/A.

Evidencia esperada: Sección "Shift lifecycle" en `STATE-MODEL.md`.

### T02 — Diseñar máquina de estado Acknowledgement

Objetivo: Especificar PENDING→ACKNOWLEDGED como recurso independiente del shift.

Archivos / módulos probables: `STATE-MODEL.md`.

Cambios: Tabla de transiciones + relación con Shift (N acknowledgements por shift publicado, uno por empleado asignado).

No hacer: No mutar el estado del shift al crear/cerrar un acknowledgement.

Criterios de aceptación:
- [ ] Transiciones y relación con Shift documentadas.

Tests: N/A.

Evidencia esperada: Sección "Acknowledgement" en `STATE-MODEL.md`.

### T03 — Diseñar máquina de estado Change Request

Objetivo: Especificar PENDING→APPROVED/REJECTED/CANCELLED como recurso independiente.

Archivos / módulos probables: `STATE-MODEL.md`.

Cambios: Tabla de transiciones + regla explícita: shift permanece PUBLISHED mientras existe un change request PENDING asociado.

No hacer: No introducir un estado `CHANGE_REQUESTED` en el propio Shift.

Criterios de aceptación:
- [ ] Regla "shift no adopta estado compuesto" documentada explícitamente con ejemplo.

Tests: N/A.

Evidencia esperada: Sección "Change Request" en `STATE-MODEL.md`.

### T04 — Matriz de autorización por transición

Objetivo: Anotar qué rol (de R0-M03) puede disparar cada transición de las tres máquinas.

Archivos / módulos probables: `STATE-MODEL.md`, `RBAC-MODEL.md`.

Cambios: Columna "rol requerido" añadida a cada tabla de transición.

No hacer: No implementar el enforcement — solo documentarlo para R3-M13/R4/R5-M09.

Criterios de aceptación:
- [ ] Cada transición tiene rol mínimo requerido documentado.

Tests: N/A.

Evidencia esperada: Columnas de rol completas en `STATE-MODEL.md`.

### T05 — Revisión de compatibilidad con import actual

Objetivo: Confirmar por escrito que el diseño no afecta el comportamiento actual de creación de shifts vía import.

Archivos / módulos probables: `STATE-MODEL.md`, referencia a `src/ingestion/`.

Cambios: Nota de compatibilidad explícita.

No hacer: No proponer cambios al pipeline de import en esta microfase.

Criterios de aceptación:
- [ ] Nota de compatibilidad presente y clara.

Tests: N/A.

Evidencia esperada: Sección "Compatibility with current import" en `STATE-MODEL.md`.

## 19. Tests obligatorios

N/A — motivo: diseño puro, sin código ejecutable en esta microfase.

## 20. Evidencias

`STATE-MODEL.md` (tres máquinas de estado + matriz de autorización + nota de compatibilidad).

## 21. Gate

Gates requeridos: **G1 (Architecture)**, **G3 (Domain invariants)**, **G14 (Documentation)**.

- G1: PASS si las tres máquinas están claramente separadas (no fusionadas).
- G3: PASS si la regla "shift no adopta estado compuesto por change request pendiente" está documentada sin ambigüedad.
- G14: PASS si `STATE-MODEL.md` es consumible directamente por R3/R4/R5 sin re-diseño.

## 22. Rollback / remediación

N/A — motivo: documento de diseño, sin ejecución; corrección es editar el documento y repetir Gate.

## 23. Criterio de DONE

`STATE-MODEL.md` existe con las tres máquinas de estado separadas, matriz de rol por transición, y nota explícita de que los shifts de import actuales quedan fuera de este lifecycle hasta que R3 lo introduzca.
