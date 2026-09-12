# Auditoría e Historial de Conciliación de Migraciones en Neon `main`

**Fecha de auditoría**: 2026-09-12  
**Proyecto Neon**: `holy-cake-85660318`  
**Rama objetivo auditada**: `main` (`br-solitary-thunder-b1hm9low`)  
**Endpoint asociado**: `ep-lingering-dew-b1atfd0w` (`ep-lingering-dew-b1atfd0w.c-5.eu-central-1.aws.neon.tech`)  
**Estado de la auditoría**: Solo lectura (Read-Only). **CERO escrituras realizadas sobre `main` o su tabla `_migrations`**.

---

## 1. Resumen Ejecutivo y Contexto Operativo

### 1.1 Contexto de Uso de la Rama `main`
La rama `main` de este proyecto Neon es utilizada deliberadamente por el propietario del proyecto como entorno de **validación manual / UAT (User Acceptance Testing)**.
En este contexto, las migraciones `0036_temporal_organizational_model.sql` y `0037_temporal_ownership_transfer_and_labor_integrity.sql` fueron aplicadas intencionadamente para verificar de primera mano el nuevo modelo organizativo temporal con datos reales y de prueba (incluyendo organizaciones como Groundforce).

**La presencia de los objetos de 0036 y 0037 en `main` es autorizada, legítima y esperada**, y no constituye en ningún caso una contaminación accidental provocada por los tests de integración ni por el runner.

### 1.2 Hallazgo Crítico de la Auditoría
Al inspeccionar el catálogo PostgreSQL en `main`:
1. **Tabla `_migrations`**: Contiene **únicamente un registro**:
   ```
   name: '0001_init.sql', applied_at: 2026-08-20T15:35:50.718Z
   ```
2. **Materialización física de objetos**:
   - **0001_init.sql**: Registrada en `_migrations` y físicamente materializada.
   - **0002_password_reset.sql**: **NO registrada y NO materializada** (la tabla `password_reset_tokens` no existe en `main`).
   - **0003_login_attempts.sql hasta 0037_...**: **FÍSICAMENTE MATERIALIZADAS PERO NO REGISTRADAS** en `_migrations`. Todos los esquemas, tablas (`login_attempts`, `areas`, `format_profiles`, `schedules`, `operational_assignments`, `organization_people`, `employee_profiles`, etc.), vistas temporales (`current_person_roles`, etc.), funciones y triggers están físicamente presentes y activos en `main`.

---

## 2. Inventario Detallado de Migraciones (0001 a 0037)

A continuación se detalla el estado exacto de cada una de las 37 migraciones en la rama `main`:

