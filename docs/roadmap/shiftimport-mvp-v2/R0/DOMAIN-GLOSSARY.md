# Domain Glossary — Anclora ShiftImport

Fuente de verdad terminológica para todas las specs de `docs/roadmap/shiftimport-mvp-v2/`. En caso de conflicto entre una spec y este glosario, gana el glosario salvo revisión explícita documentada en esa spec.

Vocabulario extraído de `db/migrations/*.sql` y `api/_lib/data.js` (ver `../00-BASELINE.md`, sección "Modelo DB").

## Entidades núcleo

### Organization

- **Tabla**: `organizations` (id, name, plan)
- **Significado**: el tenant raíz. Toda entidad de negocio (Employee, Area, Import, Shift, Membership) cuelga de una Organization vía `organization_id`. Aislamiento multi-tenant estricto: ninguna consulta cruza organizaciones.
- **EN**: Organization / **ES**: Organización

### Membership

- **Tabla**: `memberships` (user_id, organization_id) PK compuesta, `role CHECK IN ('ADMIN','EMPLOYEE')`
- **Significado**: la relación entre un `User` y una `Organization`, portadora del rol. Un usuario puede tener memberships en varias organizaciones (multi-tenant real, no solo aislamiento de datos).
- **Estados de `role`** (hoy): `ADMIN`, `EMPLOYEE`. Modelo objetivo `OWNER`/`ADMIN`/`PLANNER`/`EMPLOYEE` — ver R0-M03/R2-M06 (no implementado aún).
- **EN**: Membership / **ES**: Membresía (no "Afiliación", no "Rol" a secas — el rol es un atributo de la membership, no la entidad)

### Employee

- **Tabla**: `employees` (id, organization_id, external_employee_id, name, user_id nullable, status, deactivated_at, area_id nullable)
- **Significado**: una persona que recibe turnos dentro de una Organization. Puede existir sin login (`user_id` nulo — "roster-only"): un Employee no es lo mismo que un User. Único por `(organization_id, external_employee_id)` cuando ese campo está presente.
- **Estados de `status`**:
  - `pending_access`: Employee creado (por import o alta manual) pero sin usuario vinculado con acceso, o vinculado pero aún no activado.
  - `active`: Employee operativo, recibe turnos y (si tiene `user_id`) puede iniciar sesión.
  - `inactive`: Employee dado de baja (`deactivated_at` registrado). No recibe turnos nuevos.
- **EN**: Employee / **ES**: Empleado

### Area

- **Tabla**: `areas` (id, organization_id, name, code, active)
- **Significado**: subdivisión **opcional** de una Organization. Una organización puede tener 0..N áreas; nunca es obligatorio asignar un Employee o un Import a un área.
- **Qué NO es**: Area no es "Team" ni "WorkCenter". Esos son conceptos de R9 (Advanced Organizational Model, post-MVP) con relaciones configurables y opcionales — no una jerarquía rígida `WorkCenter → Area → Team`. No introducir esos términos como sinónimos de Area en specs R0-R5.
- **EN**: Area / **ES**: Área (no "Zona", no "Departamento")

### Import

- **Tabla**: `imports` (id, organization_id, imported_by_user_id, file_name, source_format, period_year/month, status, area_id, import_mode, period_kind, period_label, scope_type, area_name_snapshot, employee_count, shift_count, created_shift_count, existing_shift_count, file_fingerprint, deleted_at, deleted_by_user_id, employee_id, context_fingerprint)
- **Significado**: el registro de un evento de ingestión de un documento (PDF/Excel/CSV) que produjo (o intentó producir) Shifts. Es el núcleo del diferencial "Safe Import".
- **Estados de `status`**: `pending`, `completed`, `failed`.
- **`import_mode`**: `individual` (un empleado) vs `team` (varios empleados detectados en el mismo documento).
- **Borrado**: lógico (`deleted_at`/`deleted_by_user_id`), nunca físico sobre el import; los Shifts asociados sí se borran físicamente por `import_id` al hacer rollback de un import (ver R1-M10).
- **Qué NO es**: Import no es un Schedule. Un Import produce Shifts ya confirmados (histórico u operativo actual); un Schedule (R3, no implementado) es una estructura de planificación futura en borrador antes de publicarse. No usar "Import" para referirse a planificación futura.
- **EN**: Import / **ES**: Importación

