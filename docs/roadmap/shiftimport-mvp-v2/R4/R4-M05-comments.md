# R4-M05 — Comments

## 1. Objetivo

Permitir que el empleado añada un comentario de texto libre a un turno (p. ej. una nota visible para el ADMIN), sin construir un sistema de mensajería genérico.

## 2. Problema que resuelve

Da al empleado un canal mínimo de comunicación asociado a un turno concreto, precursor ligero de Change Request (R4-M06) para casos donde no se necesita una solicitud formal.

## 3. Estado actual del repositorio

Implementado en `development` y cerrado con Gate PASS el 2026-09-05. La
capacidad no existía antes de esta microfase.

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

Comentarios son append-only (no edición/borrado en MVP) para evitar ambigüedad
de auditoría. Cada fila identifica explícitamente `shift_id` y `employee_id`.
La FK compuesta `(shift_id, employee_id)` garantiza que el comentario solo
pueda pertenecer al empleado del turno; no se introduce una relación de
mensajería ni una tabla de asociación adicional.

## 8. Modelo de datos afectado

Nueva tabla `shift_comments`: `id`, `shift_id` UUID, `employee_id` UUID,
`body` TEXT con `btrim(body)` entre 1 y 2000 caracteres, `created_at`
`TIMESTAMPTZ`. Incluye FKs a empleado y a la pareja turno-empleado, además de
índices por turno/fecha y empleado.

## 9. API / Backend

`POST /api/me/shifts/:id/comments` (crear), `GET /api/me/shifts/:id/comments`
(listar). Ambos requieren sesión EMPLOYEE, empleado vinculado, organización
activa y pertenencia SELF del turno; un turno ajeno o de otro tenant responde
404 uniforme. ADMIN y otros roles reciben 403. No existen endpoints de edición
ni borrado.

## 10. Frontend / UX

Lista cronológica de comentarios + textarea con botón enviar; estado vacío,
reintento de carga, contador de caracteres, feedback `aria-live` y conservación
del borrador si el envío falla. El contenido se renderiza como texto plano.

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

Nueva migración aditiva `0023_shift_comments.sql`, sin backfill ni cambios en
imports o turnos existentes.

## 17. Compatibilidad y datos existentes

Turnos existentes empiezan sin comentarios; no requiere backfill.

## 18. Tasks

### T01 — Migración `shift_comments`
Objetivo: crear tabla.
Archivos: `db/migrations/00XX_shift_comments.sql`.
Cambios: tabla + FKs + índice en `shift_id`.
No hacer: no añadir edición/borrado en el esquema (mantenerlo simple).
Criterios de aceptación:
- [x] Migración aplica limpia.
- [x] Segunda ejecución idempotente.
- [x] Tabla, constraints e índices presentes en Neon dev.
Tests: migration test.
Evidencia esperada: `apply 0023_shift_comments.sql (5 statements)` seguido de
`skip 0023_shift_comments.sql (already applied)`.

### T02 — Endpoints crear/listar comentarios
Objetivo: CRUD mínimo (solo C+R) SELF-scoped.
Archivos: `api/me/shifts/[id]/comments.js`.
Cambios: POST valida body no vacío y longitud máxima; GET devuelve orden cronológico.
No hacer: no exponer comentarios de turnos ajenos.
Criterios de aceptación:
- [x] Comentario vacío o superior a 2000 caracteres rechazado con 400.
- [x] Creación recorta whitespace y devuelve 201.
- [x] Listado ordena por `created_at`, `id`.
- [x] Turno ajeno/tenant cruzado no es observable y devuelve 404.
- [x] Roles no EMPLOYEE reciben 403.
Tests: integration (creación, listado, turno ajeno, autorización, input).
Evidencia esperada: `api/me/shifts/[id]/comments.test.js`, 6 tests PASS.

### T03 — UI de comentarios en Shift Detail
Objetivo: lista + formulario de envío.
Archivos: `src/components/employee-portal/ShiftDetail.tsx`, `ShiftComments.tsx`.
Cambios: fetch de lista, envío con feedback optimista o post-confirmación.
No hacer: no permitir editar/borrar en UI.
Criterios de aceptación:
- [x] Comentario enviado aparece en la lista sin recargar página.
- [x] El contenido con markup se muestra como texto, nunca como HTML.
- [x] El borrador se conserva ante error y se validan blancos localmente.
- [x] Loading, error, empty, retry, disabled y feedback están cubiertos.
Tests: unit de interacción y regresión de Shift Detail.
Evidencia esperada: `ShiftComments.test.tsx` (4 tests PASS) y
`ShiftDetail.test.tsx` PASS.

## 19. Tests obligatorios

Unit, integration, migration, security/XSS y regresión UI PASS.

Validación ejecutada:

- suite dirigida: 5 archivos, 42 tests PASS;
- suite completa: 120 archivos, 1.134 tests PASS;
- `npm run lint`: PASS;
- `npm run build`: PASS;
- `git diff --check`: PASS.

## 20. Evidencias

Log de migración y reejecución idempotente en Neon dev; consulta de esquema:
5 columnas, 3 índices operativos, constraints CHECK/FK presentes, migración
registrada y 0 comentarios iniciales sobre 14 shifts. Tests de API y UI como
evidencia reproducible. No se añadió captura estática como sustituto de tests
de interacción.

## 21. Gate

Gates obligatorios: G2 (Database), G5 (Functional).

Resultado: **PASS**.

Commit de implementación: `47325f1`
(`feat(employee-portal): add shift comments`).

## 22. Rollback / remediación

Rollback lógico: detener el consumo de comentarios sin afectar `shifts`.
La migración es aditiva; no se ejecuta un `DROP TABLE` sobre datos reales como
parte de la microfase. Cualquier retirada futura deberá ser una migración
explícita y auditada.

## 23. Criterio de DONE

Empleado crea y ve comentarios de sus propios turnos, aislados por empleado y
tenant, con contenido acotado, renderizado seguro y API append-only; Gate G2 +
G5 PASS. Microfase completada el 2026-09-05.
