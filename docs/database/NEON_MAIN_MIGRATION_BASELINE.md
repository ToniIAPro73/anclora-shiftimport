# Línea Base y Diagnóstico de Migraciones de Neon `main`

**Fecha de análisis**: 2026-09-12  
**Proyecto Neon**: `holy-cake-85660318`  
**Rama Neon analizada**: `main` (`br-solitary-thunder-b1hm9low`)  
**Endpoint de conexión**: `ep-lingering-dew-b1atfd0w` (`ep-lingering-dew-b1atfd0w.c-5.eu-central-1.aws.neon.tech`)  
**Commit de referencia**: `5892d63`  
**Rama Backup creada y preservada**: `br-misty-mud-b1rxqbgt` (`backup/pre-migration-ledger-reconciliation-20260912-063200`, LSN: `0/3CFF5B8`)  
**Resultado de equivalencia acumulada**: **FAIL (Detención preventiva por `MAIN_MISSING`)**  
**Estado de `_migrations` en `main`**: **INTACTO (Cero escrituras realizadas)**

---

## 1. Contexto Operativo y Autorización

La rama Neon `main` es utilizada como entorno de validación manual / UAT por el propietario del proyecto. En este entorno, el propietario ejecutó manualmente la gran mayoría de los cambios correspondientes a las migraciones `0002`–`0037`, pero el migrador oficial (`db/migrate.mjs`) no registró esas ejecuciones en la tabla `_migrations`, que permaneció congelada registrando únicamente `0001_init.sql`.

La presencia de los objetos de las migraciones posteriores en `main` es **intencionada y autorizada**. La directiva de seguridad del proyecto estipula que:
1. Solo se permite actualizar `_migrations` si se acredita que el esquema es acumulativamente equivalente al resultado esperado tras `0001`–`0037`.
2. Ante cualquier elemento clasificado como `MAIN_MISSING`, `DEFINITION_MISMATCH` o `INDETERMINATE`, el proceso debe **detenerse de inmediato sin escribir en `_migrations`** y emitir un diagnóstico formal junto con una propuesta de reconciliación forward-only.

---

## 2. Metodología de Comparación

1. **Rama Backup de Seguridad**: Se creó la rama `br-misty-mud-b1rxqbgt` (`backup/pre-migration-ledger-reconciliation-20260912-063200`) directamente desde `br-solitary-thunder-b1hm9low` (parent LSN `0/3CFF5B8`), verificándose su estado `ready`.
2. **Rama Efímera de Referencia**:
   - Se aprovisionó una rama temporal acreditada (`br-round-scene-b11wzqo9`, `tmp-temporal-1789187552178-furxu`) como hija de `preview/development` (`br-falling-heart-b1d6u2cx`), que representaba la base legacy limpia previa a 0036.
   - Se ejecutó `db/migrate.mjs` aplicando la secuencia continua completa `0001` a `0037`.
   - Se acreditó la presencia de los 37 registros continuos en `_migrations`.
3. **Extracción y Comparación Exhaustiva de Catálogos**:
   Se extrajeron y compararon mediante consultas de solo lectura en PostgreSQL:
   - `pg_extension`
   - `information_schema.tables`
   - `information_schema.columns` (tipos, nullability, ordinal position)
   - `pg_constraint` (PRIMARY KEY, FOREIGN KEY, CHECK, UNIQUE, EXCLUSION)
   - `pg_indexes` (definiciones completas)
   - `information_schema.views`
   - `information_schema.routines` (funciones y procedimientos)
   - `information_schema.triggers`
   - `information_schema.sequences`
   - `pg_type` (enums y tipos definidos por usuario)

---

## 3. Resultado de la Comparación Acumulada

### 3.1 Resumen por Tipo de Objeto
- **Extensiones**: 2 de 2 coinciden (`btree_gist`, `plpgsql`) $\rightarrow$ **MATCH**.
- **Vistas**: 4 de 4 coinciden (`current_person_roles`, `current_employee_areas`, `current_person_access_scopes`, `current_reporting_relationships`) $\rightarrow$ **MATCH**.
- **Funciones/Routines**: Coincidencia exacta, incluyendo `transfer_organization_ownership_temporal` y funciones de integridad laboral $\rightarrow$ **MATCH**.
- **Triggers**: Coincidencia exacta de todos los triggers $\rightarrow$ **MATCH**.
- **Columnas**: Coincidencia del 100% de columnas en todas las tablas comunes $\rightarrow$ **MATCH**.
- **Restricciones (Constraints)**: Coincidencia del 100% de constraints en todas las tablas comunes $\rightarrow$ **MATCH**.
- **Índices**: 135 índices analizados, 135 de 135 coinciden con idéntica definición en todas las tablas comunes $\rightarrow$ **MATCH**.
- **Secuencias**: 0 secuencias en ambos entornos $\rightarrow$ **MATCH**.
- **Objetos extras en `main` (`MAIN_AHEAD`)**: Ninguno (0).
- **Discrepancias de definición (`DEFINITION_MISMATCH`)**: Ninguna (0).

