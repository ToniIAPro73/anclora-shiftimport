# Modelo Organizativo Temporal y Normalizado — Fase 1

**Documento Canónico**: `docs/product/TEMPORAL_ORGANIZATIONAL_MODEL.md`  
**Estado**: APROBADO / FUNDACIONAL (Fase 1 completada)  
**Fecha**: 2026-09-12  
**Alcance**: Anclora ShiftImport — Núcleo de Personas, Empleados, Asignaciones, Alcances y Relaciones Temporales Multi-Tenant

---

## 1. Visión y Objetivos

El modelo organizativo de **Anclora ShiftImport** evoluciona desde un esquema estático basado en membresías fijas (`memberships`) y empleados ligados rígidamente a un único área (`employees.area_id`), hacia una arquitectura normalizada, desacoplada y temporalmente versionada.

### Objetivos Clave de la Fase 1
1. **Desacoplar Identidad Personal de Identidad de Acceso**:
   - Una **Persona** (`organization_people`) representa al individuo dentro de la organización.
   - Un **Usuario** (`users`) es una credencial de autenticación opcional (puede o no existir).
   - Un **Perfil de Empleado** (`employee_profiles`) es una ficha laboral con su propio ciclo de vida e histórico.
2. **Vigencia Temporal Estricta**:
   - Toda asignación de rol, pertenencia a áreas, alcance de supervisión o jerarquía cuenta con `valid_from` (inclusivo) y `valid_to` (inclusivo o `NULL` para periodos abiertos/indefinidos).
   - Integridad temporal garantizada en base de datos mediante extensiones `btree_gist` y restricciones de exclusión `EXCLUDE USING gist` sobre rangos discretos `daterange(valid_from, valid_to, '[]')`.
3. **Separación de Responsabilidades Operativas**:
   - **Pertenencia Funcional** (`employee_area_periods`): dónde trabaja el empleado y a qué centro de coste/cuadrante pertenece.
   - **Autorización y Alcances** (`person_access_scope_periods`): sobre qué áreas o personas tiene potestad de visualización o planificación un planificador/administrador.
   - **Supervisión y Aprobación** (`reporting_relationship_periods`): quién aprueba solicitudes, supervisa operativamente o recibe escalados.
4. **Garantía Multi-Tenant en Catálogo PostgreSQL**:
   - Claves foráneas compuestas que incluyen siempre `(id, organization_id)` impiden estructuralmente cualquier enlace cruzado entre organizaciones, incluso ante errores en capas superiores de software.
5. **Coexistencia y Compatibilidad Retroactiva**:
   - Las tablas legacy (`memberships`, `employees`, `operational_assignments`, `area_responsibles`) continúan operativas durante la transición.
   - Migración 0036 aditiva con backfill determinista e idempotente.
   - Vistas canónicas (`current_*`) que resuelven la fotografía operativa del día actual sin coste de migración destructiva.

---

