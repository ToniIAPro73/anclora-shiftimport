# Línea Base del Esquema y Manifiesto de Migraciones de Neon `main`

**Fecha de conciliación y cierre**: 2026-09-12  
**Proyecto Neon**: `holy-cake-85660318`  
**Rama Neon conciliada y migrada**: `main` (`br-solitary-thunder-b1hm9low`)  
**Rama base de integración**: `preview/development` (`br-falling-heart-b1d6u2cx`)  
**Estado final del ledger (`_migrations`)**: **39 de 39 aplicadas (100% continuo, 0 pendientes, checksums NOT NULL verificados)**
**Catálogo post-0039**: **verificado (32 tablas públicas, 4 vistas, 222 rutinas, 10 triggers no internos, columna `checksum` + constraint de formato)**

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
- Posteriormente, tras endurecer de forma integral el runner de migraciones (`af6f96e`), validar ramas efímeras y certificar rollback atómico, se aplicó con éxito la migración `0038_migration_ledger_checksums.sql`.

---

## 2. Salvaguardas y Ramas de Respaldo Preservadas

Se mantienen tres ramas de respaldo independientes tipo time-travel en Neon:

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

3. **Backup Previo a Aplicación de Migración 0038**:
   - ID: `br-withered-forest-b17sj88w`
   - Nombre: `backup/pre-0038-application-20260912-124444`
   - Rama padre: `br-solitary-thunder-b1hm9low`
   - Parent LSN: `0/3E219F0`
   - Parent Timestamp: `2026-09-12T10:44:46Z`
   - Estado: `ready` (Preservada de forma permanente)

4. **Backup Previo a Aplicación de Migración 0039**:
   - ID: `br-quiet-sky-b10jw99v`
   - Nombre: `backup/pre-0039-application-20260912-174713`
   - Rama padre: `br-solitary-thunder-b1hm9low`
   - Parent LSN: `0/3EF0160`
   - Parent Timestamp: `2026-09-12T17:46:55Z`
   - Estado: `ready` (Preservada de forma permanente)
   - Protección: `false`, porque el proyecto usa el plan `free_v3`, que no admite ramas protegidas.
   - TTL: no configurado/visible en la respuesta de la API.

---

## 3. Catálogo actual de Neon `main`

El catálogo se volvió a consultar después de aplicar 0039. Los conteos siguientes son observaciones directas de PostgreSQL; los triggers se cuentan como objetos en `pg_trigger` excluyendo los internos.

| Tipo de objeto | Conteo observado en `main` | Verificación |
|---|---:|---|
| Tablas base públicas | 32 | **PASS** |
| Columnas públicas | 358 | **PASS** |
| Restricciones públicas | 409 | **PASS** |
| Índices públicos | 147 | **PASS** |
| Vistas públicas | 4 | **PASS** |
| Rutinas públicas | 222 | **PASS** |
| Triggers no internos | 10 | **PASS** |
| Extensiones | 2 (`btree_gist`, `plpgsql`) | **PASS** |

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

### 3.3 Triggers Canónicos Verificados (10 Objetos Trigger / 20 Filas en `information_schema.triggers`)
El esquema cuenta exactamente con **10 objetos trigger** no internos: los **5 triggers de integridad temporal** de `0036`/`0037` y los **5 triggers de integridad de acceso** de `0039` (sin triggers adicionales ni legacy):
1. `trg_check_employee_profile_person_link` (en `employee_profiles`, migración `0036`, eventos: `INSERT`, `UPDATE`)
2. `trg_check_organization_person_employee_link` (en `organization_people`, migración `0036`, eventos: `INSERT`, `UPDATE`)
3. `trg_check_reporting_relationship` (en `reporting_relationship_periods`, migración `0036`, eventos: `INSERT`, `UPDATE`)
4. `trg_check_employee_area_period_labor_validity` (en `employee_area_periods`, migración `0036`, eventos: `INSERT`, `UPDATE`)
5. `trg_check_employee_profile_labor_tenure` (en `employee_profiles`, migración `0037`, evento: `UPDATE`)

