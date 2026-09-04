# R2-M01 — Organization Settings

STATUS: PARTIAL

## 1. Objetivo

Cerrar la superficie de configuración de organización (nombre, plan, y cualquier otro ajuste editable) con autorización correcta, verificando y completando lo que ya existe en `api/organizations/reset.js` y `api/onboarding.js`.

## 2. Problema que resuelve

Hoy no está confirmado qué campos de `organizations` son editables, por quién, ni si existe un endpoint de "settings" coherente fuera de reset/onboarding. Sin esto, R2-M06/M07 (roles/scopes) no tienen una superficie estable donde aplicar autorización.

## 3. Estado actual del repositorio

- Tabla `organizations`: `id`, `name`, `plan` (`free/personal/team`, migración 0004).
- `api/organizations/reset.js` existe (propósito: reset, no edición general).
- `api/onboarding.js` crea la organización inicial.
- No se ha confirmado un endpoint `PATCH /api/organizations/:id` para editar `name`/`plan` tras la creación.

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
- [ ] Lista de campos editables hoy y endpoint responsable.
Tests: N/A — auditoría.
Evidencia esperada: Tabla de hallazgos.

### T02 — Endpoint PATCH /api/organizations/current

Objetivo: Permitir editar `name` de la organización de sesión.
Archivos / módulos probables: nuevo o extendido en `api/organizations/`, `api/_lib/auth.js`, `api/_lib/data.js`.
Cambios: Nuevo handler con validación + guard de rol.
No hacer: No exponer edición de `plan` (fuera de alcance).
Criterios de aceptación:
- [ ] 200 con nombre válido y rol autorizado.
- [ ] 403 con rol no autorizado.
- [ ] 400 con nombre vacío.
Tests: `api/organizations/*.test.js` nuevo caso.
Evidencia esperada: Resultado de test + ejemplo de request/response.

### T03 — UI de edición

Objetivo: Formulario en panel admin.
Archivos / módulos probables: `src/components/shift-dashboard/*`.
Cambios: Nuevo formulario controlado, estados loading/error/success.
No hacer: No introducir modal nuevo sin revisar `ModalShell` existente (master-prompt sección 23).
Criterios de aceptación:
- [ ] Formulario visible solo a rol autorizado.
- [ ] Éxito refresca el nombre mostrado en la app sin recargar página.
Tests: componente con test de render + interacción.
Evidencia esperada: captura antes/después, resultado de test.

### T04 — i18n y accesibilidad

Objetivo: Cerrar claves ES/EN y verificar accesibilidad básica.
Archivos / módulos probables: `src/lib/i18n.ts`.
Cambios: Nuevas claves.
No hacer: No dejar claves huérfanas.
Criterios de aceptación:
- [ ] `i18n-coverage.test.ts` pasa.
- [ ] Foco visible y label asociado verificado manualmente.
Tests: `i18n-coverage.test.ts`.
Evidencia esperada: resultado de test.

## 19. Tests obligatorios

unit (endpoint), component (formulario), i18n coverage.

## 20. Evidencias

Resultados de tests T02/T03/T04, tabla de hallazgos T01.

## 21. Gate

Gates requeridos: G4 (API/authorization), G6 (UX/UI), G10 (Unit/integration tests).

## 22. Rollback / remediación

Si el Gate falla en autorización, revertir el endpoint nuevo (feature aislada, sin dependientes) y devolver a estado previo sin editar `plan`.

## 23. Criterio de DONE

Endpoint y UI de edición de nombre de organización funcionando, protegidos server-side, con tests y claves i18n cerradas.
