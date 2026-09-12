# Conciliación Formal del Historial de Migraciones en Neon `main`

**Fecha de ejecución**: 2026-09-12  
**Proyecto Neon**: `holy-cake-85660318`  
**Rama Neon conciliada**: `main` (`br-solitary-thunder-b1hm9low`)  
**Rama base de integración**: `preview/development` (`br-falling-heart-b1d6u2cx`)  
**Rama Git**: `development`  

---

## 1. Contexto y Objetivos

La rama Neon `main` fue utilizada históricamente como entorno de validación manual/UAT por el propietario del proyecto. Durante ese periodo, el propietario ejecutó manualmente el DDL correspondiente a las migraciones `0003`–`0037`, omitiendo inadvertidamente la migración `0002_password_reset.sql`. La tabla `_migrations` en `main` contenía únicamente el registro inicial `0001_init.sql`.

El objetivo de esta intervención consistió en:
1. Auditar y corregir las herramientas de migración (`db/migrate.mjs`, runner de integración y pruebas).
2. Materializar de forma exacta y controlada la migración `0002_password_reset.sql` en Neon `main`.
3. Conciliar de forma atómica el historial de migraciones (`_migrations`), registrando `0002`–`0037` sin re-ejecutar el DDL de `0003`–`0037` ya existente.
4. Alcanzar una equivalencia exacta del 100% en los catálogos normalizados entre la rama de referencia y `main`, preservando íntegramente los datos operativos.

---

## 2. Salvaguardas y Ramas de Backup Preservadas

Antes de cualquier escritura en Neon `main`, se crearon y verificaron ramas de respaldo tipo time-travel:

1. **Backup Pre-Auditoría Inicial**:
   - ID: `br-misty-mud-b1rxqbgt`
   - Nombre: `backup/pre-migration-ledger-reconciliation-20260912-063200`
   - Parent Branch: `br-solitary-thunder-b1hm9low`
   - Parent LSN: `0/3CFF5B8`
   - Estado: `ready` (Preservada de forma permanente)

2. **Backup Inmediato Pre-Conciliación Atómica**:
   - ID: `br-ancient-glade-b1mom0ou`
   - Nombre: `backup/pre-atomic-reconciliation-20260912-064800`
   - Parent Branch: `br-solitary-thunder-b1hm9low`
   - Parent LSN: `0/3D031F0`
   - Parent Timestamp: `2026-09-12T04:48:17Z`
   - Estado: `ready` (Preservada de forma permanente)

---

## 3. Procedimiento de Conciliación Atómica

La conciliación se realizó mediante una conexión directa no pooled y dentro de una única transacción PostgreSQL interactiva con las siguientes fases:

1. **Acreditación Previa a la Conexión**:
   - Resolución de hostname `ep-lingering-dew-b1atfd0w.c-5.eu-central-1.aws.neon.tech` al endpoint `ep-lingering-dew-b1atfd0w` y a la rama `main` (`br-solitary-thunder-b1hm9low`).
   - Bloqueo de conexiones genéricas o no explícitas.

2. **Bloqueo Consultivo y Pre-Verificación**:
   - Adquisición de `pg_advisory_xact_lock(hashtext('neon_main_migration_reconciliation'))`.
   - Comprobación de que `_migrations` contenía únicamente `0001_init.sql`.
   - Comprobación de que `password_reset_tokens` no existía.
   - Captura de snapshot de recuentos funcionales agregados.

3. **Materialización Exacta de 0002**:
   - Ejecución del DDL canónico de `0002_password_reset.sql`:
     - Tabla `password_reset_tokens` con columnas `token_hash` (PK), `user_id` (FK a `users(id)` ON DELETE CASCADE), `expires_at`, `used_at`, `created_at`.
     - Índice `password_reset_tokens_user_idx` sobre `(user_id)`.
   - Verificación inmediata de catálogo: 5 columnas exactas, PK, FK e índice verificados antes de continuar.

4. **Registro del Ledger de Migraciones**:
   - Inserción de los 36 nombres exactos (`0002_...` a `0037_...`) en `_migrations`.
   - No se volvió a ejecutar el DDL de `0003`–`0037`.

