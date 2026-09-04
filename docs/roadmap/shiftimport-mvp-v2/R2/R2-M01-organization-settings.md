# R2-M01 — Organization Settings

STATUS: DONE (era PARTIAL — endpoint + UI de edición de nombre implementados en esta microfase)

## 1. Objetivo

Cerrar la superficie de configuración de organización (nombre, plan, y cualquier otro ajuste editable) con autorización correcta, verificando y completando lo que ya existe en `api/organizations/reset.js` y `api/onboarding.js`.

## 2. Problema que resuelve

Hoy no está confirmado qué campos de `organizations` son editables, por quién, ni si existe un endpoint de "settings" coherente fuera de reset/onboarding. Sin esto, R2-M06/M07 (roles/scopes) no tienen una superficie estable donde aplicar autorización.

## 3. Estado actual del repositorio

STATUS: era PARTIAL, ahora DONE — brecha real confirmada y cerrada.

### T01 — Hallazgo

- Tabla `organizations`: `id`, `name`, `plan` (`free/personal/team`, migración 0004), `updated_at` (`0001_init.sql:10`).
- `api/organizations/reset.js` existe (propósito: reset destructivo, no edición general).
- `api/onboarding.js` crea la organización inicial.
- **Confirmado**: no existía ningún endpoint ni función de `data.js` para editar `organizations.name` tras la creación (`grep` de `UPDATE organizations`/`updateOrganization` sin resultados). Brecha real, no asumida.

### T02/T03 — Implementado

- `api/_lib/data.js`: `updateOrganizationName(sql, ctx, rawName)` — `requireRole(ctx, 'ADMIN')`, valida nombre no vacío (400), `UPDATE organizations SET name = ... WHERE id = ${ctx.organizationId}` (404 si no existe — no debería pasar en la práctica dado que `ctx.organizationId` viene de una membership válida, pero se maneja explícitamente).
- `api/organizations/current.js` (nuevo): `GET` (cualquier rol, deriva de `ctx.memberships`/`ctx.plan` sin consulta extra a BD) + `PATCH` (ADMIN, llama a `updateOrganizationName`). Ruta `/api/organizations/current` — sin selector de organización arbitraria, coherente con la decisión arquitectónica ya fijada.
- `src/lib/remote.ts`: `updateRemoteOrganizationName(name)`, tipo `RemoteOrganization`.
- `SettingsModal.tsx` (pestaña "Equipo", ya existente — reutilizado, ningún modal nuevo): el campo de nombre de organización, antes texto de solo lectura, ahora es editable para ADMIN (input + botón "Guardar cambios", estados loading/saved/error, patrón idéntico al ya usado para el nombre de cuenta). Para no-ADMIN permanece de solo lectura (defensa en profundidad — en la práctica EMPLOYEE nunca alcanza esta pestaña, `getAvailableTabs`).
- `App.tsx`: `onOrganizationNameChange` re-obtiene la sesión (mismo patrón que `onAccountNameChange`) para reflejar el nuevo nombre en toda la UI sin recargar página.

`plan` deliberadamente no editable (Alcance OUT — sin integración de facturación en el MVP).

## 4. Alcance IN

- Auditar endpoints existentes relacionados con organización.
- Si falta, crear endpoint de edición de `name` (edición de `plan` queda fuera si no hay billing — ver Alcance OUT).
- Autorización: solo OWNER/ADMIN puede editar (dependiente de R0-M03/R2-M06 para el rol OWNER; mientras tanto, ADMIN).

## 5. Alcance OUT

- Cambios de `plan` ligados a facturación — fuera de MVP, no hay integración de pagos confirmada en este roadmap.
- Eliminación de organización — cubierto (si existe) por `reset.js`, no se toca aquí salvo que la auditoría encuentre un bug.

## 6. Dependencias

R2-M00.

## 7. Decisiones arquitectónicas

Mantener el endpoint de settings simple: un único `PATCH /api/organizations/current` operando sobre la organización de la sesión, sin selector de organización arbitraria (evita necesidad de scope adicional).

## 8. Modelo de datos afectado

`organizations.name` — sin cambio de esquema si el campo ya existe y es editable a nivel DB; solo falta (si falta) el endpoint.

## 9. API / Backend

- Auditar `api/organizations/reset.js`, `api/onboarding.js`.
- Si no existe, añadir `PATCH /api/organizations/current` con validación de nombre no vacío y autorización ADMIN/OWNER.

## 10. Frontend / UX

Formulario simple de edición de nombre de organización en el panel de administración existente (ubicación exacta a determinar tras localizar el panel admin en `src/components/shift-dashboard/`). Debe incluir estado loading/error/success.

## 11. Seguridad y autorización

Solo ADMIN (u OWNER cuando R2-M06 esté implementado) puede modificar. Verificación server-side obligatoria, no solo ocultar el botón en UI (master-prompt sección 25).

