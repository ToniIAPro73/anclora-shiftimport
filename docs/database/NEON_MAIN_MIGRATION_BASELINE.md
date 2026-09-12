# Línea Base del Esquema y Manifiesto de Migraciones de Neon `main`

**Fecha de conciliación y cierre**: 2026-09-12  
**Proyecto Neon**: `holy-cake-85660318`  
**Rama Neon conciliada**: `main` (`br-solitary-thunder-b1hm9low`)  
**Rama base de integración**: `preview/development` (`br-falling-heart-b1d6u2cx`)  
**Estado final del ledger (`_migrations`)**: **37 de 37 aplicadas (100% continuo, 0 pendientes)**  
**Equivalencia de catálogo**: **100% PASS (29 tablas, 4 vistas, 218 rutinas, 5 triggers)**  

---

## 1. Contexto Histórico y Procedimiento de Conciliación

Históricamente, el propietario del proyecto utilizó la rama Neon `main` como entorno de validación manual/UAT. Durante este proceso:
1. Las migraciones `0003`–`0037` fueron ejecutadas manualmente, dejando sus objetos materializados en la base de datos.
2. La migración `0002_password_reset.sql` fue omitida inadvertidamente.
3. El ledger `_migrations` no registraba estas ejecuciones, permaneciendo congelado únicamente en `0001_init.sql`.

El 2026-09-12 se llevó a cabo una **conciliación formal y atómica**:
- Se materializó de forma exacta la migración `0002_password_reset.sql` (creando la tabla `password_reset_tokens` y su índice `password_reset_tokens_user_idx`).
- Se registraron en `_migrations` las migraciones `0002`–`0037` dentro de una única transacción atómica, sin re-ejecutar el DDL de `0003`–`0037`.
- Se verificó la equivalencia normalizada completa de catálogos y la integridad total de los datos operativos preexistentes.

---

## 2. Salvaguardas y Ramas de Respaldo Preservadas

Se mantienen dos ramas de respaldo independientes tipo time-travel en Neon:

1. **Backup Pre-Auditoría Inicial**:
   - ID: `br-misty-mud-b1rxqbgt`
   - Nombre: `backup/pre-migration-ledger-reconciliation-20260912-063200`
   - Rama padre: `br-solitary-thunder-b1hm9low`
   - Parent LSN: `0/3CFF5B8`
   - Parent Timestamp: `2026-09-12T04:31:38Z`
   - Estado: `ready` (Preservada de forma permanente)

2. **Backup Inmediato Pre-Conciliación Atómica**:
   - ID: `br-ancient-glade-b1mom0ou`
   - Nombre: `backup/pre-atomic-reconciliation-20260912-064800`
   - Rama padre: `br-solitary-thunder-b1hm9low`
   - Parent LSN: `0/3D031F0`
   - Parent Timestamp: `2026-09-12T04:48:17Z`
   - Estado: `ready` (Preservada de forma permanente)

---

## 3. Catálogos Normalizados de Neon `main`

La comparación formal entre la rama de referencia limpia (aplicando `0001`–`0037` secuencialmente) y Neon `main` certifica:

| Tipo de Objeto | Conteo en Referencia | Conteo en `main` | Discrepancias | Veredicto |
|---|---|---|---|---|
| Tablas base | 29 | 29 | 0 | **MATCH** |
| Columnas | 165 | 165 | 0 | **MATCH** |
| Restricciones (Constraints) | 68 | 68 | 0 | **MATCH** |
| Índices secundarios | 136 | 136 | 0 | **MATCH** |
| Vistas | 4 | 4 | 0 | **MATCH** |
| Rutinas / Funciones | 218 | 218 | 0 | **MATCH** |
| Triggers | 5 | 5 | 0 | **MATCH** |
| Extensiones | 2 (`btree_gist`, `plpgsql`) | 2 (`btree_gist`, `plpgsql`) | 0 | **MATCH** |

### 3.1 Vistas Canónicas Verificadas
- `current_person_roles`
- `current_employee_areas`
- `current_person_access_scopes`
- `current_reporting_relationships`

### 3.2 Funciones Canónicas Verificadas
- `check_employee_profile_person_link_validity`
- `check_organization_person_employee_link_validity`
- `check_reporting_relationship_validity`
- `check_employee_area_period_labor_validity`
- `transfer_organization_ownership_temporal`
- `check_employee_profile_labor_tenure_update`