### Shift

- **Tabla**: `shifts` (id, organization_id, employee_id, import_id nullable, date, start_time, end_time, location, origin, area_id, semantic_fingerprint)
- **Significado**: un turno concreto de un Employee en una fecha. `import_id` nulo significa alta manual (no proviene de una importación). Sin `UNIQUE` en `date` — un mismo día puede tener turnos partidos por diseño.
- **EN**: Shift / **ES**: Turno

### Format Profile

- **Tabla**: `format_profiles` (id, organization_id, logical_profile_id, version, status, signature jsonb con structureHash, source_type, display_name, parser_config, token_aliases, code_times, off_tokens, employee_row_strategy, employee_row_index, day_column_map, tabular_memory, use_count, successful_use_count, last_used_at, created_by_user_id, supersedes_profile_id)
- **Significado**: memoria de formato de documento por organización ("formato aprendido"). Permite reconocer un documento ya visto por su `structureHash` y reutilizar la configuración de parseo sin volver a analizarlo desde cero.
- **Estados de `status`**: `candidate` → `validated` → `verified` → `legacy` → `deprecated`. Un perfil `deprecated` puede ser sustituido por otro vía `supersedes_profile_id`.
- **EN**: Format Profile / **ES**: Perfil de formato (a veces referido como "formato aprendido" en UI/copy)

## Límites y no-conceptos

- **Area ≠ Team ≠ WorkCenter**: solo Area existe hoy. Team y WorkCenter son R9 (post-MVP), con relaciones configurables, no jerarquía fija.
- **Import ≠ Schedule**: Import es ingestión de datos ya confirmados; Schedule (R3, no implementado) es planificación futura en borrador con su propio ciclo `Schedule` → `ScheduleVersion` → `ShiftAssignment`.
- **Employee ≠ User**: un Employee puede no tener `user_id` (roster-only, sin acceso). User es la identidad de login; Employee es el sujeto operativo que recibe turnos.
- **Membership.role ≠ modelo RBAC objetivo**: hoy solo `ADMIN`/`EMPLOYEE` existen en el CHECK constraint de `memberships`. `OWNER`/`PLANNER` y los scopes `ORGANIZATION`/`AREA`/`SELF` son diseño de R0-M03, ejecución de R2-M06/M07 — no confundir con el estado actual.
- **Shift (turno ya confirmado) ≠ ShiftAssignment (R3, asignación dentro de un borrador de planificación)**: mismo campo semántico (turno de un empleado en una fecha) pero ciclos de vida distintos; no fusionar ambos conceptos en una spec.

## Tabla de términos EN↔ES

| EN | ES |
|---|---|
| Organization | Organización |
| Membership | Membresía |
| Role | Rol |
| Employee | Empleado |
| Area | Área |
| Import | Importación |
| Shift | Turno |
| Format Profile | Perfil de formato |
| Schedule (futuro, R3) | Cuadrante / Planificación |
| ScheduleVersion (futuro, R3) | Versión de planificación |
| ShiftAssignment (futuro, R3) | Asignación de turno |
| Acknowledgement (futuro, R4) | Confirmación de lectura |
| Change Request (futuro, R4/R5) | Solicitud de cambio |
| Approval (futuro, R5) | Aprobación |

## Consistencia con 00-ROADMAP-MASTER.md

Revisado T03: los nombres de microfase y las columnas "Objetivo" de `../00-ROADMAP-MASTER.md` usan exactamente estos términos (Organization, Employee, Area, Import, Shift, Membership/Roles, Format Profile para R0-R2; Schedule/ScheduleVersion/ShiftAssignment para R3; Acknowledgement/Change Request para R4; Approval/ApprovalPolicy para R5). Sin discrepancias detectadas.
