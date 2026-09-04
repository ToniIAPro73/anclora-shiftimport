# R5-M09 — Authorization

## 1. Objetivo

Consolidar y verificar de forma exhaustiva que toda operación del dominio Approval (M01-M08) está correctamente autorizada en el backend, cerrando cualquier vía de bypass vía UI.

## 2. Problema que resuelve

Cada microfase anterior implementó su propia verificación puntual; R5-M09 es la pasada de consolidación y verificación cruzada exigida antes de declarar R5 cerrado, análoga a R2-M08 para el dominio de organización.

## 3. Estado actual del repositorio

MISSING — depende de todo R5-M01..M08.

## 4. Alcance IN

- Matriz de autorización completa: acción × rol × scope para cada endpoint de Approval.
- Verificación de que ningún endpoint confía en un valor de rol/área enviado por el cliente.

## 5. Alcance OUT

- Nuevas features — este microfase es puramente de verificación y endurecimiento.

## 6. Dependencias

R5-M01..M08, R2-M08 (API Authorization Enforcement, patrón a reutilizar).

## 7. Decisiones arquitectónicas

Se reutiliza el mismo middleware/guard de autorización introducido en R2-M08 (no se crea un segundo sistema de permisos específico de Approval) — Approval solo añade sus propias reglas de elegibilidad (resolveApprovers) sobre la capa base de rol/scope.

## 8. Modelo de datos afectado

N/A — sin cambios de esquema.

## 9. API / Backend

Todos los endpoints de R5-M01..M08 pasan por el guard común + verificación de elegibilidad específica de Approval.

## 10. Frontend / UX

N/A — sin cambios de UI; la UI ya oculta acciones no permitidas, pero eso no sustituye la verificación de backend (principio de master-prompt §25).

## 11. Seguridad y autorización

Este es el foco íntegro del microfase. Ver Tasks.

## 12. i18n

N/A.

## 13. Accesibilidad

N/A.

## 14. Responsive / temas

N/A.

## 15. Observabilidad / errores

Todo 403 debe loguearse con el motivo exacto (rol insuficiente / scope incorrecto / no elegible por política) para poder auditar intentos de bypass.

## 16. Migraciones

N/A.

## 17. Compatibilidad y datos existentes

N/A.

## 18. Tasks

### T01 — Matriz de autorización Approval

Objetivo: documentar acción × rol × scope para approval-policy, area-responsibles, approve, reject, inbox.
Archivos: documento de spec + tests que la verifiquen.
Cambios: tabla explícita.
No hacer: no dejar ninguna celda "no probado".
Criterios de aceptación:
- [ ] Cada combinación tiene un test correspondiente.
Tests: matriz completa.
Evidencia esperada: tabla + referencias a los tests.

### T02 — Test de bypass directo de API (sin pasar por UI)

Objetivo: verificar que ningún endpoint de R5 confía en datos de rol/área enviados por el cliente.
Archivos: `api/**/*.test.js`.
Cambios: tests que llaman a los endpoints directamente con payloads adversariales (p. ej. `approverId` falso, rol reclamado en el body).
No hacer: no marcar como PASS sin al menos un intento de bypass por endpoint.
Criterios de aceptación:
- [ ] Todo intento de bypass es rechazado con 401/403.
Tests: incluidos arriba.
Evidencia esperada: resultados de test.

### T03 — Cross-tenant isolation para Approval

Objetivo: verificar que un usuario de la organización A nunca puede ver/decidir una `ApprovalRequest` de la organización B.
Archivos: test de integración dedicado.
Cambios: fixture con 2 organizaciones.
No hacer: no reutilizar sesión/tenant entre los dos casos del test.
Criterios de aceptación:
- [ ] 0 filtraciones cross-tenant detectadas.
Tests: incluido arriba.
Evidencia esperada: resultado de test.

## 19. Tests obligatorios

Matriz completa de autorización, bypass de API, aislamiento cross-tenant.

## 20. Evidencias

Tabla de matriz + resultados de todos los tests referenciados.

## 21. Gate

Gates requeridos: G4 (API/authorization), G12 (security).
PASS solo si el 100% de la matriz está cubierta por test y ningún bypass tiene éxito.

## 22. Rollback / remediación

Si se detecta un hueco de autorización, no hay commit — se corrige y se repite el Gate (regla general de la política de commits del master prompt).

## 23. Criterio de DONE

Matriz de autorización 100% cubierta por test, cero bypasses posibles, cero filtraciones cross-tenant.
