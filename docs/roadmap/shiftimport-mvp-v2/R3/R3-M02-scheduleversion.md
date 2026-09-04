# R3-M02 — ScheduleVersion

STATUS: DONE — PASS

## 1. Objetivo
Crear `schedule_versions`, la unidad versionada del ciclo DRAFT→PUBLISHED→LOCKED→COMPLETED.

## 2. Problema que resuelve
`schedules` (R3-M01) es solo el contenedor; sin versión no hay dónde colgar el estado ni el historial de ediciones/publicaciones.

## 3. Estado actual del repositorio
MISSING. Depende de `schedules` (R3-M01), ya migrada como `0017_schedules.sql`. El esquema usa UUID; la numeración real de esta microfase es `0018_schedule_versions.sql`.

## 4. Alcance IN
- Tabla `schedule_versions`: id, schedule_id, version_number, status (`DRAFT/PUBLISHED/LOCKED/COMPLETED`), created_by_user_id, created_at, published_at (nullable), published_by_user_id (nullable).
- Regla: solo una versión por `schedule_id` puede estar en `DRAFT` a la vez.
- Regla: `version_number` autoincremental por `schedule_id`, empezando en 1.

## 5. Alcance OUT
`shift_assignments` (R3-M03). Publicación efectiva / materialización en `shifts` (R3-M10).

## 6. Dependencias
R3-M01.

## 7. Decisiones arquitectónicas
Un `schedule_id` puede tener múltiples `schedule_versions` a lo largo del tiempo (una por publicación + su sucesora draft). Solo la versión `PUBLISHED` más reciente (o `LOCKED`/`COMPLETED`) es la "verdad operativa" leída por el resto del sistema; las anteriores quedan como historial (R3-M12). No se permite más de un DRAFT simultáneo por schedule para evitar ambigüedad sobre "qué se está editando ahora mismo" (invariante de dominio, no solo de UI).

La base de datos garantiza `version_number > 0` y unicidad por `schedule_id`; la asignación del siguiente número consecutivo (1, o `MAX(version_number) + 1`) se ejecutará de forma transaccional en R3-M04 al crear una versión. No se introduce una secuencia global que no pueda representar numeración por schedule.

## 8. Modelo de datos afectado
```sql
CREATE TABLE schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','LOCKED','COMPLETED')),
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  published_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (schedule_id, version_number)
);
CREATE UNIQUE INDEX schedule_versions_one_draft_idx
  ON schedule_versions(schedule_id) WHERE status = 'DRAFT';
```
El índice único parcial `idx_schedule_versions_one_draft` es la invariante "un solo DRAFT activo" enforced a nivel DB, no solo aplicación (§3, §24 del prompt maestro: invariantes reales en DB, no confiar solo en la capa de app).

## 9. API / Backend
N/A en esta microfase — endpoints en R3-M04 (Draft Creation).

## 10. Frontend / UX
N/A.

## 11. Seguridad y autorización
N/A a nivel de schema; aplicada en R3-M13.

## 12. i18n
N/A.

## 13. Accesibilidad
N/A.

## 14. Responsive / temas
N/A.

## 15. Observabilidad / errores
N/A — sin código de aplicación aún.

## 16. Migraciones
`db/migrations/0018_schedule_versions.sql`, forward-only, aditiva, con `IF NOT EXISTS` para el patrón idempotente del repo.

## 17. Compatibilidad y datos existentes
Sin impacto en datos existentes.

## 18. Tasks

### T01 — Migración `0018_schedule_versions.sql`
Objetivo: crear tabla, CHECK de status, unique parcial de un solo DRAFT.
Archivos / módulos probables: `db/migrations/0018_schedule_versions.sql`.
Cambios: CREATE TABLE + índices.
No hacer: no añadir aún la lógica de transición de estado (vive en la capa de API, R3-M04/M10).
Criterios de aceptación:
- [x] Migración aplica limpio.
- [x] Insert de un segundo DRAFT para el mismo schedule_id falla por constraint.
Tests: test de migración verificando el índice único parcial con dos inserts.
Evidencia esperada: output de migración + test.

## 19. Tests obligatorios
`db` (constraint de un solo DRAFT verificada).

## 20. Evidencias
- `node --env-file=.env.development.local db/migrate.mjs`: `apply 0018_schedule_versions.sql (5 statements)`, `done 0018_schedule_versions.sql`.
- `npx vitest run db/migrations.test.mjs`: **1 file passed, 13 tests passed**.
- Neon dev: tabla `schedule_versions` creada con 8 columnas, UUID para las claves y estados `DRAFT/PUBLISHED/LOCKED/COMPLETED`.
- Neon dev: segundo DRAFT para el mismo `schedule_id` rechazado por `schedule_versions_one_draft_idx`; la transacción de prueba dejó `schedules = 0` y `schedule_versions = 0`.
- Neon dev: índices observados para PK, `(schedule_id, version_number)`, un único draft y lectura por schedule/version.

## 21. Gate
Gates requeridos: **G2**, **G3** (la invariante "un solo DRAFT" es de dominio, verificada a nivel DB).

Resultado ejecutado: **PASS**.

- G2 Database/migrations: PASS — migración `0018` aplicada y estructura/FKs/índices verificados en Neon dev.
- G3 Domain invariants: PASS — estados acotados, `version_number` positivo y máximo un DRAFT por Schedule enforced por base de datos.

## 22. Rollback / remediación
DROP TABLE seguro mientras `shift_assignments` (R3-M03) no exista todavía referenciándola.

## 23. Criterio de DONE
Migración 0018 aplicada, invariante de un solo DRAFT verificada por test, Gate G2+G3 PASS. Commit: `pending`.
