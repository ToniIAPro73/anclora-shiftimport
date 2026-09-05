# R5-M01 — ApprovalPolicy

## 1. Objetivo

Definir e implementar las tres políticas fijas de aprobación: `NO_APPROVAL`, `AREA_RESPONSIBLE`, `ORGANIZATION_ADMIN`, sin motor de workflow configurable.

## 2. Problema que resuelve

Sin política, todo Change Request quedaría o bien auto-aplicado (riesgo operativo) o bien bloqueado indefinidamente. Se necesita una regla determinista y auditable para decidir si un cambio requiere aprobación y de quién.

## 3. Estado actual del repositorio

IMPLEMENTED — `approval_policy` y `area_responsibles` se han añadido con migración forward-safe; las APIs, el resolver puro y las superficies de Settings/Areas están implementados y cubiertos por tests.

## 4. Alcance IN

- Tabla/columna `approval_policy` a nivel de organización (y opcionalmente de área, ver decisión abajo).
- Resolución de aprobador(es) elegibles para `AREA_RESPONSIBLE` y `ORGANIZATION_ADMIN`.
- Default de política cuando no se ha configurado explícitamente: `NO_APPROVAL` (para no bloquear pilotos tempranos).

## 5. Alcance OUT

- Editor visual de políticas o reglas condicionales arbitrarias (eso sería un Workflow Builder, R6).
- Cadenas de delegación (R9).
- Políticas por tipo de cambio (solo una política por organización/área en el MVP).

## 6. Dependencias

R5-M00, R2-M07 (scopes ORGANIZATION/AREA/SELF), R2-M03 (Areas).

## 7. Decisiones arquitectónicas

**Decisión de AREA_RESPONSIBLE (requiere sign-off de producto):** No se introduce `ReportingLine` (R9). En su lugar: `AREA_RESPONSIBLE` resuelve a "cualquier membership con rol ADMIN cuyo `area_id` (nueva columna nullable en `memberships`, o tabla `area_responsibles` de mapeo N:N si un área necesita más de un responsable) coincida con el área del Change Request; si el área no tiene responsable designado, cae a cualquier ADMIN de la organización (mismo comportamiento que ORGANIZATION_ADMIN)". Esto evita bloquear organizaciones que no han configurado responsables de área todavía.

Se prefiere una tabla de mapeo `area_responsibles (area_id, user_id)` sobre una columna en `memberships`, porque una persona puede ser responsable de más de un área sin necesitar múltiples memberships.

La política se almacena en `organizations.approval_policy` (enum) como default de organización; no se permite override por área en el MVP (mantiene "Approval Lite" simple) — si una organización pilota necesita política por área, queda documentado como extensión natural post-MVP.

## 8. Modelo de datos afectado

- `organizations`: nueva columna `approval_policy TEXT NOT NULL DEFAULT 'NO_APPROVAL' CHECK (approval_policy IN ('NO_APPROVAL','AREA_RESPONSIBLE','ORGANIZATION_ADMIN'))`.
- Nueva tabla `area_responsibles (area_id UUID REFERENCES areas(id), user_id UUID REFERENCES users(id), organization_id UUID, PRIMARY KEY (area_id, user_id))`.

## 9. API / Backend

- `GET/PUT /api/organizations/:id/approval-policy` — solo OWNER/ADMIN pueden leer/escribir.
- `GET/POST/DELETE /api/areas/:id/responsibles` — gestión del mapeo área→responsable.

## 10. Frontend / UX

- Selector de política en Organization Settings (extiende R2-M01).
- Gestión de responsables de área dentro de la vista de Areas (extiende R2-M03 UI).

## 11. Seguridad y autorización

Solo OWNER/ADMIN (scope ORGANIZATION) pueden cambiar `approval_policy` o `area_responsibles`. Verificación server-side obligatoria (nunca solo UI).

## 12. i18n

Etiquetas de las 3 políticas y textos de ayuda en ES/EN, siguiendo `docs/standards` de localización.

## 13. Accesibilidad

Selector de política y gestión de responsables navegables por teclado, con labels asociados.

## 14. Responsive / temas

Reutiliza componentes existentes de Organization Settings/Areas — hereda su soporte dark/light y responsive.

## 15. Observabilidad / errores

Errores de escritura (constraint violation, usuario sin permisos) devuelven mensaje claro; no hay estado "loading" prolongado esperado (operación simple).

## 16. Migraciones

Nueva migración: columna `approval_policy` en `organizations` + tabla `area_responsibles`. Forward-safe, default `NO_APPROVAL` no rompe organizaciones existentes.

## 17. Compatibilidad y datos existentes

Todas las organizaciones existentes quedan en `NO_APPROVAL` tras la migración — comportamiento equivalente al actual (ningún approval gate existe hoy).