| # | Archivo de Migración | Estado en `_migrations` | Estado Físico en BD | Evidencia Física Verificada | Idempotencia / Riesgo en Reejecución |
|---|---|---|---|---|---|
| **0001** | `0001_init.sql` | **REGISTRADA** | **MATERIALIZADA** | Tablas `organizations`, `users`, `memberships`, `employees`, `imports`, `shifts`, `sessions` presentes. | `CREATE TABLE` sin IF NOT EXISTS (fallaría si se reejecuta). |
| **0002** | `0002_password_reset.sql` | **NO REGISTRADA** | **NO MATERIALIZADA** | Tabla `password_reset_tokens` ausente en el esquema `public`. | `CREATE TABLE` sin IF NOT EXISTS. Ejecutable sin conflicto de nombre. |
| **0003** | `0003_login_attempts.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `login_attempts` presente (`id_key`, `window_start`, `attempt_count`). | `CREATE TABLE` sin IF NOT EXISTS. **CRITICO: Fallará de inmediato con error 42P07**. |
| **0004** | `0004_organization_plan.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columna `organizations.plan` presente. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0005** | `0005_employee_lifecycle.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columna `employees.deactivated_at` presente. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0006** | `0006_employee_pending_access.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Constraint `employees_status_check` incluye `pending_access`. | `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`. Idempotente. |
| **0007** | `0007_remove_manager_role.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Constraint `memberships_role_check` sin 'MANAGER'. | `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`. Idempotente. |
| **0008** | `0008_areas_optional.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `areas` presente; `employees.area_id` nullable. | `CREATE TABLE areas` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0009** | `0009_format_profiles.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `format_profiles` presente con índices. | `CREATE TABLE format_profiles` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0010** | `0010_import_history.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columnas `imports.import_mode`, `period_kind`, `deleted_at`, etc. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0011** | `0011_import_idempotency.sql` | **NO REGISTRADA** | **MATERIALIZADA** | `imports.context_fingerprint`, `shifts.semantic_fingerprint`. | `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`. Idempotente. |
| **0012** | `0012_format_profiles_structurehash_uniqueness.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Índices únicos sobre `format_profiles`. | `CREATE UNIQUE INDEX IF NOT EXISTS`. Idempotente. |
| **0013** | `0013_membership_roles_owner.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Rol `OWNER` permitido en `memberships`. | `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`. Idempotente. |
| **0014** | `0014_single_owner_per_organization.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Constraint / índice de owner único por organización. | `CREATE UNIQUE INDEX IF NOT EXISTS`. Idempotente. |
| **0015** | `0015_membership_scoped_area.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columna `memberships.scoped_area_id` presente. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0016** | `0016_organization_audit_events.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `organization_audit_events` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0017** | `0017_schedules.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `schedules` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0018** | `0018_schedule_versions.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `schedule_versions` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0019** | `0019_shift_assignments.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `shift_assignments` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0020** | `0020_shifts_schedule_version.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columna `shifts.schedule_version_id` presente. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0021** | `0021_shift_assignments_import_id.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columna `shift_assignments.import_id` presente. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0022** | `0022_shift_acknowledgements.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `shift_acknowledgements` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0023** | `0023_shift_comments.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `shift_comments` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0024** | `0024_change_requests.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `change_requests` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0025** | `0025_notifications.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `notifications` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0026** | `0026_oauth_identities.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `oauth_identities` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0027** | `0027_approval_policy.sql` | **NO REGISTRADA** | **MATERIALIZADA** | `organizations.approval_policy`, tabla `area_responsibles`. | `CREATE TABLE IF NOT EXISTS`. Idempotente. |
| **0028** | `0028_approval_requests.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `approval_requests` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0029** | `0029_approval_decision_metadata.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columnas `approved_by_user_id`, `approved_at` en `approval_requests`. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0030** | `0030_approval_rejection_metadata.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columnas `rejected_by_user_id`, `rejection_reason` en `approval_requests`. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0031** | `0031_approval_audit_event_types.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tipos de evento de auditoría de aprobación. | Idempotente. |
| **0032** | `0032_change_request_application.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columnas `requested_start_time`, `applied_at`, etc. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0033** | `0033_import_outcome.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columnas `outcome_reason`, `outcome_detail`, `blocking_employee_id`. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0034** | `0034_shift_type_semantics.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Columnas `shift_type`, `counts_as_work` en `shifts`/`assignments`. | `ADD COLUMN IF NOT EXISTS`. Idempotente. |
| **0035** | `0035_operational_assignments.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tabla `operational_assignments` presente. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0036** | `0036_temporal_organizational_model.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Tablas `organization_people`, `employee_profiles`, `person_role_periods`, etc., vistas y triggers. | `CREATE TABLE` sin IF NOT EXISTS. **Fallará con error 42P07**. |
| **0037** | `0037_temporal_ownership_transfer_and_labor_integrity.sql` | **NO REGISTRADA** | **MATERIALIZADA** | Función `transfer_organization_ownership_temporal` y triggers de integridad laboral. | `CREATE OR REPLACE FUNCTION` y triggers. Fallaría en re-creación de triggers sin DROP previo. |

---

## 3. Análisis de Riesgos de Reejecución

### 3.1 Peligro Inmediato: ¿Por qué NO debe ejecutarse `node db/migrate.mjs` en `main`?
El ejecutor estándar `db/migrate.mjs`:
1. Consulta `SELECT name FROM _migrations`.
2. Al encontrar únicamente `0001_init.sql`, asume que ninguna migración posterior se ha aplicado.
3. Intenta ejecutar `0002_password_reset.sql` (crearía `password_reset_tokens`).
4. A continuación, intenta ejecutar `0003_login_attempts.sql`.
5. Dado que la instrucción en `0003_login_attempts.sql` es:
   ```sql
   CREATE TABLE login_attempts ( ... );
   ```
   PostgreSQL emitirá inmediatamente el error:
   ```
   error: relation "login_attempts" already exists (SQLSTATE 42P07)
   ```
6. El script `db/migrate.mjs` abortará abruptamente con código de salida 1.
7. Si un operador intentara forzar la ejecución archivo por archivo o modificar manualmente las sentencias, encontraría errores equivalentes en al menos **14 archivos de migración adicionales** (0008, 0009, 0016, 0017, 0018, 0019, 0022, 0023, 0024, 0025, 0026, 0028, 0035, 0036), provocando un estado inconsistente o transacciones abortadas.

---

