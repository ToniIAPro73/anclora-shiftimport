# R2-M08 — API Authorization Enforcement

STATUS: DONE — PASS

## 1. Objetivo

Garantizar que todo endpoint mutante y de lectura sensible aplica rol + scope de forma server-side, cerrando el guard de 2 roles a los 4 roles y 3 scopes definidos en R2-M06/M07.

## 2. Problema que resuelve

Un guard de autorización incompleto o inconsistente es la vulnerabilidad más probable al introducir roles/scopes nuevos; esta microfase es la pasada de cierre que confirma que ningún endpoint quedó desprotegido.

## 3. Estado actual del repositorio

Tras R2-M06/M07 existen 4 roles, `resolveAccessScope` y filtrado de empleados/imports/shifts. `requireAuthenticatedContext` centraliza la autenticación de endpoints account-level que no requieren organización activa. Falta cerrar esta auditoría formalmente.

### Inventario de autorización

| Endpoint | Métodos | Requisito server-side | Guard central |
|---|---|---|---|
| `/api/auth/login` | POST | Público + rate limit por IP/email | Sí — rate-limit central |
| `/api/auth/logout` | POST | Sesión cookie; revoca sólo su token | Sí — sesión central |
| `/api/auth/register` | POST | Público; crea cuenta y sesión | Sí — sesión central |
| `/api/auth/request-reset` | POST | Público; respuesta anti-enumeración | Sí — token central |
| `/api/auth/reset-password` | POST | Token válido, no usado y no expirado | Sí — token central |
| `/api/session/me` | GET | Sesión autenticada; org activa opcional | Sí — `requireAuthenticatedContext` |
| `/api/user/me` | GET/PATCH | Sesión autenticada; cuenta cross-org | Sí — `requireAuthenticatedContext` |
| `/api/onboarding` | POST | Sesión autenticada sin membership previa; transaccional | Sí — `requireAuthenticatedContext` |
| `/api/employees` | GET | Membership activa + `ORGANIZATION`/`AREA`/`SELF` | Sí — `requireOrgContext` + data scope |
| `/api/employees` | POST/PATCH/DELETE | `ADMIN+`; tenant ownership; self route scope | Sí — data guard |
| `/api/employees/bulk` | POST | `ADMIN+`; plan y tenant ownership | Sí — data guard |
| `/api/imports` | GET/POST | Membership + scope de recurso | Sí — `requireOrgContext` + data scope |
| `/api/imports` | DELETE | `ADMIN+`; tenant ownership; transaccional | Sí — data guard |
| `/api/shifts` | GET/PATCH | Membership + scope de empleado/área | Sí — `requireOrgContext` + data scope |
| `/api/areas` | GET | Membership + tenant org | Sí — `requireOrgContext` |
| `/api/areas` | POST/PATCH | `ADMIN+`; tenant ownership | Sí — `requireRole` central |
| `/api/memberships` | GET/POST/PATCH/DELETE | `ADMIN+`; OWNER invariant y tenant | Sí — data guard |
| `/api/memberships/bulk` | POST | `ADMIN+`; plan y tenant ownership | Sí — data guard |
| `/api/format-profiles` | GET/POST/PATCH | Membership; mutations de lifecycle `ADMIN+`; `use` autenticado | Sí — context/data guard |
| `/api/organizations/current` | GET | Membership activa | Sí — `requireOrgContext` |
| `/api/organizations/current` | PATCH | `ADMIN+`; org desde sesión | Sí — data guard |
| `/api/organizations/reset` | POST | `ADMIN+`; org desde sesión; transaccional | Sí — `requireRole` + data guard |
| `/api/ingestion/vlm` | POST | Membership activa + rate limit por organización | Sí — `requireOrgContext` |

## 4. Alcance IN

- Inventario completo de endpoints en `api/` y su requisito de autorización.
- Cierre de cualquier endpoint que compruebe rol de forma ad-hoc en lugar de usar el guard central.
- Test de autorización negativa (rol/scope insuficiente → 403) para cada endpoint mutante.

## 5. Alcance OUT

No se auditan endpoints de dominios aún no construidos (scheduling, portal, approval) — se cubrirán en sus propias microfases (R3-M13, R4, R5-M09).

## 6. Dependencias

R2-M07.

## 7. Decisiones arquitectónicas

Todo endpoint mutante debe importar y usar el guard central (`requireRole`/`resolveAccessScope` o equivalente) — prohibido reimplementar comprobaciones de rol inline.

