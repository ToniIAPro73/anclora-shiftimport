# R3-M02 — ScheduleVersion

## 1. Objetivo
Crear `schedule_versions`, la unidad versionada del ciclo DRAFT→PUBLISHED→LOCKED→COMPLETED.

## 2. Problema que resuelve
`schedules` (R3-M01) es solo el contenedor; sin versión no hay dónde colgar el estado ni el historial de ediciones/publicaciones.

## 3. Estado actual del repositorio
MISSING. Depende de `schedules` (R3-M01) ya migrada.

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

## 8. Modelo de datos afectado
```sql
CREATE TABLE schedule_versions (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id),
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','LOCKED','COMPLETED')),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  published_by_user_id INTEGER REFERENCES users(id),
  UNIQUE (schedule_id, version_number)
);
CREATE UNIQUE INDEX idx_schedule_versions_one_draft
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
`db/migrations/0014_schedule_versions.sql`, forward-only, aditiva.

## 17. Compatibilidad y datos existentes
Sin impacto en datos existentes.

## 18. Tasks

### T01 — Migración `0014_schedule_versions.sql`
Objetivo: crear tabla, CHECK de status, unique parcial de un solo DRAFT.
Archivos / módulos probables: `db/migrations/0014_schedule_versions.sql`.
Cambios: CREATE TABLE + índices.
No hacer: no añadir aún la lógica de transición de estado (vive en la capa de API, R3-M04/M10).
Criterios de aceptación:
- [ ] Migración aplica limpio.
- [ ] Insert de un segundo DRAFT para el mismo schedule_id falla por constraint.
Tests: test de migración verificando el índice único parcial con dos inserts.
Evidencia esperada: output de migración + test.

## 19. Tests obligatorios
`db` (constraint de un solo DRAFT verificada).

## 20. Evidencias
Migración commiteada, test de migración en PASS.

## 21. Gate
Gates requeridos: **G2**, **G3** (la invariante "un solo DRAFT" es de dominio, verificada a nivel DB).

## 22. Rollback / remediación
DROP TABLE seguro mientras `shift_assignments` (R3-M03) no exista todavía referenciándola.

## 23. Criterio de DONE
Migración 0014 aplicada, invariante de un solo DRAFT verificada por test, Gate G2+G3 PASS.