5. **Aserciones Pre-Commit**:
   - Total de filas en `_migrations`: 37.
   - Secuencia continua y sin nombres desconocidos.
   - Comparación de recuentos funcionales agregados: coincidencia exacta con el snapshot previo.
   - `COMMIT` atómico.

---

## 4. Recuentos Agregados (Sin PII)

### 4.1 Tablas Funcionales Generales

| Entidad | Recuento Pre-Conciliación | Recuento Post-Conciliación | Diferencia |
|---|---|---|---|
| `organizations` | 1 | 1 | 0 |
| `users` | 2 | 2 | 0 |
| `memberships` | 2 | 2 | 0 |
| `employees` | 1 | 1 | 0 |
| `areas` | 0 | 0 | 0 |
| `format_profiles` | 0 | 0 | 0 |
| `organization_audit_events` | 0 | 0 | 0 |
| `schedules` | 0 | 0 | 0 |
| `schedule_versions` | 0 | 0 | 0 |
| `shift_assignments` | 0 | 0 | 0 |
| `shifts` | 0 | 0 | 0 |
| `shift_comments` | 0 | 0 | 0 |
| `change_requests` | 0 | 0 | 0 |
| `notifications` | 0 | 0 | 0 |
| `oauth_identities` | 1 | 1 | 0 |
| `approval_requests` | 0 | 0 | 0 |
| `operational_assignments` | 0 | 0 | 0 |
| `organization_people` | 2 | 2 | 0 |
| `employee_profiles` | 1 | 1 | 0 |
| `person_role_periods` | 2 | 2 | 0 |
| `employee_area_periods` | 0 | 0 | 0 |
| `person_access_scope_periods` | 2 | 2 | 0 |
| `reporting_relationship_periods` | 0 | 0 | 0 |

### 4.2 Organización Groundforce

| Métrica Agregada | Pre-Conciliación | Post-Conciliación | Estado |
|---|---|---|---|
| `organization_people` | 2 | 2 | Intacto |
| `employee_profiles` | 1 | 1 | Intacto |
| `employees` (legacy) | 1 | 1 | Intacto |
| `person_role_periods` | 2 | 2 | Intacto |
| `memberships` | 2 | 2 | Intacto |

---

## 5. Resultados de la Postverificación

1. **Estado del Ledger (`npm run db:migrate:status`)**:
   - Total de migraciones del repositorio: 37
   - Migraciones aplicadas: 37
   - Migraciones pendientes: 0
   - Gaps de secuencia: 0
   - Desconocidas en ledger: 0
   - Checksum mismatches: 0
   - Estado: `UP_TO_DATE` / `READY`
   - Código de salida (exit code): `0`

2. **Equivalencia Catalográfica Normalizada**:
   - Comparación contra rama efímera generada aplicando secuencialmente `0001`–`0037`.
   - Tablas: 29 vs 29 (0 discrepancias).
   - Columnas: 0 discrepancias.
   - Restricciones: 0 discrepancias.
   - Índices: 0 discrepancias.
   - Vistas: 4 vs 4 (`current_person_roles`, `current_employee_areas`, `current_person_access_scopes`, `current_reporting_relationships`).
   - Rutinas/Funciones: 218 vs 218 (incluyendo funciones de integridad laboral y `transfer_organization_ownership_temporal`).
   - Triggers: 5 vs 5 (todos los triggers canónicos de `0036` y `0037`).
   - Extensiones: Coincidentes (`btree_gist`, `plpgsql`).

---

## 6. Reglas Mandatorias para Futuras Intervenciones

1. **PROHIBICIÓN DE DDL DIRECTO EN MAIN**: Ningún agente o desarrollador debe ejecutar migraciones a mano ni sentencias DDL directamente sobre Neon `main`.
2. **MODO STATUS PREVIO**: Antes de cualquier tarea de base de datos, es obligatorio ejecutar `npm run db:migrate:status`.
3. **MIGRACIONES NORMALIZADAS**: Nuevos cambios de esquema deben crearse secuencialmente como `0038_...` y aplicarse a través de `db/migrate.mjs` con la acreditación de rama correspondiente.
4. **RAMAS EFÍMERAS**: Las suites de integración y pruebas deben ejecutarse exclusivamente sobre ramas efímeras acreditadas derivadas de `preview/development`.