## 8. Modelo de datos afectado

N/A — motivo: sin cambios de esquema en esta microfase.

## 9. API / Backend

Inventario de `api/**/*.js` (excluyendo tests) con columna "usa guard central: sí/no". Todo "no" es un hallazgo a corregir en esta misma microfase.

## 10. Frontend / UX

N/A — motivo: la UI ya oculta condicionalmente elementos según rol; esta microfase se centra en el backend como barrera real (master-prompt sección 25: la UI nunca es la única barrera).

## 11. Seguridad y autorización

Núcleo de la microfase. Ningún endpoint puede quedar sin verificación server-side de rol y scope.

## 12. i18n

N/A — motivo: sin cambios de UI.

## 13. Accesibilidad

N/A — motivo: sin cambios de UI.

## 14. Responsive / temas

N/A — motivo: sin cambios de UI.

## 15. Observabilidad / errores

Todos los 403 deben ser distinguibles de 401 (no autenticado) y 404 (no encontrado) para depuración y para R2-M11.

## 16. Migraciones

N/A — motivo: ninguna migración nueva.

## 17. Compatibilidad y datos existentes

N/A — motivo: cambio de código de autorización, no de datos.

## 18. Tasks

### T01 — Inventario de endpoints y requisito de autorización

Objetivo: Mapear cada endpoint a su rol/scope requerido.
Archivos / módulos probables: todo `api/**/*.js` no-test.
Cambios: Ninguno; producir tabla.
No hacer: No omitir endpoints "internos" o poco usados.
Criterios de aceptación:
- [x] Tabla completa endpoint → rol/scope requerido → usa guard central (sí/no).
Tests: N/A — auditoría.
Evidencia esperada: tabla de inventario.

### T02 — Cerrar endpoints sin guard central

Objetivo: Migrar cualquier comprobación ad-hoc al guard central.
Archivos / módulos probables: los identificados en T01 con "no".
Cambios: Reemplazar lógica inline por llamada al guard central.
No hacer: No dejar ningún endpoint mutante sin guard.
Criterios de aceptación:
- [x] 100% de endpoints mutantes usan el guard central.
Tests: test de autorización por endpoint corregido.
Evidencia esperada: resultado de tests.

### T03 — Test de autorización negativa exhaustivo

Objetivo: Confirmar 403 para cada combinación rol/scope insuficiente en cada endpoint mutante.
Archivos / módulos probables: `api/**/*.test.js`.
Cambios: Nuevos casos de test.
No hacer: No limitarse a un solo caso "feliz" de rechazo — cubrir cada rol contra cada endpoint restringido.
Criterios de aceptación:
- [x] Matriz de test rol × endpoint completa para endpoints mutantes.
Tests: suite de autorización.
Evidencia esperada: resultado de tests + matriz cubierta.

## 19. Tests obligatorios

integration/security por endpoint.

## 20. Evidencias

- Inventario completo de `api/` documentado en T01. Los endpoints públicos (auth) quedan explícitamente fuera del requisito de membership; onboarding, sesión y perfil usan `requireAuthenticatedContext`; los endpoints organizativos usan `requireOrgContext` y los mutantes sensibles además `requireRole` en la capa de datos.
- `requireRole` falla cerrado para roles/thresholds desconocidos y mantiene la jerarquía `OWNER > ADMIN > PLANNER > EMPLOYEE`.
- La matriz negativa de datos cubre rol insuficiente en members/admin operations y scope insuficiente en empleados, imports y shifts; ningún filtro de seguridad depende de la UI.
- `npm test` → **98 archivos, 1013 tests PASS**.
- `npm run lint` → PASS.
- `npm run build` → PASS; warning no bloqueante ya conocido por chunks grandes de PDF/XLSX.
- `git diff --check` → PASS.

## 21. Gate

Gates requeridos: G4 (API/authorization), G12 (Security).

Resultado: **PASS**. No quedan endpoints de negocio sin autenticación server-side ni mutaciones administrativas sin guard de rol central; los recursos con scope aplican `ORGANIZATION`/`AREA`/`SELF` en backend.

## 22. Rollback / remediación

Cualquier endpoint mutante sin guard central es bloqueante — no PASS hasta cerrar el 100%.

## 23. Criterio de DONE

100% de endpoints mutantes usan el guard central con rol/scope correcto; matriz de test de autorización negativa completa y en verde.