## 12. i18n

Textos del formulario en `src/lib/i18n.ts` con claves ES/EN, verificados por `i18n-coverage.test.ts`.

## 13. Accesibilidad

Formulario con `label` asociado, foco visible, mensaje de error anunciado (aria-live si aplica).

## 14. Responsive / temas

Formulario debe funcionar en light/dark y en breakpoints móvil/desktop existentes en el resto del panel admin.

## 15. Observabilidad / errores

Respuesta de error clara si el nombre es inválido o si el usuario no tiene permiso (403 explícito, no genérico 500).

## 16. Migraciones

N/A — motivo: no requiere cambio de esquema si `organizations.name` ya es editable a nivel de columna (confirmar en T01).

## 17. Compatibilidad y datos existentes

Ninguna organización existente se ve afectada por añadir un endpoint de edición; no hay migración de datos.

## 18. Tasks

### T01 — Auditar superficie de settings existente

Objetivo: Confirmar qué es editable hoy y por qué endpoint.
Archivos / módulos probables: `api/organizations/reset.js`, `api/onboarding.js`, `api/_lib/data.js`.
Cambios: Ninguno; documentar hallazgos.
No hacer: No asumir sin leer el código.
Criterios de aceptación:
- [x] Lista de campos editables hoy y endpoint responsable (ver sección 3) — ninguno, confirmado.
Tests: N/A — auditoría.
Evidencia esperada: Tabla de hallazgos (sección 3).

### T02 — Endpoint PATCH /api/organizations/current

Objetivo: Permitir editar `name` de la organización de sesión.
Archivos / módulos probables: nuevo o extendido en `api/organizations/`, `api/_lib/auth.js`, `api/_lib/data.js`.
Cambios: Nuevo handler con validación + guard de rol.
No hacer: No exponer edición de `plan` (fuera de alcance).
Criterios de aceptación:
- [x] 200 con nombre válido y rol autorizado.
- [x] 403 con rol no autorizado.
- [x] 400 con nombre vacío.
- [x] 404 sin fuga cross-tenant (organización de otro tenant).
Tests: `api/_lib/data.test.js` — describe "organization settings (R2-M01)", 4 casos nuevos, todos en verde.
Evidencia esperada: `npm test` en verde (ver sección 20).

### T03 — UI de edición

Objetivo: Formulario en panel admin.
Archivos / módulos probables: `src/components/shift-dashboard/*`.
Cambios: Nuevo formulario controlado, estados loading/error/success.
No hacer: No introducir modal nuevo sin revisar `ModalShell` existente (master-prompt sección 23).
Criterios de aceptación:
- [x] Formulario visible solo a rol autorizado (ADMIN; reutiliza `SettingsModal`/pestaña "Equipo" existente, sin modal nuevo).
- [x] Éxito refresca el nombre mostrado en la app sin recargar página (`onOrganizationNameChange` re-fetch de sesión).
Tests: `SettingsModal.test.tsx` — describe "organization name (R2-M01)", 3 casos nuevos, todos en verde.
Evidencia esperada: `npm test` en verde (ver sección 20).

### T04 — i18n y accesibilidad

Objetivo: Cerrar claves ES/EN y verificar accesibilidad básica.
Archivos / módulos probables: `src/lib/i18n.ts`.
Cambios: Nuevas claves.
No hacer: No dejar claves huérfanas.
Criterios de aceptación:
- [x] `i18n-coverage.test.ts` pasa (parte de la suite completa).
- [x] Foco visible y label asociado verificado — `<label htmlFor="settings-org-name">` + `.modal-input` sin `outline:none` (mismo patrón ya verificado en R1-M04).
Tests: `i18n-coverage.test.ts`.
Evidencia esperada: `npm test` en verde.

## 19. Tests obligatorios

unit (endpoint), component (formulario), i18n coverage.

## 20. Evidencias

`npm test`: 96 archivos, 990 tests, todos en verde (983 + 7 nuevos: 4 backend + 3 frontend). `npm run build`, `npm run lint`: en verde. Tabla de hallazgos T01 en sección 3.

## 21. Gate

Gates requeridos: G4 (API/authorization), G6 (UX/UI), G10 (Unit/integration tests).

Resultado: **PASS**. Brecha real confirmada (T01) y cerrada (T02/T03/T04) con autorización server-side (`requireRole(ctx, 'ADMIN')`, no solo UI), aislamiento cross-tenant (`ctx.organizationId` de sesión, nunca de request), y cobertura de test para los 4 escenarios de autorización más 3 de UI.

## 22. Rollback / remediación

Si el Gate falla en autorización, revertir el endpoint nuevo (feature aislada, sin dependientes) y devolver a estado previo sin editar `plan`.

## 23. Criterio de DONE

Endpoint y UI de edición de nombre de organización funcionando, protegidos server-side, con tests y claves i18n cerradas.