## 4. Plan de Conciliación Propuesto (NO EJECUTADO)

> [!WARNING]
> **ESTE PLAN ES EXCLUSIVAMENTE UNA PROPUESTA TÉCNICA DOCUMENTADA**.
> **NO HA SIDO EJECUTADO** ni debe ejecutarse sin la autorización formal, expresa y consciente del propietario del proyecto.

### 4.1 Requisitos Previos (Pre-checks)
Antes de ejecutar la conciliación, verificar que no existan conexiones activas ejecutando transacciones concurrentes:
```sql
SELECT pid, usename, client_addr, state, query_start, query 
FROM pg_stat_activity 
WHERE datname = 'neondb' AND pid <> pg_backend_pid();
```

### 4.2 Script de Conciliación Idempotente Propuesto
El script propuesto consta de dos fases atómicas:

#### Fase A: Creación de la tabla faltante `0002_password_reset.sql`
```sql
-- FASE A: Materialización de la tabla omitida en main
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx 
  ON password_reset_tokens (user_id);
```

#### Fase B: Registro en `_migrations` de todas las migraciones materializadas
```sql
-- FASE B: Conciliación histórica del libro de migraciones
INSERT INTO _migrations (name, applied_at) VALUES
  ('0002_password_reset.sql', NOW()),
  ('0003_login_attempts.sql', NOW()),
  ('0004_organization_plan.sql', NOW()),
  ('0005_employee_lifecycle.sql', NOW()),
  ('0006_employee_pending_access.sql', NOW()),
  ('0007_remove_manager_role.sql', NOW()),
  ('0008_areas_optional.sql', NOW()),
  ('0009_format_profiles.sql', NOW()),
  ('0010_import_history.sql', NOW()),
  ('0011_import_idempotency.sql', NOW()),
  ('0012_format_profiles_structurehash_uniqueness.sql', NOW()),
  ('0013_membership_roles_owner.sql', NOW()),
  ('0014_single_owner_per_organization.sql', NOW()),
  ('0015_membership_scoped_area.sql', NOW()),
  ('0016_organization_audit_events.sql', NOW()),
  ('0017_schedules.sql', NOW()),
  ('0018_schedule_versions.sql', NOW()),
  ('0019_shift_assignments.sql', NOW()),
  ('0020_shifts_schedule_version.sql', NOW()),
  ('0021_shift_assignments_import_id.sql', NOW()),
  ('0022_shift_acknowledgements.sql', NOW()),
  ('0023_shift_comments.sql', NOW()),
  ('0024_change_requests.sql', NOW()),
  ('0025_notifications.sql', NOW()),
  ('0026_oauth_identities.sql', NOW()),
  ('0027_approval_policy.sql', NOW()),
  ('0028_approval_requests.sql', NOW()),
  ('0029_approval_decision_metadata.sql', NOW()),
  ('0030_approval_rejection_metadata.sql', NOW()),
  ('0031_approval_audit_event_types.sql', NOW()),
  ('0032_change_request_application.sql', NOW()),
  ('0033_import_outcome.sql', NOW()),
  ('0034_shift_type_semantics.sql', NOW()),
  ('0035_operational_assignments.sql', NOW()),
  ('0036_temporal_organizational_model.sql', NOW()),
  ('0037_temporal_ownership_transfer_and_labor_integrity.sql', NOW())
ON CONFLICT (name) DO NOTHING;
```

### 4.3 Verificación Posterior (Post-checks)
Tras la conciliación, verificar que:
1. `SELECT count(*) FROM _migrations;` devuelva exactamente **37**.
2. Una ejecución en seco de `node db/migrate.mjs` reporte:
   ```
   No pending migrations to apply.
   ```

---

## 5. Recomendaciones de Checksum y Prevención de Deriva (Drift)

1. **Calculo de Checksums SHA-256**:
   Añadir una columna opcional `checksum TEXT` a `_migrations` en una fase futura para asegurar que los archivos aplicados coincidan bit a bit con el repositorio Git.
2. **Aislamiento Estricto de Entornos**:
   - Para suites de pruebas automáticas e integración continua: **Exclusivamente ramas efímeras hijas de `preview/development`** (`br-falling-heart-b1d6u2cx`), nunca ramas persistentes.
   - El runner de integración automatizado implementa acreditación estricta y preflights dobles, garantizando que jamás se conecte ni ejecute escrituras sobre ramas no efímeras.
3. **Regla de Operación Manual**:
   No ejecutar `db/migrate.mjs` sobre `main` hasta haber ejecutado formalmente la conciliación descrita en este documento.