### 3.2 La Discrepancia Crítica Detectada (`MAIN_MISSING`)
- **Tabla faltante en `main`**: `password_reset_tokens`.
- **Migración de origen**: `0002_password_reset.sql`.
- **Diagnóstico**: Durante la ejecución manual histórica de migraciones sobre `main`, el archivo `0002_password_reset.sql` **no fue ejecutado** (o fue omitido), mientras que todas las migraciones posteriores (`0003` hasta `0037`) sí fueron aplicadas físicamente.
- **Consecuencia**: El esquema de `main` no contiene la tabla `password_reset_tokens` ni su índice `password_reset_tokens_user_idx`.

Debido a que la regla contractual de seguridad prohíbe baselines con elementos `MAIN_MISSING` y prohíbe ejecutar DDL sobre `main` sin autorización previa expresa, **el proceso se detuvo de forma preventiva sin escribir en `_migrations`**.

---

## 4. Inventario de Archivos de Migración y Checksums SHA-256

| # | Archivo | SHA-256 Checksum | Estado en `main` | Estado en BD Ref | Clasificación |
|---|---|---|---|---|---|
| 0001 | `0001_init.sql` | `b269aac2ac783b3ffb983a1d99325d77bf1482218451be6352740287d2a00eff` | Registrada y Materializada | Registrada y Materializada | **MATCH** |
| 0002 | `0002_password_reset.sql` | `8710c0e3cd56d4ed3f58cca0c49d730e35b986c1a0bcb91a092450d74453bc86` | No Registrada / No Materializada | Registrada y Materializada | **MAIN_MISSING** |
| 0003 | `0003_login_attempts.sql` | `48a0bb1ded8353ef59e2ea923a65cfb881d8351c87a9fd77eab4e95faa00dc20` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0004 | `0004_organization_plan.sql` | `91e542209b6bcc9fc9f00825f95a4cfb3aeca2a8e883662a5e3ee187ea74b4c2` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0005 | `0005_employee_lifecycle.sql` | `923d83f0ac83ce08032796db4c814cac91884188c5a94151479d6052e8c445da` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0006 | `0006_employee_pending_access.sql` | `23158701bb16b1278d0cb0081b5cdf454417651a5d7af7623f3006ebfb0ce7fb` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0007 | `0007_remove_manager_role.sql` | `e29019d76c8c81bc64b5e786a44907210051c149a8fd0e88ca51e67760130526` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0008 | `0008_areas_optional.sql` | `acd546a00a8aa4b92d6f49c43a7a42f8649030c48a7655ea31eb07c18e221cba` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0009 | `0009_format_profiles.sql` | `9359f6e52260fee9e33e99a97a5d8ae008f9c32689fc3eda2863fbbba35e9a77` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0010 | `0010_import_history.sql` | `2780e56ade89cc0a531e0595ae97a2cdd4b8d45f3e7258520652d7fa76477271` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0011 | `0011_import_idempotency.sql` | `1c8521db1c942187cb05296bc2d123f35219f96c4dfcf6595feb10385fa32c14` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0012 | `0012_format_profiles_structurehash_uniqueness.sql` | `b80696f00fb7eed8bf9ebb017e8801280531cde89d6c474f5a1a4c725274712c` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0013 | `0013_membership_roles_owner.sql` | `f092bf21244610e4b382ba85bcd4fe4d55ef9dbf01d9ccd3eea4b2bce57618c0` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0014 | `0014_single_owner_per_organization.sql` | `6323091e89eeb336947ae60ff6d9ec4468b08767b9bbb6b920e6624e8662282d` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0015 | `0015_membership_scoped_area.sql` | `d8ea224ed6b5575819eca7c4c47b2d1f5015c58e36fcb727ec98f3526ee7a87a` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0016 | `0016_organization_audit_events.sql` | `c3254bc0a105f9e75d92d86fc24c8a5d17b8d3c82ad7953f32f7b2c80e897cd9` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0017 | `0017_schedules.sql` | `6ad8030d694274548a35b89745b368e598da85a009526993ec5ac50fc0a66694` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0018 | `0018_schedule_versions.sql` | `d32a7bf152f1778b9a6082aaab3c29d7640fadc0d7403bca9690ff930dd11cf2` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0019 | `0019_shift_assignments.sql` | `233482e8a48745aba28a3f18d09f4f12e8189c3c59264bed8771a30645d5a31e` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0020 | `0020_shifts_schedule_version.sql` | `ab074c080f8138d1172823f4936f167be405bef29a314e50414176560028a5e0` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0021 | `0021_shift_assignments_import_id.sql` | `5f1c9d4ff8a3d09784f524a052b66ec66bc2c8260166fd8cdab6a07f8e486f6e` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0022 | `0022_shift_acknowledgements.sql` | `7612ac3aa7dc11c29d89a73ee427bb86dd263c917a89d102a8e8d657768aac04` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0023 | `0023_shift_comments.sql` | `f9b180e92a4cf231557596f5b5c889e9c9f324523dd52ceae8c5e3d83065aa25` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0024 | `0024_change_requests.sql` | `c164df95e5c2083afe2bc336bc8507ff51f9ac896d8b73c66984bb7eb43406ef` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0025 | `0025_notifications.sql` | `f87305d25ed431d3deb09b783bea0fa3654b1b42924e1bc93031b1dabaef88e6` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0026 | `0026_oauth_identities.sql` | `35a1b23a118258cfdcecf6699dfecbdacbb54a7f57f76027acad472e1c39ec8b` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0027 | `0027_approval_policy.sql` | `a0482696c41314224a2ce3b5a93326f8740300788883505430329b68e0cbd492` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0028 | `0028_approval_requests.sql` | `a2c38221fb963747fded998312fae6367c76b4ebde4345de7b15bec896e2c2dc` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0029 | `0029_approval_decision_metadata.sql` | `2fbf8aa6416075cd9c25a28b561d0008831970ea5514cc7ff49a44ee62005b6c` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0030 | `0030_approval_rejection_metadata.sql` | `8ea716f7892415a3d3b39e4762d7edf3628ddd17d2ea273c1aebe5fe3a789867` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0031 | `0031_approval_audit_event_types.sql` | `4aa67a5fb7a59669c5f57c8c342e6d15d639067e3ac419dc9efc120b2818208a` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0032 | `0032_change_request_application.sql` | `ee5650fce3b9e3753df456eaac7ddacf19f262c09431f56498552d3d3f3ab5af` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0033 | `0033_import_outcome.sql` | `e2f0682d08cd86d5a1618d6f3c914dc334d284073408588b594188a9d9ea27de` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0034 | `0034_shift_type_semantics.sql` | `da29372254c5638f3ad48aef3620b95a69399e467621ef8640fef8be00df3b5c` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0035 | `0035_operational_assignments.sql` | `a13922dc2e46ac799983d271aa4a0a634fc3fa50082174c94920a3c46395972d` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0036 | `0036_temporal_organizational_model.sql` | `497933864957965f7605e62027467281da095c14aa67e476077e456b30da6f93` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |
| 0037 | `0037_temporal_ownership_transfer_and_labor_integrity.sql` | `9cf3769c61583247af29aa571c21fe26f8af712a84228cdf3f2a7d5fb9ff2485` | Materializada / No Registrada | Registrada y Materializada | **MATCH (en esquema)** |

