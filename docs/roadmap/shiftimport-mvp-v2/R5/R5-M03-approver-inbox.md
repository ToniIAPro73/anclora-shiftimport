# R5-M03 — Approver Inbox

## 1. Objetivo

Dar a los aprobadores resueltos (R5-M01/M02) una vista donde ver sus `ApprovalRequest` pendientes y acceder a la decisión (R5-M04/M05).

## 2. Problema que resuelve

Sin bandeja, un aprobador no tiene forma de descubrir que existe una solicitud pendiente de su decisión.

## 3. Estado actual del repositorio

IMPLEMENTED — existe endpoint tenant-scoped y bandeja compacta en el dashboard para OWNER/ADMIN.

## 4. Alcance IN

- Listado de `approval_requests` en `PENDING` visibles para el usuario autenticado según resolución de aprobador.
- Detalle del Change Request asociado (qué turno, qué cambio se pide, quién lo pidió).

## 5. Alcance OUT

- Filtros avanzados o bandeja compartida multi-organización (fuera de alcance MVP).

## 6. Dependencias

R5-M02.

## 7. Decisiones arquitectónicas

La bandeja se implementa como una vista dentro del dashboard existente (no una página nueva independiente), consistente con la decisión de routing de R0-M05 sobre introducir router solo donde R3/R4 lo requieran; si R4 ya introdujo routing, esta vista se integra como ruta adicional.

## 8. Modelo de datos afectado

Ninguno nuevo — consulta sobre `approval_requests` + `change_requests` filtrando por aprobador elegible (recalculado en tiempo de consulta, no cacheado, para reflejar cambios de política/responsables en tiempo real).

## 9. API / Backend

`GET /api/approval-requests?status=pending` — filtra server-side por membership del caller (rol + área si aplica). Nunca confía en un `approverId` enviado por el cliente.

## 10. Frontend / UX

Nueva sección "Aprobaciones" en el dashboard, con badge de contador de pendientes. Estado vacío ("no tienes aprobaciones pendientes") y estado de carga.

## 11. Seguridad y autorización

El backend recalcula la elegibilidad del caller en cada request — nunca se confía en filtros de cliente.

## 12. i18n

Textos ES/EN para la sección, estado vacío, contador.

## 13. Accesibilidad

Lista navegable por teclado, contador anunciado por lector de pantalla (aria-live si actualiza en tiempo real).

## 14. Responsive / temas

Vista responsive, soporta dark/light heredado del sistema de diseño.

## 15. Observabilidad / errores

Error de carga muestra mensaje claro con reintento; no placeholder infinito.

## 16. Migraciones

N/A — sin cambios de esquema.

## 17. Compatibilidad y datos existentes

N/A — bandeja nace vacía hasta que existan Change Requests.

## 18. Tasks

### T01 — Endpoint listado de pendientes por aprobador

Objetivo: exponer `GET /api/approval-requests`.
Archivos: `api/approval-requests/index.js`.
Cambios: filtro server-side por elegibilidad real.
No hacer: no aceptar `approverId` como parámetro de filtro confiable.
Criterios de aceptación:
- [x] Un ADMIN de otra organización nunca ve solicitudes ajenas.
- [x] AREA_RESPONSIBLE solo ve solicitudes de sus áreas asignadas.
Tests: API test con matriz de roles/áreas.
Evidencia esperada: resultados de test.

### T02 — UI bandeja de aprobaciones

Objetivo: sección "Aprobaciones" con lista + detalle.
Archivos: `src/components/shift-dashboard/*` (nuevo componente).
Cambios: lista, badge contador, estado vacío/carga/error.
No hacer: no crear modal nuevo si el patrón de página/panel ya cubre el caso.
Criterios de aceptación:
- [x] Contador refleja el número real de pendientes.
- [x] Estado vacío, carga, error y reintento implementados.
Tests: componente + accesibilidad básica (axe).
Evidencia esperada: capturas ES/EN dark/light.

## 19. Tests obligatorios

API (matriz de elegibilidad), componente, accesibilidad (axe).

## 20. Evidencias

Resultados de test, capturas de la bandeja en los 4 combos idioma/tema.

## 21. Gate

Gates requeridos: G5 (functional), G6 (UX/UI), G7 (accessibility).

Resultado: **PASS**.

Validado:
- endpoint recalcula la elegibilidad con la política actual y `area_responsibles`; no acepta `approverId` como filtro de autoridad;
- tests API: aislamiento tenant, OWNER/ADMIN, AREA_RESPONSIBLE y rechazo EMPLOYEE;
- componente: 3 estados, contador, detalle de solicitud, retry y labels accesibles;
- suite completa: 134 archivos / 1196 tests PASS;
- lint, typecheck y build PASS (warning conocido de chunks grandes).

## 22. Rollback / remediación

Revertir componente y endpoint; no hay datos mutables en este microfase.

## 23. Criterio de DONE

CUMPLIDO. Cada aprobador ve exactamente sus solicitudes pendientes, ni más ni menos, verificado con matriz de roles/áreas. Commit de implementación: pendiente de cierre documental.
