# R4-M05 — Comments

## 1. Objetivo

Permitir que el empleado añada un comentario de texto libre a un turno (p. ej. una nota visible para el ADMIN), sin construir un sistema de mensajería genérico.

## 2. Problema que resuelve

Da al empleado un canal mínimo de comunicación asociado a un turno concreto, precursor ligero de Change Request (R4-M06) para casos donde no se necesita una solicitud formal.

## 3. Estado actual del repositorio

No existe. Ninguna tabla de comentarios en el esquema actual.

## 4. Alcance IN

- Nueva tabla `shift_comments` (shift_id, employee_id, body, created_at).
- Endpoint para crear/listar comentarios de un turno propio.
- UI de lista de comentarios + campo de texto en Shift Detail.

## 5. Alcance OUT

- Edición/borrado de comentarios — MVP es solo creación y lectura.
- Notificación push/email al ADMIN por nuevo comentario (cubierto solo si R4-M08 lo decide explícitamente como in-app).
- Comentarios del ADMIN hacia el empleado (fuera de alcance de R4; podría vivir en el dashboard ADMIN en una microfase futura no definida aquí).

## 6. Dependencias

R4-M04 (Shift Detail ya tiene sección de acciones establecida).

## 7. Decisiones arquitectónicas

Comentarios son append-only (no edición/borrado en MVP) para evitar ambigüedad de auditoría; simplifica el modelo y el Gate de seguridad.

## 8. Modelo de datos afectado

Nueva tabla `shift_comments`: `id`, `shift_id` FK, `employee_id` FK, `body` (text, longitud máxima razonable a validar server-side), `created_at`.

## 9. API / Backend

`POST /api/me/shifts/:id/comments` (crear), `GET /api/me/shifts/:id/comments` (listar) — ambos SELF-scoped, verificando pertenencia del turno.

## 10. Frontend / UX

Lista cronológica de comentarios + textarea con botón enviar; estado vacío "sin comentarios aún".

## 11. Seguridad y autorización

Validación server-side de longitud/contenido no vacío; sanitización de output al renderizar (evitar XSS — texto siempre renderizado como texto plano, nunca `dangerouslySetInnerHTML`).

## 12. i18n

Labels, placeholder de textarea, estado vacío en ES/EN.

## 13. Accesibilidad

Textarea con label asociado; lista de comentarios navegable por teclado; anuncio de nuevo comentario enviado.

## 14. Responsive / temas

Campo de texto y lista adaptados a mobile; contraste verificado.

## 15. Observabilidad / errores

Error claro si el envío falla, sin perder el texto ya escrito por el usuario.

## 16. Migraciones

Nueva migración aditiva `shift_comments`, sin impacto en datos existentes.

## 17. Compatibilidad y datos existentes

Turnos existentes empiezan sin comentarios; no requiere backfill.

## 18. Tasks

### T01 — Migración `shift_comments`
Objetivo: crear tabla.
Archivos: `db/migrations/00XX_shift_comments.sql`.
Cambios: tabla + FKs + índice en `shift_id`.
No hacer: no añadir edición/borrado en el esquema (mantenerlo simple).
Criterios de aceptación:
- [ ] Migración aplica limpia.
Tests: migration test.
Evidencia esperada: log de aplicación.

### T02 — Endpoints crear/listar comentarios
Objetivo: CRUD mínimo (solo C+R) SELF-scoped.
Archivos: `api/me/shifts/[id]/comments.js`.
Cambios: POST valida body no vacío y longitud máxima; GET devuelve orden cronológico.
No hacer: no exponer comentarios de turnos ajenos.
Criterios de aceptación:
- [ ] Comentario vacío rechazado con 400.
Tests: integration (creación, listado, turno ajeno).
Evidencia esperada: respuestas de éxito/error.

### T03 — UI de comentarios en Shift Detail
Objetivo: lista + formulario de envío.
Archivos: `src/components/employee-portal/ShiftDetail.tsx`, `ShiftComments.tsx`.
Cambios: fetch de lista, envío con feedback optimista o post-confirmación.
No hacer: no permitir editar/borrar en UI.
Criterios de aceptación:
- [ ] Comentario enviado aparece en la lista sin recargar página.
Tests: unit de interacción.
Evidencia esperada: captura antes/después de enviar.

## 19. Tests obligatorios

Unit, Integration (aislamiento, validación de input), Security (XSS/sanitización de render).

## 20. Evidencias

Log de migración, respuestas de API, capturas de UI.

## 21. Gate

Gates obligatorios: G2 (Database), G5 (Functional).

## 22. Rollback / remediación

Rollback lógico: tabla puede quedar sin uso sin afectar `shifts`; drop table es seguro y documentado como tal.

## 23. Criterio de DONE

Empleado crea y ve comentarios de sus propios turnos, aislados de otros empleados; Gate G2+G5 PASS.
