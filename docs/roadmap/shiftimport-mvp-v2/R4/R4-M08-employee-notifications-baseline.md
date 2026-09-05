# R4-M08 — Employee Notifications Baseline

## 1. Objetivo

Introducir una notificación in-app mínima (lista + badge de no-leídos) que informe al empleado de eventos relevantes ya producidos por R4 (nuevo turno publicado que le afecta, cambio de estado de una change request), sin construir infraestructura de entrega push/email/SMS.

## 2. Problema que resuelve

Sin esto, el empleado solo se entera de cambios entrando manualmente a Today/My Week/Solicitudes. Un badge simple mejora la usabilidad sin requerir infraestructura nueva.

## 3. Estado actual del repositorio

No existía ningún sistema de notificaciones, push, email transaccional ni websockets. R4-M08 añade únicamente persistencia y entrega in-app para el portal de empleado.

## 4. Alcance IN

- Tabla `notifications` mínima (recipient user_id, tipo, referencia a recurso, leído/no leído, created_at).
- Generación de notificación in-app al publicar una versión de schedule con turnos futuros para empleados vinculados.
- Tipo `CHANGE_REQUEST_RESOLVED` reservado para R5; no se genera todavía porque el resolver pertenece a esa fase.
- Endpoint de listado + marcar como leída.
- Badge de contador en la navegación (R4-M09).

## 5. Alcance OUT

- **Cualquier canal de entrega fuera de in-app**: push, email, SMS. El baseline confirma que no existe infraestructura para ninguno de estos; introducirla no está en el alcance de R4 y requeriría una decisión de producto/infra propia, fuera de esta microfase.
- Notificaciones en tiempo real vía websocket o polling continuo — M08 carga al abrir la superficie y ofrece recarga explícita.
- Preferencias de notificación configurables por el usuario.

## 6. Dependencias

R4-M06 (fuente de eventos de change request). R4-M09 consume el badge que aquí se produce.

## 7. Decisiones arquitectónicas

Notificaciones son in-app-only y generadas de forma síncrona por el backend después de completar la publicación primaria (no se introduce cola/worker nuevo). La generación es best-effort y queda fuera de la transacción de publicación para que un fallo de notificaciones no revierta el cambio operativo. La generación de `CHANGE_REQUEST_RESOLVED` queda N/A/diferida hasta R5.

## 8. Modelo de datos afectado

Nueva tabla `notifications`: `id`, `user_id` FK, `organization_id`, `type` (enum simple, p. ej. `SHIFT_PUBLISHED`/`CHANGE_REQUEST_RESOLVED`), `resource_type`, `resource_id`, `read_at` (nullable), `created_at`.

## 9. API / Backend

`GET /api/me/notifications`, `POST /api/me/notifications/:id/read` — SELF-scoped por `user_id` de sesión.

## 10. Frontend / UX

Lista simple de notificaciones (icono por tipo, texto, timestamp relativo), acción "marcar como leída" al abrir/tocar.

## 11. Seguridad y autorización

Server-side: solo notificaciones del propio `user_id`.

## 12. i18n

Textos de notificación (plantillas por tipo) en ES/EN.

## 13. Accesibilidad

Badge de contador con texto alternativo ("3 notificaciones sin leer"), no solo un número visual sin contexto.

## 14. Responsive / temas

Lista adaptada a mobile; contraste del badge verificado.

## 15. Observabilidad / errores

Fallo al generar una notificación no debe bloquear la operación principal que la origina (p. ej. si notificar falla, el turno igualmente se publica) — falla de notificación es "best effort", registrada en log, no propagada como error al usuario.

## 16. Migraciones

Nueva migración aditiva `notifications`, sin impacto en datos existentes.

## 17. Compatibilidad y datos existentes

Usuarios existentes empiezan sin notificaciones; no requiere backfill.

## 18. Tasks

### T01 — Migración `notifications`
Objetivo: crear tabla mínima.
Archivos: `db/migrations/00XX_notifications.sql`.
Cambios: tabla + índice en `(user_id, read_at)`.
No hacer: no modelar canales de entrega (push/email) en el esquema.
Criterios de aceptación:
- [x] Migración aplica limpia en Neon de desarrollo.
Tests: migration test.
Evidencia esperada: log de aplicación.

### T02 — Generación de notificación al resolver evento fuente
Objetivo: side-effect best-effort al ocurrir el evento relevante disponible en este punto del roadmap.
Archivos: `api/_lib/data.js` (o módulo de notificaciones dedicado si el tamaño de `data.js` ya se abordó en R0-M05).
Cambios: función de creación de notificación invocada desde el flujo fuente, con manejo de fallo best-effort.
No hacer: no bloquear el flujo fuente si la notificación falla.
Criterios de aceptación:
- [x] Fallo simulado de notificación no impide la operación principal.
Tests: unit/integration con fallo simulado.
Evidencia esperada: log de fallo capturado sin propagar error al usuario.

### T03 — Endpoints listar/marcar leída
Objetivo: `GET`/`POST` SELF-scoped.
Archivos: `api/me/notifications/index.js`, `api/me/notifications/[id]/read.js`.
Cambios: lectura ordenada, marcado idempotente.
No hacer: no exponer notificaciones ajenas.
Criterios de aceptación:
- [x] Marcar como leída dos veces no falla.
Tests: integration.
Evidencia esperada: respuestas de ejemplo.

### T04 — Componente de lista + badge de contador
Objetivo: UI mínima consumida también por R4-M09.
Archivos: `src/components/employee-portal/Notifications.tsx`.
Cambios: fetch de lista, contador de no-leídas expuesto como hook/prop reutilizable.
No hacer: no implementar polling agresivo (intervalo razonable, p. ej. al enfocar la pestaña).
Criterios de aceptación:
- [x] Contador se actualiza tras marcar como leída.
Tests: unit.
Evidencia esperada: captura antes/después.

## 19. Tests obligatorios

Unit, Integration (aislamiento, idempotencia, fallo best-effort), Accessibility (badge con texto alternativo).

## 20. Evidencias

- `npm test -- --run`: 128 archivos, 1171 tests PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS (warning preexistente de tamaño de chunks).
- `node --env-file=.env.development.local db/migrate.mjs`: aplicó `0025_notifications.sql` (5 statements) en Neon de desarrollo; verificación posterior: tabla presente, cuatro índices esperados, 0 filas iniciales.
- Tests de API cubren SELF scope, aislamiento, métodos HTTP e idempotencia; test de publicación cubre fallo best-effort; test UI cubre badge, marcado, estado vacío y error.

## 21. Gate

Gates obligatorios: G5 (Functional).

Resultado: **PASS**.

G5 PASS requiere explícitamente verificar que ningún canal de entrega externo (push/email/SMS) fue introducido — validado mediante revisión de migración, backend, frontend y tests. El productor de `CHANGE_REQUEST_RESOLVED` queda diferido a R5 por no existir todavía un resolver.

## 22. Rollback / remediación

Rollback lógico: tabla puede quedar sin uso; drop seguro sin dependientes fuera de este dominio.

## 23. Criterio de DONE

Empleado ve notificaciones in-app propias con contador correcto; el acceso está limitado al usuario autenticado; la publicación permanece exitosa si falla la notificación; ningún canal de entrega externo fue introducido; Gate G5 PASS.

Commit de cierre: `c19dc9a feat(employee-portal): add in-app notifications`.
