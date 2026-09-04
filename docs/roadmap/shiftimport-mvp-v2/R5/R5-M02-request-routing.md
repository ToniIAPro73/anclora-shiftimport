# R5-M02 — Request Routing

## 1. Objetivo

Cuando se crea un Change Request (R4-M06), determinar automáticamente si necesita aprobación y, si sí, crear la `ApprovalRequest` y notificar a los aprobadores resueltos por R5-M01.

## 2. Problema que resuelve

Sin ruteo automático, cada Change Request quedaría huérfano de decisión. R5-M02 conecta la creación del Change Request con la política vigente.

## 3. Estado actual del repositorio

MISSING — depende de R4-M06 (Change Request, MISSING) y R5-M01 (ApprovalPolicy).

## 4. Alcance IN

- Trigger de ruteo en el momento de creación del Change Request.
- Creación de `ApprovalRequest` en estado `PENDING` cuando la política no es `NO_APPROVAL`.
- Aplicación automática (sin ApprovalRequest) cuando la política es `NO_APPROVAL` — delega a R5-M07 con "auto-aprobado".

## 5. Alcance OUT

- Reglas de ruteo condicionales por tipo de cambio (una sola política por org, ya decidido en R5-M01).

## 6. Dependencias

R5-M01, R4-M06.

## 7. Decisiones arquitectónicas

El ruteo ocurre síncronamente en la misma transacción que crea el Change Request (evita estados intermedios "creado sin decisión de ruteo"). Si `NO_APPROVAL`, se marca el Change Request como aprobado automáticamente y se invoca el mismo camino de aplicación que R5-M07, para no duplicar lógica de aplicación.

## 8. Modelo de datos afectado

Nueva tabla `approval_requests (id, organization_id, change_request_id UNIQUE, status, policy_snapshot, created_at)`. `policy_snapshot` congela la política vigente al momento de creación (evita que un cambio de política a mitad de camino altere una decisión ya en curso).

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
- [ ] Constraint UNIQUE aplicado y probado.
Tests: migration test.
Evidencia esperada: resultado de migración.

### T02 — Integrar ruteo en creación de Change Request

Objetivo: al crear el Change Request, decidir política y crear/omitir ApprovalRequest en la misma transacción.
Archivos: módulo de Change Request (definido en R4-M06).
Cambios: llamar a `resolveApprovers` + crear `approval_requests` o aplicar auto-aprobación.
No hacer: no crear el Change Request y el ruteo en transacciones separadas (riesgo de estado inconsistente).
Criterios de aceptación:
- [ ] `NO_APPROVAL` aplica el cambio automáticamente sin fila en `approval_requests`.
- [ ] Otras políticas crean `approval_requests` en `PENDING`.
- [ ] Fallo de la transacción no deja Change Request sin ruteo.
Tests: integración cubriendo las 3 políticas.
Evidencia esperada: resultados de test.

### T03 — Manejo de caso borde sin aprobador

Objetivo: registrar advertencia si no hay aprobador resoluble.
Archivos: mismo módulo.
Cambios: log estructurado, no excepción no controlada.
No hacer: no bloquear la creación del Change Request por este caso borde.
Criterios de aceptación:
- [ ] Caso simulado (organización sin ADMIN) no rompe la request; queda registrado.
Tests: unit test del caso borde.
Evidencia esperada: log de test.

## 19. Tests obligatorios

Integración (las 3 políticas), unit (caso borde sin aprobador).

## 20. Evidencias

Resultados de tests de integración.

## 21. Gate

Gates requeridos: G3 (domain invariants), G5 (functional).
PASS si las 3 políticas rutean correctamente y el caso borde no causa fallo no controlado.

## 22. Rollback / remediación

Rollback lógico: vaciar `approval_requests` si se detecta ruteo incorrecto en piloto; no afecta `change_requests` en sí.

## 23. Criterio de DONE

Todo Change Request nuevo queda correctamente ruteado según la política vigente, sin estados huérfanos.