Triggers de acceso 0039:
6. `trg_check_user_access_invitation_integrity` (en `user_access_invitations`)
7. `trg_check_user_access_pending_person_on_person` (en `organization_people`)
8. `trg_check_user_access_pending_person_on_invitation` (en `user_access_invitations`)
9. `trg_guard_user_access_invitation_delete` (en `user_access_invitations`)
10. `trg_guard_user_access_invitation_mutation` (en `user_access_invitations`)

> [!NOTE]
> **Diferencia entre objetos trigger y filas en `information_schema.triggers`**:
> Una consulta directa a `information_schema.triggers` devuelve **20 filas** porque el estándar SQL modela cada combinación de (trigger, evento de disparo) como una fila independiente. El recuento real de objetos trigger en el catálogo (`pg_trigger` donde no sea interno) es exactamente **10**.

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

## 5. Manifiesto Canónico del Ledger de Migraciones (0001–0037)

Todas las 37 migraciones base se encuentran registradas en `_migrations` de Neon `main` y auditadas contra el archivo de manifiesto canónico versionado:
[`docs/database/migration-baseline-main.json`](./migration-baseline-main.json).

Dicho manifiesto constituye la **fuente canónica única de verdad** para los checksums SHA-256, versiones de baseline (`1.0.0`) y métodos de conciliación (`baseline_init`, `materialized_reconciliation`, `ledger_registration`) de las migraciones `0001` a `0037`.

El runner `db/migrate.mjs` carga este archivo mediante `loadBaselineManifest()` de forma estricta (fail-closed): valida la presencia del archivo, integridad JSON, unicidad de entradas, formato de 64 caracteres hexadecimales, versionado y método. Cualquier discrepancia o ausencia de registro produce de inmediato el estado `CHECKSUM_MISMATCH` o `CHECKSUM_UNVERIFIABLE` y un código de salida `1`.

### 5.1 Estado histórico de Neon `main` y Migración `0038`
- **Neon `main` actualizado a la migración `0038` antes de 0039**: El ledger `_migrations` en `main` contenía 38 registros continuos, íntegros y válidos.
- **Migración `0038_migration_ledger_checksums.sql` aplicada con éxito**:
  - Respaldo time-travel previo creado y preservado: `br-withered-forest-b17sj88w` (`backup/pre-0038-application-20260912-124444`, parent LSN `0/3E219F0`).
  - Ejecutada mediante el runner endurecido con API cerrada (`af6f96e`) y conexión directa no pooled.
  - Introduce la columna `checksum` en `_migrations` (`ALTER TABLE _migrations ADD COLUMN checksum TEXT;`).
  - Retroalimenta los 37 checksums canónicos SHA-256 de las migraciones `0001`–`0037`.
  - Impone la restricción de formato `_migrations_checksum_format_chk` (`CHECK (checksum ~ '^[0-9a-f]{64}$')`).
  - Fija la columna como obligatoria (`ALTER TABLE _migrations ALTER COLUMN checksum SET NOT NULL;`).
  - Registra atómicamente el checksum SHA-256 de `0038`.
- **Verificación en Neon `main`**:
  - `npm run db:migrate:status` (o `node db/migrate.mjs --status` con credenciales de `main`) reporta: 38 migraciones en repositorio, 38 aplicadas, 0 pendientes, 0 gaps, 0 desconocidas, estado `UP_TO_DATE`, exit code `0`.
  - Verificación de catálogo: columna `checksum` `is_nullable = 'NO'`, `data_type = 'text'`; constraint `_migrations_checksum_format_chk` presente.
  - Verificación de datos: Todos los 38 hashes coinciden exactamente con los archivos del repositorio en disco.
  - Preservación funcional 100%: Los recuentos de tablas funcionales (organizaciones: 1, usuarios: 2, membresías: 2, etc.) permanecieron exactamente idénticos tras la migración.

