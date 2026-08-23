# Anclora ShiftImport — estructura funcional de Organization, Areas, Employees e Imports

## Objetivo

La aplicación debe soportar dos modelos de empresa sin obligar a una organización a utilizar áreas:

```text
Organization
├── Areas (0..N, opcionales)
├── Employees
├── Users / Memberships
├── Shift Types
├── Import Profiles
└── Shifts
```

## Regla principal: Areas son opcionales

Una empresa puede operar de dos formas válidas:

### Modelo A — Sin áreas

```text
Organization: Empresa Ejemplo
Areas: 0
Employees: N
Shift Types: compartidos por la organización
Imports: organization-scoped
Shifts: organization-scoped
```

La UI no debe exigir crear un área para continuar.

Si `areas.length === 0`, las acciones deben funcionar directamente contra la organización.

### Modelo B — Con áreas

```text
Organization: Anclora
Areas:
- Operaciones
- Administración
Employees: asignados opcionalmente a un área
Imports: pueden ejecutarse para un área concreta
Shift Types: pueden ser organization-scoped y reutilizables
Shifts: pertenecen siempre a la organización y pueden incluir areaId cuando aplique
```

## Entidades recomendadas

### Organization

```text
id
name
plan
type        # personal | company
createdAt
```

El `type` existente (`personal` para B2C, `company` para B2B) es independiente
del uso de áreas. Una organización `personal` normalmente seguirá con
`areas.length === 0`, pero el modelo no convierte las áreas en requisito para
ningún tipo de organización.

### Area

```text
id
organizationId
name
code
active
```

Restricción:

```text
UNIQUE (organizationId, normalized name/code)
```

`Area` no es obligatoria para utilizar ShiftImport.

### Employee

```text
id
organizationId
areaId?       # nullable
externalEmployeeId
name
userId?       # nullable solo en PENDING_ACCESS
status        # pending_access | active | inactive
```

Un Employee puede existir sin `areaId`.

### User / Membership

```text
User
└── Membership
    ├── organizationId
    └── role = ADMIN | EMPLOYEE
```

`ADMIN` puede tener Employee o no.

`EMPLOYEE` activo debe estar vinculado 1:1 a un Employee.

### Shift Type

Preferencia:

```text
organization-scoped
```

para que áreas distintas puedan reutilizar Mañana/Tarde/Noche/Central.

Un área puede usar todos o solo algunos tipos.

### Shift

```text
organizationId
employeeId
areaId?          # nullable / derivable
date
shiftTypeId
startTime
endTime
sourceImportId?
```

No hacer obligatorio `areaId`.

### Import

```text
organizationId
areaId?          # null = import de toda la organización
format
source filename
status
```

Esto permite:

```text
Empresa sin áreas
→ areaId = null

Empresa con áreas
→ areaId = Operaciones / Administración
```

## Import Profiles

El formato no define el área y el área no define el formato.

Debe ser válido:

```text
Operaciones → PDF hoy
Operaciones → XLSX mañana
Administración → CSV
```

y también:

```text
Organization sin áreas → PDF / CSV / XLSX / futuro JSON/XML
```

Los perfiles de formato deben poder asociarse a organización y opcionalmente a áreas, sin convertir Area en requisito.

## UX esperada

### Organización sin áreas

No mostrar pasos obligatorios de "Crear área".

Mostrar:

```text
Empresa
Empleados
Tipos de turno
Importar turnos
```

### Organización con áreas

Mostrar:

```text
Empresa
Áreas
  Operaciones
  Administración
Empleados
Importar turnos
```

El selector de área debe incluir conceptualmente:

```text
Toda la empresa
Operaciones
Administración
```

cuando el flujo permita un import organization-scoped.

## Acceptance obligatorio

Debe existir cobertura para:

```text
Organization con 0 areas
→ roster import funciona
→ employee manual funciona
→ shift import funciona

Organization con 2 areas
→ roster asigna employees por area
→ import área A no contamina área B
→ employees sin area siguen siendo válidos si el producto lo permite
```

El escenario principal de este paquete usa dos áreas para probar el modelo más rico, pero la implementación NO debe convertir Areas en obligatorias.
