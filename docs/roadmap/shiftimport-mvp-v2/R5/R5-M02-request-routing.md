# R5-M02 — Request Routing

## 1. Objetivo

Cuando se crea un Change Request (R4-M06), determinar automáticamente si necesita aprobación y, si sí, crear la `ApprovalRequest` y notificar a los aprobadores resueltos por R5-M01.

## 2. Problema que resuelve

Sin ruteo automático, cada Change Request quedaría huérfano de decisión. R5-M02 conecta la creación del Change Request con la política vigente.

## 3. Estado actual del repositorio

IMPLEMENTED — R4-M06 y R5-M01 están cerradas; el endpoint de creación de Change Request ahora enruta de forma atómica según `approval_policy`.

## 4. Alcance IN

- Trigger de ruteo en el momento de creación del Change Request.
- Creación de `ApprovalRequest` en estado `PENDING` cuando la política no es `NO_APPROVAL`.
- Aplicación automática (sin ApprovalRequest) cuando la política es `NO_APPROVAL` — delega a R5-M07 con "auto-aprobado".

## 5. Alcance OUT

- Reglas de ruteo condicionales por tipo de cambio (una sola política por org, ya decidido en R5-M01).

## 6. Dependencias

R5-M01, R4-M06.

## 7. Decisiones arquitectónicas

El ruteo ocurre síncronamente en la misma transacción que crea el Change Request (evita estados intermedios "creado sin decisión de ruteo"). Neon usa transacciones HTTP no interactivas, por lo que se implementa como un único CTE de escritura: Change Request, ApprovalRequest y notificaciones se confirman o revierten juntos.

`NO_APPROVAL` marca el Change Request como `APPROVED` y no crea `ApprovalRequest`. R4-M06 no transporta todavía un delta material de horario (solo tipo y motivo), por lo que la aplicación sobre `ScheduleVersion` queda reservada a R5-M07; no se inventa una mutación de turno en esta microfase.

## 8. Modelo de datos afectado

Nueva tabla `approval_requests (id, organization_id, change_request_id UNIQUE, status, policy_snapshot, created_at)`. `policy_snapshot` congela la política vigente al momento de creación (evita que un cambio de política a mitad de camino altere una decisión ya en curso).

Se amplía el canal in-app existente para `APPROVAL_REQUEST_CREATED` / `APPROVAL_REQUEST`; la bandeja de R5-M03 seguirá recalculando elegibilidad server-side.

## 9. API / Backend

Se integra en el endpoint existente de creación de Change Request (R4-M06); no se expone endpoint propio de "crear ApprovalRequest" — es efecto colateral server-side.

## 10. Frontend / UX

N/A — sin UI propia; el estado se refleja en R4-M07 (Request Status) y R5-M03 (Approver Inbox).

## 11. Seguridad y autorización

El ruteo es puramente server-side; no depende de ningún input de cliente sobre a quién enviar.

## 12. i18n

N/A — sin strings nuevos visibles directamente (reutiliza estados existentes).

## 13. Accesibilidad

N/A — sin UI propia.

## 14. Responsive / temas

N/A — sin UI propia.

## 15. Observabilidad / errores

Si `resolveApprovers` (R5-M01 T05) devuelve lista vacía para una política distinta de `NO_APPROVAL` (caso borde: organización sin ningún ADMIN, no debería ocurrir pero debe manejarse), el Change Request queda `PENDING` sin aprobador — debe loguearse como advertencia operativa, no fallar silenciosamente.

## 16. Migraciones

Nueva migración: tabla `approval_requests`.

## 17. Compatibilidad y datos existentes

No hay Change Requests previos — tabla nace vacía.

## 18. Tasks

### T01 — Migración `approval_requests`

Objetivo: crear tabla.
Archivos: `db/migrations/00XX_approval_requests.sql`.
Cambios: tabla + índice único en `change_request_id`.
No hacer: no permitir dos ApprovalRequest activas para el mismo Change Request.
Criterios de aceptación:
- [x] Constraint UNIQUE aplicado y probado.
Tests: migration test.
Evidencia esperada: resultado de migración.

### T02 — Integrar ruteo en creación de Change Request

Objetivo: al crear el Change Request, decidir política y crear/omitir ApprovalRequest en la misma transacción.
Archivos: módulo de Change Request (definido en R4-M06).
Cambios: llamar a `resolveApprovers` + crear `approval_requests` o aplicar auto-aprobación.
No hacer: no crear el Change Request y el ruteo en transacciones separadas (riesgo de estado inconsistente).
Criterios de aceptación:
- [x] `NO_APPROVAL` auto-aprueba sin fila en `approval_requests`.
- [x] Otras políticas crean `approval_requests` en `PENDING`.
- [x] Fallo de la transacción no deja Change Request sin ruteo: todas las escrituras están en un único CTE transaccional.
Tests: integración cubriendo las 3 políticas.
Evidencia esperada: resultados de test.

### T03 — Manejo de caso borde sin aprobador

Objetivo: registrar advertencia si no hay aprobador resoluble.
Archivos: mismo módulo.
Cambios: log estructurado, no excepción no controlada.
No hacer: no bloquear la creación del Change Request por este caso borde.
Criterios de aceptación:
- [x] Caso simulado (organización sin ADMIN) no rompe la request; queda registrado.
Tests: unit test del caso borde.
Evidencia esperada: log de test.

## 19. Tests obligatorios

Integración (las 3 políticas), unit (caso borde sin aprobador).

## 20. Evidencias

Resultados de tests de integración.

## 21. Gate

Gates requeridos: G3 (domain invariants), G5 (functional).

Resultado: **PASS**.

Validado:
- migración `0028_approval_requests.sql` aplicada en Neon development;
- integración real sintética en Neon: `NO_APPROVAL` → `APPROVED` sin envelope; `ORGANIZATION_ADMIN` → `PENDING` + envelope + notificación; `AREA_RESPONSIBLE` sin mapeo → fallback a ADMIN;
- caso sin aprobador: warning estructurado y request `PENDING`;
- suite completa: 132 archivos / 1190 tests PASS;
- lint, typecheck y build PASS (warning conocido de chunks grandes).

## 22. Rollback / remediación

Rollback lógico: vaciar `approval_requests` si se detecta ruteo incorrecto en piloto; no afecta `change_requests` en sí.

## 23. Criterio de DONE

CUMPLIDO. Todo Change Request nuevo queda correctamente ruteado según la política vigente, sin estados huérfanos. Commit de implementación: `88c12fe`.