### 3.3 Triggers Canónicos Verificados (Triggers Totales del Esquema: 5 / Triggers Temporales: 5)
El esquema completo de la base de datos cuenta exactamente con **5 triggers en total**, los cuales corresponden unívocamente a los **5 triggers del modelo organizativo temporal** introducidos en las migraciones `0036` y `0037` (no existen triggers legacy adicionales en el esquema):
1. `trg_check_employee_profile_person_link` (en `employee_profiles`, migración 0036)
2. `trg_check_organization_person_employee_link` (en `organization_people`, migración 0036)
3. `trg_check_reporting_relationship` (en `reporting_relationship_periods`, migración 0036)
4. `trg_check_employee_area_period_labor_validity` (en `employee_area_periods`, migración 0036)
5. `trg_check_employee_profile_labor_tenure` (en `employee_profiles`, migración 0037)

---

## 4. Recuentos Agregados y Preservación de Datos

Se garantizó la total preservación de datos sin exponer datos personales (PII):

### 4.1 Tablas Funcionales
- Organizaciones: 1
- Usuarios: 2
- Membresías: 2
- Empleados: 1
- Identidades OAuth: 1
- Personas de organización (`organization_people`): 2
- Perfiles de empleado (`employee_profiles`): 1
- Periodos de rol (`person_role_periods`): 2
- Periodos de ámbito de acceso (`person_access_scope_periods`): 2
- Turnos / Planificaciones / Áreas: 0

### 4.2 Organización Groundforce
- `organization_people`: 2
- `employee_profiles`: 1
- `employees` (legacy): 1
- `person_role_periods`: 2
- `memberships`: 2

---

## 5. Manifiesto del Ledger de Migraciones (0001–0037)

Todas las 37 migraciones se encuentran debidamente registradas en `_migrations` de Neon `main` y sincronizadas con el archivo versionado `docs/database/migration-baseline-main.json`.

