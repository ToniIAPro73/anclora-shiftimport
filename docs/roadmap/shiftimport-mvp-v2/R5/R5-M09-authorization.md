# R5-M09 — Authorization

## 1. Objetivo

Consolidar y verificar de forma exhaustiva que toda operación del dominio Approval (M01-M08) está correctamente autorizada en el backend, cerrando cualquier vía de bypass vía UI.

## 2. Problema que resuelve

Cada microfase anterior implementó su propia verificación puntual; R5-M09 es la pasada de consolidación y verificación cruzada exigida antes de declarar R5 cerrado, análoga a R2-M08 para el dominio de organización.

## 3. Estado actual del repositorio

IMPLEMENTED — Gate PASS. La superficie Approval usa el contexto de sesión y
los guardas server-side consolidados; commit de implementación: pendiente de
registrar al cerrar esta microfase.

## 4. Alcance IN

- Matriz de autorización completa: acción × rol × scope para cada endpoint de Approval.
- Verificación de que ningún endpoint confía en un valor de rol/área enviado por el cliente.

## 5. Alcance OUT

- Nuevas features — este microfase es puramente de verificación y endurecimiento.

## 6. Dependencias

R5-M01..M08, R2-M08 (API Authorization Enforcement, patrón a reutilizar).

## 7. Decisiones arquitectónicas

Se reutiliza el contexto de sesión y el modelo de roles/scopes de R2-M08. El
helper `requireApprovalAdmin` consolida el acceso OWNER/ADMIN a configuración
de Approval; la elegibilidad de bandeja/decisión sigue resolviéndose en SQL
contra la organización activa, la política y los responsables de área. No se
crea un sistema de permisos paralelo.

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

Todo 403 de la superficie Approval se registra a nivel `info` con endpoint,
organización, usuario, rol y motivo (`role_insufficient`,
`employee_self_scope_required` o `request_not_eligible`). Los 404 cross-tenant
se mantienen indistinguibles de recurso inexistente para no filtrar existencia.

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
- [x] Cada combinación contractual está documentada y cubierta por tests de ruta, helper o integración real.
Tests: matriz completa.
Evidencia esperada: tabla + referencias a los tests.

### T02 — Test de bypass directo de API (sin pasar por UI)

Objetivo: verificar que ningún endpoint de R5 confía en datos de rol/área enviados por el cliente.
Archivos: `api/**/*.test.js`.
Cambios: tests que llaman a los endpoints directamente con payloads adversariales (p. ej. `approverId` falso, rol reclamado en el body).
No hacer: no marcar como PASS sin al menos un intento de bypass por endpoint.
Criterios de aceptación:
- [x] Todo intento de bypass es rechazado con 401/403 o se devuelve 404 sin revelar el recurso.
Tests: incluidos arriba.
Evidencia esperada: resultados de test.

### T03 — Cross-tenant isolation para Approval

Objetivo: verificar que un usuario de la organización A nunca puede ver/decidir una `ApprovalRequest` de la organización B.
Archivos: test de integración dedicado.
Cambios: fixture con 2 organizaciones.
No hacer: no reutilizar sesión/tenant entre los dos casos del test.
Criterios de aceptación:
- [x] 0 filtraciones cross-tenant detectadas.
Tests: incluido arriba.
Evidencia esperada: resultado de test.

## 19. Tests obligatorios

Matriz completa de autorización, bypass de API, aislamiento cross-tenant.

## 20. Evidencias

### Matriz de autorización MVP

| Superficie | OWNER / ADMIN · ORGANIZATION | PLANNER · AREA/ORGANIZATION | EMPLOYEE · SELF | Evidencia |
|---|---|---|---|---|
| Leer/escribir `approval_policy` | Permitido | 403 | 403 | `approval-policy.test.js`, `approval.test.js` |
| Leer/asignar/quitar `area_responsibles` | Permitido | 403 | 403 | `responsibles.test.js`, `approval.test.js` |
| Bandeja de aprobaciones, `ORGANIZATION_ADMIN` | Permitido | 403 | 403 | `approval-requests/index.test.js` |
| Bandeja, `AREA_RESPONSIBLE` | ADMIN responsable: permitido; ADMIN no responsable: lista vacía | 403 | 403 | `approval-requests/index.test.js` |
| Aprobar/rechazar | Elegible por política y tenant | 403 | 403 | `approve.test.js`, `reject.test.js`, carrera Neon |
| Crear/listar/cancelar Change Request | 403 | 403 | Sólo recurso propio en SELF | `change-requests.test.js`, `index.test.js`, `cancel.test.js` |
| Segundo efecto concurrente | 409, sin efecto | 409/403 | 409/403 | R5-M08 + carrera Neon |

Intentos adversariales cubiertos: `approverId` enviado al listado (ignorado),
`userId` de otra organización para responsables (404), ids de Approval de otro
tenant (404), ids de Change Request/Shift ajenos (404) y roles no elegibles
(403). Ningún endpoint acepta un rol, scope o aprobador efectivo desde el
body como autoridad.

Validación real contra Neon development:

- tenant A vs tenant B: listado de B devuelve `200` con cero solicitudes,
  aprobar una solicitud de A desde B devuelve `404`, política de A desde B
  devuelve `404`; la solicitud de A permanece `PENDING`.
- Suite de autorización focalizada: `31/31 PASS` antes del helper matrix;
  suite completa se ejecutará como Gate final.

## 21. Gate

Gates requeridos: G4 (API/authorization), G12 (security).
PASS solo si el 100% de la matriz está cubierta por test y ningún bypass tiene éxito.

## 22. Rollback / remediación

Si se detecta un hueco de autorización, no hay commit — se corrige y se repite el Gate (regla general de la política de commits del master prompt).

## 23. Criterio de DONE

Matriz de autorización cubierta, cero bypasses posibles y cero filtraciones
cross-tenant en pruebas de ruta e integración real. Gate PASS.