### 5.2 Normalización de Wrappers Legacy y Prohibición de Control Transaccional (después del baseline legacy)
- **Normalizador de SQL Legacy (`normalizeMigrationSql`)**: Históricamente, 29 migraciones heredadas (`0007`–`0013`, `0015`–`0036`) contenían wrappers exteriores `BEGIN;` y `COMMIT;`. Para evitar transacciones anidadas o confirmaciones prematuras del DDL antes de registrar el ledger, el runner utiliza un tokenizer SQL consciente de comentarios (`--` y `/* ... */`), cadenas de texto y bloques dólar (`$$`). En migraciones `0001`–`0037`, elimina de forma limpia el wrapper exterior y ejecuta el DDL dentro de la transacción unificada del runner.
- **Prohibición Estricta Después del Baseline Legacy**: A partir de la migración posterior al baseline legacy (`0001`–`0037`), está estrictamente prohibido incluir sentencias de control transaccional (`BEGIN`, `COMMIT`, `ROLLBACK`) dentro de los archivos de migración. El runner rechaza de forma fail-closed cualquier migración posterior al baseline que contenga estas sentencias en nivel superior.
- **Atomicidad Unificada del Runner**: Cada migración se ejecuta bajo una única transacción gobernada exclusivamente por el runner:
  ```sql
  BEGIN;
  -- DDL normalizado de la migración
  INSERT INTO _migrations (name, checksum) VALUES ($1, $2);
  COMMIT;
  ```
  En caso de fallo en cualquier instrucción del DDL o en la inserción del ledger, el runner ejecuta `ROLLBACK;` completo, garantizando que jamás queden tablas creadas ni estados a medio aplicar.

---

## 6. Procedimiento Obligatorio para Futuros Cambios

1. **PROHIBICIÓN DE EJECUCIÓN MANUAL**: Toda evolución del esquema debe realizarse mediante migraciones versionadas y aplicarse mediante `npm run db:migrate`.
2. **VERIFICACIÓN READ-ONLY PREVIA**: Todo agente o desarrollador debe ejecutar previamente `npm run db:migrate:status`.
3. **RAMAS EFÍMERAS ACREDITADAS**: Queda prohibido usar ramas persistentes para pruebas de integración. Las suites deben utilizar ramas efímeras creadas a partir de `preview/development`.
4. **PROTECCIÓN NO ELUDIBLE DE MAIN**: Toda migración que apunte a Neon `main` exige de forma simultánea: `--allow-main-migration`, el ID exacto de rama `--target-branch=br-solitary-thunder-b1hm9low` (no el alias "main") y confirmación explícita `--confirm-main-branch-id=br-solitary-thunder-b1hm9low`.

## 7. Cierre post-0039

- Aplicación: `0039_user_access_invitations_and_preferences.sql`, ejecutada el 2026-09-12 mediante `db/migrate.mjs`, conexión directa no pooled y acreditación explícita de `main`.
- SHA-256 publicado y aplicado: `7680b4a1e8572e05ecfc10ea240247ffa07cc0a841039308238db67706231dd8`.
- Estado comprobado después de aplicar: `UP_TO_DATE`, 39 registros consecutivos, 0 pendientes, 0 gaps, 0 desconocidas y 39 checksums coincidentes byte a byte con el repositorio.
- Objetos 0039 comprobados: `user_access_invitations`, `user_preferences`, `users.account_status`, 6 índices específicos, 6 constraints específicas, 4 rutinas de integridad y 5 triggers específicos.
- Recuentos funcionales conservados: 1 organización, 2 usuarios, 2 memberships, 1 empleado, 1 identidad OAuth, 2 personas organizativas, 1 perfil de empleado, 2 periodos de rol, 2 periodos de ámbito y 0 turnos/áreas.
- Las dos cuentas existentes quedaron `ACTIVE`; la identidad OAuth sigue sin contraseña local. El digest comparativo de credenciales no cambió; los hashes no se registran en esta documentación.
- El plan `free_v3` no permite ramas protegidas: actualmente hay 0 ramas protegidas y el backup pre-0039 queda conservado sin protección y sin TTL. La protección debe activarse al pasar a un plan compatible; no se debe simular con cambios de aplicación.
- Se generó un backup lógico custom independiente fuera del repositorio y se verificó con `pg_restore --list` y una restauración de prueba en una rama efímera. La ruta y el SHA-256 del archivo se entregan en el informe operativo, nunca su contenido.