| # | Migración | SHA-256 Checksum | Estado en `main` | Método de Conciliación |
|---|---|---|---|---|
| 0001 | `0001_init.sql` | `baebcb20a5665426177bfe35e1d713c4aebc86f0aa67d8f9914757c9ce3f5872` | APPLIED | Registro original histórico |
| 0002 | `0002_password_reset.sql` | `8710c0e3cd56424e6ff4e9fa509748b8bf3d8c11e61b18cc627402660d5b451c` | APPLIED | Materialización controlada en conciliación |
| 0003 | `0003_login_attempts.sql` | `48a0bb1ded832c3fdb1909a3495d4615a975765954dbe5ba8646b5a5ef01a733` | APPLIED | Registro en ledger (DDL preexistente) |
| 0004 | `0004_organization_plan.sql` | `91e542209b6ba09bb927db2ef0e816a6952dd8671fc60e9086e11894d077ffda` | APPLIED | Registro en ledger (DDL preexistente) |
| 0005 | `0005_employee_lifecycle.sql` | `923d83f0ac8324e93bb398be8e217a2fb6efc0d9f0003554b73b54784777ebec` | APPLIED | Registro en ledger (DDL preexistente) |
| 0006 | `0006_employee_pending_access.sql` | `23158701bb16dcf3aeeb8e7cc175e1141df9043744654b0faec4ce7cf69d659e` | APPLIED | Registro en ledger (DDL preexistente) |
| 0007 | `0007_remove_manager_role.sql` | `e29019d76c8cbdfd280eecfffc4e3752e391b1510ca1c1ae0eb3e13d11b22e11` | APPLIED | Registro en ledger (DDL preexistente) |
| 0008 | `0008_areas_optional.sql` | `acd546a00a8a1eb3d1c1626f21c29eeb13f890cf61e93892fb54b1d6118b6239` | APPLIED | Registro en ledger (DDL preexistente) |
| 0009 | `0009_format_profiles.sql` | `9359f6e52260ff09ec4821a8d4a94aeb53c1620d408ebc516641f6494cb6801a` | APPLIED | Registro en ledger (DDL preexistente) |
| 0010 | `0010_import_history.sql` | `2780e56ade8957813a3038676d4aa84050226315cf39f993d052be1bb5c024bc` | APPLIED | Registro en ledger (DDL preexistente) |
| 0011 | `0011_import_idempotency.sql` | `1c8521db1c94447f5cf40f81a79f6485ecb4e9f74a3f465c1cc6612739ea0fa0` | APPLIED | Registro en ledger (DDL preexistente) |
| 0012 | `0012_format_profiles_structurehash_uniqueness.sql` | `b80696f00fb738d8109675aa6c68b7596cf9952ec9e7ea9b02a98f121aa6618d` | APPLIED | Registro en ledger (DDL preexistente) |
| 0013 | `0013_membership_roles_owner.sql` | `f092bf212446f2dbe0b7fc6d116345ecf5ddcaef5c76949f53eec00c2cb62111` | APPLIED | Registro en ledger (DDL preexistente) |
| 0014 | `0014_single_owner_per_organization.sql` | `6323091e89ee0f16f315a6b0c20c4c478a54160350d5e12f604ecab81c3c9780` | APPLIED | Registro en ledger (DDL preexistente) |
| 0015 | `0015_membership_scoped_area.sql` | `d8ea224ed6b567d1217e9498a13a8904e57849e798e4f4b2383827284ebbf1ce` | APPLIED | Registro en ledger (DDL preexistente) |
| 0016 | `0016_organization_audit_events.sql` | `c3254bc0a10502a5c53155169a6566d86014e760bf64047f0705fb3c9b9c9e54` | APPLIED | Registro en ledger (DDL preexistente) |
| 0017 | `0017_schedules.sql` | `6ad8030d694294b46c435552fa1025a17ca8565fe95fbb06c401314982fa7c84` | APPLIED | Registro en ledger (DDL preexistente) |
| 0018 | `0018_schedule_versions.sql` | `d32a7bf152f1465bc579bfe4468f705a6396913e6488349faec608d810b4f84c` | APPLIED | Registro en ledger (DDL preexistente) |
| 0019 | `0019_shift_assignments.sql` | `233482e8a4870dafc819665c58963574d6f83196fb2ca96b528a964bbfe6d8ae` | APPLIED | Registro en ledger (DDL preexistente) |
| 0020 | `0020_shifts_schedule_version.sql` | `ab074c080f81d1ba70c1e08db421a1175eb207865c697858c2dd04d0ef7b469b` | APPLIED | Registro en ledger (DDL preexistente) |
| 0021 | `0021_shift_assignments_import_id.sql` | `5f1c9d4ff8a3818eecf937d5786ba17145ea6198f39563fc8a25c12e75e921d4` | APPLIED | Registro en ledger (DDL preexistente) |
| 0022 | `0022_shift_acknowledgements.sql` | `7612ac3aa7dc49aa66cf37c48364e7235a9638c4c70031ae55b7ca7cfb42e77b` | APPLIED | Registro en ledger (DDL preexistente) |
| 0023 | `0023_shift_comments.sql` | `f9b180e92a4cca4762c9540b6e1ba420df255a1097ef7a2245b7fb5f74e64f89` | APPLIED | Registro en ledger (DDL preexistente) |
| 0024 | `0024_change_requests.sql` | `c164df95e5c2692231ffbbd52e1c6b1297e596e1bdf69614ceae1c0683457a46` | APPLIED | Registro en ledger (DDL preexistente) |
| 0025 | `0025_notifications.sql` | `f87305d25ed4b2d56a032822a837c7ffbb85141e6268ee5f8a0fcfffa0e72251` | APPLIED | Registro en ledger (DDL preexistente) |
| 0026 | `0026_oauth_identities.sql` | `35a1b23a11823eb52f754fcfe20409a8ccf8c37d8d21c43147814421b5bebbba` | APPLIED | Registro en ledger (DDL preexistente) |
| 0027 | `0027_approval_policy.sql` | `a0482696c4137df7fffe9443c2c54ee9bf18dfae676b7e016f461e7e45211b43` | APPLIED | Registro en ledger (DDL preexistente) |
| 0028 | `0028_approval_requests.sql` | `a2c38221fb969966144e18fe8ba9c7d42cf387f654b9f0aa34f590fc36bfe6d5` | APPLIED | Registro en ledger (DDL preexistente) |
| 0029 | `0029_approval_decision_metadata.sql` | `2fbf8aa6416035fbbdb48d5d4d385ca3d3cfb5f6cb1936c53e8dd2c222ff47e0` | APPLIED | Registro en ledger (DDL preexistente) |
| 0030 | `0030_approval_rejection_metadata.sql` | `8ea716f78924f7e50085a2267df1460b13531b78e47087611ef4949514e82488` | APPLIED | Registro en ledger (DDL preexistente) |
| 0031 | `0031_approval_audit_event_types.sql` | `4aa67a5fb7a505b3ae6832dbbfa9794cb1f0088825fdb33cc17fbe8867a54823` | APPLIED | Registro en ledger (DDL preexistente) |
| 0032 | `0032_change_request_application.sql` | `ee5650fce3b97b0908866572eb1db23281045b7ea572cf93b95be6eec1020786` | APPLIED | Registro en ledger (DDL preexistente) |
| 0033 | `0033_import_outcome.sql` | `e2f0682d08cd7fc0bc5c38ee0d3813c9df0aa667ee83c92ff85fcfc7ea20c572` | APPLIED | Registro en ledger (DDL preexistente) |
| 0034 | `0034_shift_type_semantics.sql` | `da29372254c5c1630138947f631ae55b722255711684fa0c56ca5b4f2c002bc0` | APPLIED | Registro en ledger (DDL preexistente) |
| 0035 | `0035_operational_assignments.sql` | `a13922dc2e46b9a84a6c40a5bc93dd78fba88cb705021eb31a166cb9be3bebf7` | APPLIED | Registro en ledger (DDL preexistente) |
| 0036 | `0036_temporal_organizational_model.sql` | `49793386495759efc39bf5ceeb6ba2d287bb24f72782e34bf54c6052f5822f7a` | APPLIED | Registro en ledger (DDL preexistente) |
| 0037 | `0037_temporal_ownership_transfer_and_labor_integrity.sql` | `9cf3769c615878fe943f606834b6f005fbc5725287f3b52d9a62bc7ff6e65a04` | APPLIED | Registro en ledger (DDL preexistente) |


