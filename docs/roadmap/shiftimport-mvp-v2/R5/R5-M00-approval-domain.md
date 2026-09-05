# R5-M00 — Approval Domain

## 1. Objetivo

Establecer el dominio de aprobación (Approval) como capa independiente que puede interceptar un Change Request (R4-M06) antes de que su cambio se aplique al schedule, sin construir un motor de workflow genérico.

## 2. Problema que resuelve

Hoy un Change Request creado por un empleado (R4-M06) no tiene ningún mecanismo de gobernanza: no existe forma de decidir si requiere aprobación, quién aprueba, ni cómo se aplica el cambio aprobado. R5-M00 introduce el vocabulario y los límites del dominio antes de construir política, ruteo, bandeja, etc.

## 3. Estado actual del repositorio

Antes de esta microfase no existía tabla, endpoint ni componente de aprobación. R4-M06 y R4-M13 ya están cerradas con Gate PASS y proporcionan el `ChangeRequest` sobre el que se apoya este dominio.

## 4. Alcance IN

- Definición de entidades de dominio: `ApprovalPolicy`, `ApprovalRequest` (envoltorio de un Change Request sometido a política), `ApprovalDecision`.
- Reglas de pertenencia: una `ApprovalRequest` pertenece a una organización y opcionalmente a un área.
- Documentar la relación 1:1 entre un Change Request y, como máximo, una ApprovalRequest activa.

## 5. Alcance OUT

- Workflow Builder genérico multi-paso (R6, post-MVP).
- Políticas configurables por el usuario final (solo 3 políticas fijas, ver R5-M01).
- Delegación de aprobadores (R9, post-MVP).

## 6. Dependencias

R4-M13 (Employee Portal Final Gate, provee Change Request), R2-M07 (scopes ORGANIZATION/AREA/SELF).

## 7. Decisiones arquitectónicas

- El dominio Approval NO es un motor de estados genérico: es una envoltura fina sobre Change Request con un único paso de decisión (approve/reject), consistente con "Approval Lite" del roadmap.
- `ApprovalRequest` es una entidad propia (no un campo más en `change_requests`) para permitir auditoría y evolución futura hacia R6 sin reescribir el modelo de Change Request.

## 8. Modelo de datos afectado

N/A — este microfase es solo definición de dominio; el esquema concreto se crea en R5-M01/M02. Aquí se documenta el glosario y las invariantes que ese esquema deberá respetar:
- Toda `ApprovalRequest` referencia exactamente un `change_request_id` y una `organization_id`.
- Una `ApprovalRequest` tiene estado `PENDING | APPROVED | REJECTED | CANCELLED`, alineado con el modelo de Change Request definido en R0-M04.

## 9. API / Backend

N/A — sin endpoints en esta microfase; se documenta el contrato que R5-M02..M05 deberán implementar.

## 10. Frontend / UX

N/A — sin UI en esta microfase.

## 11. Seguridad y autorización

N/A — se define en R5-M09; aquí solo se anota que ninguna decisión de aprobación puede ejecutarse sin verificación de rol/scope en backend.

## 12. i18n

N/A — sin strings visibles en esta microfase.

## 13. Accesibilidad

N/A — sin UI en esta microfase.

## 14. Responsive / temas

N/A — sin UI en esta microfase.

## 15. Observabilidad / errores

N/A — se define en R5-M06 (Audit Trail).

## 16. Migraciones

N/A — sin migración en esta microfase; R5-M01/M02 crean el esquema real.

## 17. Compatibilidad y datos existentes

N/A — no existen datos previos de aprobación.

## 18. Tasks

### T01 — Documentar glosario de dominio Approval

Objetivo:
Redactar el glosario formal (ApprovalPolicy, ApprovalRequest, ApprovalDecision) en `docs/product/` o extensión de R0-M02.

Archivos / módulos probables:
- `docs/product/` (nuevo o extendido)

Cambios:
- Añadir sección "Approval domain" con definiciones y relaciones a Change Request.

No hacer:
- No definir aún columnas de tabla (eso es R5-M01/M02).

Criterios de aceptación:
- [x] Glosario incluye ApprovalPolicy, ApprovalRequest, ApprovalDecision con relaciones explícitas.
- [x] Referencia cruzada a R0-M04 (Change Request state model) mediante el ciclo y los límites de Change Request/Approval Request.

Tests:
- N/A — documento.

Evidencia esperada:
- Ruta del documento actualizado.

## 19. Tests obligatorios

N/A — microfase de documentación de dominio.

## 20. Evidencias

`docs/roadmap/shiftimport-mvp-v2/R0/DOMAIN-GLOSSARY.md` actualizado; `git diff --check` PASS.

## 21. Gate

Gates requeridos: G1 (Architecture), G3 (Domain invariants).

Resultado: **PASS**. El glosario es coherente con R0-M04 y R4-M06, fija cardinalidad 1:1 activa y no introduce múltiples pasos de aprobación.

## 22. Rollback / remediación

Revertir el commit de documentación; sin impacto en datos.

## 23. Criterio de DONE

Glosario de dominio Approval documentado y coherente con R0-M04 y R4-M06, sin ambigüedad sobre alcance IN/OUT. Microfase completada el 2026-09-05.

Estado: DONE — PASS.
Commit de cierre: `8990f83` — `docs(approval): define R5 approval domain`.