## 18. Tasks

### T01 — Migración `approval_policy` + `area_responsibles`

Objetivo: crear esquema.
Archivos: `db/migrations/00XX_approval_policy.sql`.
Cambios: columna + tabla + índices.
No hacer: no añadir política por área todavía.
Criterios de aceptación:
- [ ] Migración aplica limpia sobre datos existentes.
- [ ] Default `NO_APPROVAL` verificado.
Tests: migration test (`db/**/*.test.mjs`).
Evidencia esperada: resultado de migración en Neon dev.

### T02 — API approval-policy CRUD

Objetivo: exponer lectura/escritura de política.
Archivos: `api/organizations/[id]/approval-policy.js` (o equivalente convención del repo).
Cambios: endpoint con guard OWNER/ADMIN.
No hacer: no exponer a EMPLOYEE.
Criterios de aceptación:
- [ ] GET devuelve política actual.
- [ ] PUT rechaza valores fuera del enum.
- [ ] PUT rechaza si el caller no es OWNER/ADMIN (403).
Tests: `api/**/*.test.js` con casos de rol.
Evidencia esperada: respuestas de test.

### T03 — API area_responsibles CRUD

Objetivo: gestionar responsables por área.
Archivos: `api/areas/[id]/responsibles.js`.
Cambios: GET/POST/DELETE con guard OWNER/ADMIN.
No hacer: no permitir asignar usuarios de otra organización (cross-tenant).
Criterios de aceptación:
- [ ] Asignar responsable de área de otra organización es rechazado.
- [ ] Un área puede tener 0 o N responsables.
Tests: incluye caso cross-tenant.
Evidencia esperada: test de aislamiento.

### T04 — UI selector de política + gestión de responsables

Objetivo: exponer en Organization Settings / Areas.
Archivos: `src/components/shift-dashboard/*` (Organization Settings, Areas).
Cambios: selector + tabla de responsables.
No hacer: no crear un modal nuevo si `ModalShell` cubre el caso.
Criterios de aceptación:
- [ ] Cambio de política persiste y se refleja tras reload.
- [ ] EMPLOYEE no ve el control.
Tests: componente + E2E básico.
Evidencia esperada: captura antes/después.

### T05 — Resolución de aprobador elegible (función pura)

Objetivo: función `resolveApprovers(changeRequest, policy)` reutilizable por R5-M02 (routing).
Archivos: `api/_lib/data.js` o módulo dedicado (ver decisión de R0-M05 sobre boundaries).
Cambios: implementar lógica de fallback descrita en sección 7.
No hacer: no acoplar esta función a la UI.
Criterios de aceptación:
- [ ] `AREA_RESPONSIBLE` sin responsable configurado cae a cualquier ADMIN.
- [ ] `ORGANIZATION_ADMIN` devuelve todos los ADMIN de la organización.
- [ ] `NO_APPROVAL` devuelve lista vacía (indica auto-aplicación).
Tests: unit tests de la función pura, todos los casos de fallback.
Evidencia esperada: resultados de test.

## 19. Tests obligatorios

Unit (resolución de política), API (autorización y CRUD), integración (migración + datos existentes en NO_APPROVAL).

## 20. Evidencias

Resultados de migración, resultados de tests, capturas UI ES/EN dark/light.

## 21. Gate

Gates requeridos: G2 (DB/migrations), G3 (domain invariants).

Resultado: **PASS**.

Validado:
- migración aplicada en Neon development; `organizations.approval_policy` NOT NULL con default `NO_APPROVAL` y CHECK de las tres políticas;
- `area_responsibles` creada con PK, FKs e índices; las 8 organizaciones existentes permanecen en `NO_APPROVAL`;
- resolver puro: 3 tests PASS, incluyendo fallback de `AREA_RESPONSIBLE`;
- APIs de política y responsables: 8 tests PASS, incluyendo autorización y aislamiento tenant;
- UI/API/DB focalizados: 63 tests PASS;
- suite completa: 132 archivos / 1185 tests PASS;
- lint, typecheck y build PASS (build conserva únicamente el warning existente de chunks grandes).

## 22. Rollback / remediación

Rollback lógico: revertir organizaciones a `NO_APPROVAL` (ya es el default); tabla `area_responsibles` puede vaciarse sin pérdida de datos operativos (no hay Change Requests aún dependientes en el momento de este microfase).

## 23. Criterio de DONE

CUMPLIDO. Las 3 políticas están implementadas, la resolución de aprobador está probada en todos los casos de fallback, y ninguna organización existente cambia de comportamiento tras el despliegue (todas quedan en `NO_APPROVAL`). Commit de implementación: `b1a6803`.