## 2. Diagrama Entidad-Relación (Mermaid ERD)

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ ORGANIZATION_PEOPLE : contains
    ORGANIZATIONS ||--o{ AREAS : defines
    USERS |o--o| ORGANIZATION_PEOPLE : "authenticates as"
    
    ORGANIZATION_PEOPLE ||--o| EMPLOYEE_PROFILES : "has operational profile"
    ORGANIZATION_PEOPLE ||--o{ PERSON_ROLE_PERIODS : "holds temporal roles"
    ORGANIZATION_PEOPLE ||--o{ PERSON_ACCESS_SCOPE_PERIODS : "holds access scopes"
    ORGANIZATION_PEOPLE ||--o{ REPORTING_RELATIONSHIP_PERIODS : "supervises as supervisor"
    ORGANIZATION_PEOPLE ||--o{ REPORTING_RELATIONSHIP_PERIODS : "subordinate to supervisor"
    
    EMPLOYEE_PROFILES ||--o{ EMPLOYEE_AREA_PERIODS : "assigned to areas over time"
    AREAS ||--o{ EMPLOYEE_AREA_PERIODS : "receives assignments"
    AREAS ||--o{ PERSON_ACCESS_SCOPE_PERIODS : "target of scope"

    ORGANIZATION_PEOPLE {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK "nullable"
        text status "ACTIVE | INACTIVE | SUSPENDED"
        timestamptz created_at
        timestamptz updated_at
    }

    EMPLOYEE_PROFILES {
        uuid id PK
        uuid organization_id FK
        uuid organization_person_id FK
        text external_employee_id "nullable"
        text employee_name
        text employment_status "ACTIVE | LEAVE | TERMINATED"
        date started_on "nullable"
        date ended_on "nullable"
    }

    PERSON_ROLE_PERIODS {
        uuid id PK
        uuid organization_id FK
        uuid organization_person_id FK
        text role "OWNER | ADMIN | PLANNER | EMPLOYEE"
        date valid_from
        date valid_to "nullable"
        text source "SYSTEM | ONBOARDING | MANUAL | IMPORT"
    }

    EMPLOYEE_AREA_PERIODS {
        uuid id PK
        uuid organization_id FK
        uuid employee_profile_id FK
        uuid area_id FK
        date valid_from
        date valid_to "nullable"
        boolean is_primary
        text source
    }

    PERSON_ACCESS_SCOPE_PERIODS {
        uuid id PK
        uuid organization_id FK
        uuid organization_person_id FK
        text scope_type "ORGANIZATION | AREA | PERSON"
        uuid area_id FK "nullable"
        uuid target_person_id FK "nullable"
        date valid_from
        date valid_to "nullable"
    }

    REPORTING_RELATIONSHIP_PERIODS {
        uuid id PK
        uuid organization_id FK
        uuid supervisor_person_id FK
        uuid subordinate_person_id FK
        text relationship_type "ADMIN_PLANNER | ADMIN_EMPLOYEE | PLANNER_EMPLOYEE"
        date valid_from
        date valid_to "nullable"
        boolean is_primary
    }
```

---

## 3. Definición Formal de Entidades y Cardinalidades

### 3.1. `organization_people`
Representa el nodo raíz de cualquier persona adscrita a la organización, independientemente de que posea credenciales o contrato laboral.
- **Campos**:
  - `id` (UUID PK)
  - `organization_id` (UUID NOT NULL, FK `organizations.id` ON DELETE CASCADE)
  - `user_id` (UUID NULLABLE, FK `users.id` ON DELETE SET NULL): Referencia a credencial de acceso.
  - `status` (TEXT NOT NULL DEFAULT 'ACTIVE'): `ACTIVE`, `INACTIVE`, `SUSPENDED`.
  - `created_at`, `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- **Restricciones**:
  - `UNIQUE (id, organization_id)`: Permite claves compuestas multi-tenant dependientes.
  - `UNIQUE (organization_id, user_id)`: Un usuario solo puede estar vinculado a una persona por organización.

### 3.2. `employee_profiles`
Ficha laboral operativa del trabajador.
- **Campos**:
  - `id` (UUID PK): Coincide con `employees.id` legacy para mantener compatibilidad transparente con `shifts.employee_id`.
  - `organization_id` (UUID NOT NULL)
  - `organization_person_id` (UUID NOT NULL): Vincula la ficha laboral con la persona.
  - `external_employee_id` (TEXT NULLABLE): Matrícula, nómina o código de cuadrante externo.
  - `employee_name` (TEXT NOT NULL)
  - `employment_status` (TEXT NOT NULL DEFAULT 'ACTIVE'): `ACTIVE`, `LEAVE`, `TERMINATED`.
  - `started_on` (DATE NULLABLE), `ended_on` (DATE NULLABLE)
- **Restricciones**:
  - `UNIQUE (id, organization_id)`
  - `UNIQUE (organization_person_id, organization_id)`: 1:1 en Fase 1 entre Persona y Perfil de Empleado dentro de la organización.
  - FK compuesta `(organization_person_id, organization_id) REFERENCES organization_people (id, organization_id) ON DELETE CASCADE`.

### 3.3. `person_role_periods`
Vigencia temporal del rol de una persona dentro de la organización.
- **Campos**:
  - `id` (UUID PK)
  - `organization_id` (UUID NOT NULL)
  - `organization_person_id` (UUID NOT NULL)
  - `role` (TEXT NOT NULL): `OWNER`, `ADMIN`, `PLANNER`, `EMPLOYEE`.
  - `valid_from` (DATE NOT NULL), `valid_to` (DATE NULLABLE)
  - `source` (TEXT NOT NULL DEFAULT 'SYSTEM')
- **Restricciones**:
  - CHECK `valid_to IS NULL OR valid_to >= valid_from`.
  - `EXCLUDE USING gist`: Impide que la misma persona tenga dos periodos de rol superpuestos en el tiempo:
    ```sql
    EXCLUDE USING gist (
      organization_person_id WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    )
    ```

### 3.4. `employee_area_periods`
Asignación de un empleado a una o varias áreas operativas a lo largo del tiempo.
- **Campos**:
  - `id` (UUID PK)
  - `organization_id` (UUID NOT NULL)
  - `employee_profile_id` (UUID NOT NULL)
  - `area_id` (UUID NOT NULL)
  - `valid_from` (DATE NOT NULL), `valid_to` (DATE NULLABLE)
  - `is_primary` (BOOLEAN NOT NULL DEFAULT false): Indica si es el área principal/por defecto.
  - `source` (TEXT NOT NULL DEFAULT 'SYSTEM')
- **Restricciones**:
  - FK `(employee_profile_id, organization_id) REFERENCES employee_profiles (id, organization_id) ON DELETE CASCADE`.
  - FK `(area_id, organization_id) REFERENCES areas (id, organization_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`. (Protege el histórico impidiendo el borrado directo de áreas activas o pasadas, permitiendo al mismo tiempo el borrado ordenado en cascada si se destruye la organización completa).
  - CHECK `valid_to IS NULL OR valid_to >= valid_from`.
  - `EXCLUDE USING gist`: Impide asignar dos veces al mismo empleado al **mismo área** en fechas superpuestas:
    ```sql
    EXCLUDE USING gist (
      employee_profile_id WITH =,
      area_id WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    )
    ```
  - `EXCLUDE USING gist`: Garantiza a lo sumo **un único área principal** (`is_primary = true`) simultánea para el empleado:
    ```sql
    EXCLUDE USING gist (
      employee_profile_id WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    ) WHERE (is_primary = true)
    ```

### 3.5. `person_access_scope_periods`
Alcance temporal de autorización de una persona (para `ADMIN` o `PLANNER`).
- **Campos**:
  - `id` (UUID PK)
  - `organization_id` (UUID NOT NULL)
  - `organization_person_id` (UUID NOT NULL)
  - `scope_type` (TEXT NOT NULL): `ORGANIZATION`, `AREA`, `PERSON`.
  - `area_id` (UUID NULLABLE)
  - `target_person_id` (UUID NULLABLE)
  - `valid_from` (DATE NOT NULL), `valid_to` (DATE NULLABLE)
- **Restricciones**:
  - CHECK de consistencia de destino:
    - `scope_type = 'ORGANIZATION'` ⇒ `area_id IS NULL AND target_person_id IS NULL`.
    - `scope_type = 'AREA'` ⇒ `area_id IS NOT NULL AND target_person_id IS NULL`.
    - `scope_type = 'PERSON'` ⇒ `target_person_id IS NOT NULL AND area_id IS NULL`.
  - FK multi-tenant hacia `organization_people` y `areas`.
  - `EXCLUDE USING gist`: Impide duplicar el mismo alcance idéntico en fechas superpuestas.

### 3.6. `reporting_relationship_periods`
Líneas de reporte, aprobación y supervisión temporal.
- **Campos**:
  - `id` (UUID PK)
  - `organization_id` (UUID NOT NULL)
  - `supervisor_person_id` (UUID NOT NULL)
  - `subordinate_person_id` (UUID NOT NULL)
  - `relationship_type` (TEXT NOT NULL): `ADMIN_PLANNER`, `ADMIN_EMPLOYEE`, `PLANNER_EMPLOYEE`.
  - `valid_from` (DATE NOT NULL), `valid_to` (DATE NULLABLE)
  - `is_primary` (BOOLEAN NOT NULL DEFAULT false)
- **Restricciones**:
  - CHECK `supervisor_person_id <> subordinate_person_id` (impide auto-supervisión).
  - FK multi-tenant compuestas hacia `organization_people`.
  - `EXCLUDE USING gist`: Impide duplicar exactamente la misma relación en el mismo intervalo.
  - `EXCLUDE USING gist`: A lo sumo **un único supervisor principal** para el mismo subordinado y tipo de relación:
    ```sql
    EXCLUDE USING gist (
      subordinate_person_id WITH =,
      relationship_type WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    ) WHERE (is_primary = true)
    ```

---

## 4. Semántica Temporal

### 4.1. Por qué `daterange(valid_from, valid_to, '[]')`
1. **Discretización Calendárica**:
   - Los turnos, contratos, bajas y planificaciones en el ámbito laboral operan en días naturales (`YYYY-MM-DD`). Los sellos de tiempo (`timestamptz`) introducen anomalías de huso horario (`00:00Z` vs `23:00 local`).
   - El constructor `daterange(from, to, '[]')` genera un rango cerrado en ambos extremos: el día `valid_from` y el día `valid_to` están **incluidos**.
2. **Periodos Abiertos (`valid_to IS NULL`)**:
   - Cuando `valid_to` es `NULL`, PostgreSQL interpreta el límite superior como infinito (`[from, )`). Esto permite modelar asignaciones activas indefinidas sin necesidad de fechas artificiales como `9999-12-31`.
3. **Detección Estricta de Solapamiento (`&&`)**:
   - Dos periodos `[2026-01-01, 2026-06-30]` y `[2026-07-01, 2026-12-31]` son **adyacentes y disjuntos**. No colisionan.
   - Si un segundo periodo inicia el `2026-06-30`, el operador `&&` detecta la colisión el día `30` y PostgreSQL rechaza la inserción mediante la exclusión GiST.

### 4.2. Consulta de "Fotos Históricas" (Point-in-Time)
Para conocer el estado exacto de una asignación en una fecha fija `$target_date`:
```sql
SELECT *
FROM employee_area_periods
WHERE employee_profile_id = $1
  AND daterange(valid_from, valid_to, '[]') @> $target_date::date;
```
El operador `@>` (contiene elemento) evalúa en $O(\log N)$ gracias a los índices especializados `(organization_id, valid_from, valid_to)`.

---

## 5. Garantía Multi-Tenant

Para evitar cualquier posibilidad de fuga de datos entre organizaciones (incluso por errores de inyección o IDs forjados en APIs), todas las tablas del modelo temporal implementan:

1. **Clave Foránea Compuesta a Nivel de Catálogo**:
   - `areas` posee `UNIQUE (id, organization_id)`.
   - `organization_people` posee `UNIQUE (id, organization_id)`.
   - `employee_profiles` posee `UNIQUE (id, organization_id)`.
2. **Validación Automática de Pertenencia**:
   - Al insertar en `employee_area_periods`, PostgreSQL exige que `(area_id, organization_id)` coincida exactamente con un registro en `areas`. Si un atacante envía un `area_id` de la Organización B operando en la Organización A, la base de datos aborta con violación de clave foránea.

---

## 6. Coexistencia con el Modelo Legacy y Backfill

### 6.1. Tablas Legacy Mantenidas en Fase 1
* `memberships`: Permanece como fuente de autenticación y roles para endpoints legacy.
* `employees`: Sigue recibiendo escrituras y consultas directas; cada `employees.id` equivale a `employee_profiles.id`.
* `shifts`: Sigue enlazando a `shifts.employee_id`.

### 6.2. Estrategia de Backfill Idempotente
La migración `0036_temporal_organizational_model.sql` incluye un backfill automático:
1. **Usuarios con membresía** ⇒ Crea fila en `organization_people` con `user_id`.
2. **Empleados sin usuario** ⇒ Crea fila en `organization_people` con `user_id = NULL` y genera `employee_profiles` vinculada.
3. **Empleados vinculados a usuario** ⇒ Enlaza `employee_profiles` con la persona correspondiente creada en el paso 1.
4. **Membresías activas** ⇒ Crea periodos en `person_role_periods` con `source = 'LEGACY_CURRENT_STATE'`, `valid_from = COALESCE(created_at, '2026-01-01')`.
5. **Asignaciones de área** ⇒ Migra `operational_assignments` y `employees.area_id` a `employee_area_periods`.
6. **Responsables de área** ⇒ Migra `area_responsibles` a `reporting_relationship_periods` de tipo `PLANNER_EMPLOYEE`.

---

## 7. Vistas Canónicas de Lectura Directa

Para simplificar el consumo en servicios de backend y frontend sin necesidad de construir manualmente rangos GiST en cada SELECT, la migración 0036 publica 4 vistas canónicas que resuelven el estado vigente hoy (`CURRENT_DATE`):

1. `current_person_roles`:
   - Roles activos en la fecha actual (`role`, `valid_from`, `valid_to`).
2. `current_employee_areas`:
   - Asignaciones de área activas hoy, con `area_name`, `is_primary`, `employment_status`.
3. `current_person_access_scopes`:
   - Alcances vigentes hoy (`ORGANIZATION`, `AREA`, `PERSON`).
4. `current_reporting_relationships`:
   - Relaciones de reporte activas hoy con nombres de supervisor y subordinado.

---

## 8. Matriz de Combinaciones Válidas

| Tipo de Sujeto | `user_id` en Persona | Perfil Empleado | Rol en `person_role_periods` | Casos de Uso Reales |
|---|:---:|:---:|:---:|---|
| **Operario de Planta / Turno** | `NULL` | Sí | `EMPLOYEE` | Empleado de cuadrante sin acceso informático al portal. |
| **Operario con Portal Móvil** | UUID | Sí | `EMPLOYEE` | Empleado que consulta cuadrantes y solicita cambios en autoservicio. |
| **Planificador de Turnos** | UUID | No / Opcional | `PLANNER` | Administrativo de tráfico que planifica turnos de un área sin realizarlos él mismo. |
| **Planificador con Turnos** | UUID | Sí | `PLANNER` | Jefe de equipo o supervisor de rampa que realiza turnos y a la vez planifica a sus pares. |
| **Administrador / RRHH** | UUID | No / Opcional | `ADMIN` | Gestor global sin turnos asignados. |
| **Propietario / Owner** | UUID | No / Opcional | `OWNER` | Dueño de la organización. |
| **Ex-empleado / Baja** | UUID o `NULL` | Sí (`TERMINATED`) | Inactivo | Histórico archivado preservando turnos y trazabilidad. |

---

## 9. Próximos Pasos (Fases 2 y 3)

* **Fase 2 (Doble Escritura y Capa de Dominio)**:
  - Los endpoints de onboarding, gestión de miembros y asignación de turnos escribirán simultáneamente en el modelo legacy y en el modelo temporal.
  - La resolución de turnos y validación de permisos consumirá `api/_lib/temporal-org-model.js`.
* **Fase 3 (Deprecación Legacy)**:
  - Retirada de columnas redundantes `employees.area_id` y `memberships.role`.
  - Migración completa de los cuadrantes hacia `employee_profiles`.