### 5.1 Estado Actual de `main` y Migración `0038`
- **Neon `main` permanece en la migración `0037`**: El ledger `_migrations` en `main` contiene exactamente 37 registros continuos y válidos.
- **Migración `0038_migration_ledger_checksums.sql` preparada en repositorio**: Introduce la columna `checksum` en `_migrations`, impone la restricción `CHECK (checksum ~ '^[0-9a-f]{64}$')`, retroalimenta los checksums canónicos SHA-256 de las migraciones `0001`–`0037`, y fija la columna como `NOT NULL`.
- **Validada exclusivamente en ramas efímeras**: Ha sido probada con éxito total en ramas efímeras hijas acreditadas creadas a partir de `preview/development`, verificando rollback atómico y materialización sin errores.
- **Pendiente de autorización en `main`**: **NO ha sido aplicada a Neon `main`**. Al inspeccionar Neon `main` con `node db/migrate.mjs --status`, se reporta exactamente como 1 migración pendiente (`PENDING`), con estado global `READY` y código de salida `0`.

---

## 6. Procedimiento Obligatorio para Futuros Cambios

1. **PROHIBICIÓN DE EJECUCIÓN MANUAL**: Toda evolución del esquema debe realizarse mediante migraciones versionadas y aplicarse mediante `npm run db:migrate`.
2. **VERIFICACIÓN READ-ONLY PREVIA**: Todo agente o desarrollador debe ejecutar previamente `npm run db:migrate:status`.
3. **RAMAS EFÍMERAS ACREDITADAS**: Queda prohibido usar ramas persistentes para pruebas de integración. Las suites deben utilizar ramas efímeras creadas a partir de `preview/development`.
4. **PROTECCIÓN NO ELUDIBLE DE MAIN**: Toda migración que apunte a Neon `main` exige de forma simultánea: `--allow-main-migration`, el ID exacto de rama `--target-branch=br-solitary-thunder-b1hm9low` (no el alias "main") y confirmación explícita `--confirm-main-branch-id=br-solitary-thunder-b1hm9low`.

