# R3-M01 — Schedule Schema

STATUS: DONE — PASS

## 1. Objetivo

Crear la tabla `schedules` como contenedor lógico de una planificación futura por organización, área opcional y periodo semanal.

## 2. Problema que resuelve

Sin `schedules` no hay dónde agrupar versiones de planificación por periodo/área. Es la raíz sobre la que cuelgan `schedule_versions` (R3-M02) y `shift_assignments` (R3-M03).

## 3. Estado actual del repositorio

MISSING. El repo ya contiene las migraciones R2 `0013`–`0016`; por tanto, la siguiente migración real es `0017_schedules.sql`. El esquema usa UUID en todas las entidades núcleo, no INTEGER/SERIAL.

## 4. Alcance IN

- Tabla `schedules`: id, organization_id, area_id (nullable), period_start (date, lunes o domingo ISO), period_end (date), created_by_user_id, created_at.
- Constraint de unicidad (organization_id, area_id, period_start) — evita duplicar el contenedor de la misma semana/área.
- Índices por organization_id y por (organization_id, period_start).

## 5. Alcance OUT

- `schedule_versions` y `shift_assignments` (R3-M02/M03).
- Cualquier endpoint o UI.

## 6. Dependencias

R3-M00 (dominio fijado).

## 7. Decisiones arquitectónicas

`area_id NULL` representa un Schedule global de organización, igual patrón que `employees.area_id` y `imports.area_id` (áreas opcionales, §15 R2). `period_start`/`period_end` se restringen a semanas completas en la capa de aplicación (no CHECK de DB, para no acoplar la validación de negocio a la constraint — sección 3 del prompt maestro: reglas de negocio en dominio, no en DB rígida).

## 8. Modelo de datos afectado

```sql
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, area_id, period_start)
);
CREATE INDEX idx_schedules_org ON schedules(organization_id);
CREATE INDEX idx_schedules_org_period ON schedules(organization_id, period_start);
```

Nota: Postgres trata `NULL` como distinto en UNIQUE, por lo que dos Schedules globales (area_id NULL) de la misma organización y periodo NO quedarían bloqueados por esta constraint tal cual — se añade una segunda unique parcial:

```sql
CREATE UNIQUE INDEX idx_schedules_org_period_global
  ON schedules(organization_id, period_start) WHERE area_id IS NULL;
```

## 9. API / Backend

N/A en esta microfase — sin endpoints todavía (R3-M04).

## 10. Frontend / UX

N/A — sin UI todavía.

## 11. Seguridad y autorización

N/A a nivel de schema — se aplica en R3-M13. La tabla es tenant-scoped vía organization_id (obligatorio, §24 del prompt maestro).

## 12. i18n

N/A — sin UI.

## 13. Accesibilidad

N/A — sin UI.

## 14. Responsive / temas

N/A — sin UI.

## 15. Observabilidad / errores

N/A — sin código de aplicación en esta microfase.

## 16. Migraciones

`db/migrations/0017_schedules.sql` — forward-only, aditiva, sin impacto en datos existentes. Rollback lógico: `DROP TABLE schedules` es seguro mientras no existan `schedule_versions` que referencien la tabla (documentar en sección 22). Se usan `IF NOT EXISTS` siguiendo la convención real de las migraciones R2.

## 17. Compatibilidad y datos existentes

Tabla nueva, no afecta filas existentes de `shifts`/`imports`/etc.

## 18. Tasks

### T01 — Migración `0017_schedules.sql`

Objetivo:
Crear la tabla `schedules` con sus índices y constraints según sección 8.

Archivos / módulos probables:
- `db/migrations/0017_schedules.sql` (nuevo)

Cambios:
- CREATE TABLE + índices + unique parcial.

No hacer:
- No añadir columnas de estado (eso vive en `schedule_versions`).

Criterios de aceptación:
- [x] Migración aplica limpio sobre HEAD actual vía `db/migrate.mjs`.
- [x] Constraint de unicidad verificada con un insert duplicado que falla.

Tests:
- Test de migración en `db/*.test.mjs` (patrón ya usado por migraciones anteriores) verificando creación de tabla y constraints.

Evidencia esperada:
- Output de `db/migrate.mjs` aplicando 0017.
- Resultado del test de migración.

## 19. Tests obligatorios

- `db` (migración aplica y constraints funcionan).

## 20. Evidencias

- `node --env-file=.env.development.local db/migrate.mjs`: `apply 0017_schedules.sql (6 statements)`, `done 0017_schedules.sql`.
- `npx vitest run db/migrations.test.mjs`: **1 file passed, 10 tests passed**.
- Neon dev: tabla `schedules` creada con 7 columnas UUID/DATE/TIMESTAMPTZ, 3 foreign keys e índices esperados.
- Neon dev: `schedules` tenía 0 filas antes y después de la prueba.
- Neon dev: segundo Schedule global para la misma organización y `period_start` rechazado por `schedules_organization_period_global_idx`; la transacción de prueba revirtió el primer insert.
- Índices observados: unique `(organization_id, area_id, period_start)`, unique parcial global, lookup por organización y lookup por organización/periodo.

## 21. Gate

Gates requeridos: **G2** (Database/migrations).

- G2: migración forward-safe, idempotente en el sentido de que reaplicarla sobre un HEAD ya migrado no rompe nada (usa `IF NOT EXISTS` siguiendo la convención real de las migraciones R2).

Resultado ejecutado: **PASS**.

## 22. Rollback / remediación

Si el Gate falla por constraint incorrecta: corregir el SQL, no hacer `ALTER` destructivo sobre datos ya escritos por esta migración en un entorno compartido — coordinar con el propietario del entorno Neon de desarrollo antes de cualquier DROP.

## 23. Criterio de DONE

Migración 0017 aplicada en Neon de desarrollo, test de migración en PASS, Gate G2 PASS. Commit: `pending`.