---

## 5. Auditoría de Preservación de Groundforce

Se verificó mediante consultas de solo lectura que la organización Groundforce y todos sus datos se encuentran íntegros y sin alteración en `main`:
- **ID de Organización**: `ecbebcf6-787d-4b0f-be32-d67be64ce3b1`
- **Nombre**: `Groundforce` (Tipo: `company`, Plan: `team`, Creada: `2026-09-11T16:33:51.904Z`)
- **Usuarios & Memberships**:
  - `pmi140979@gmail.com` (`Toni Ballesteros`, `OWNER`)
  - `sebastianpozomendoza@gmail.com` (`Sebas Admin.`, `ADMIN`)
- **Recuentos de Entidades**:
  - Empleados: 1
  - Personas (`organization_people`): 2
  - Perfiles de empleado (`employee_profiles`): 1
  - Periodos de rol (`person_role_periods`): 2
  - Periodos de alcance de acceso (`person_access_scope_periods`): 2

---

## 6. Propuesta de Reconciliación Forward-Only

Para completar de forma limpia y formal la reconciliación sin comprometer la integridad ni violar la autorización del propietario, se propone la siguiente secuencia de resolución:

### Paso 1: Creación Controlada de la Tabla Faltante (Requiere Aprobación Expresa)
Ejecutar exclusivamente la creación de la tabla omitida de `0002_password_reset.sql`:
```sql
BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx 
  ON password_reset_tokens (user_id);

COMMIT;
```

### Paso 2: Reconciliación Transaccional del Historial de Migraciones
Una vez materializada la tabla anterior, el esquema será 100% idéntico y sin ningún `MAIN_MISSING`. En ese momento, se podrá ejecutar la siguiente transacción atómica sobre `_migrations`:
```sql
BEGIN;

-- Bloqueo explícito de _migrations para garantizar aislamiento
LOCK TABLE _migrations IN EXCLUSIVE MODE;

-- Inserción de metadatos de las 36 migraciones manuales (0002 a 0037)
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

COMMIT;
```

---

## 7. Advertencia de Operación y Reglas para el Futuro
1. **NO MODIFICAR `_migrations` MANUALMENTE**: A partir de la conciliación, cualquier cambio de base de datos debe originarse en un archivo de migración formal (`0038_...`).
2. **MODO STATUS OBLIGATORIO**: Todo agente o desarrollador debe ejecutar primero `npm run db:migrate:status` antes de interactuar con cualquier base de datos Neon.
3. **AISLAMIENTO DE RAMAS**: Queda estrictamente prohibido utilizar `main` para suites de pruebas destructivas o automatizadas. Las pruebas deben ejecutarse exclusivamente sobre ramas efímeras acreditadas hijas de `preview/development`.
