# R9 — Advanced Organizational Model (POST-MVP, macro spec)

## Propósito y alcance

Generalizar el modelo organizativo del MVP (Organization → 0..N Areas → Employees, R2) hacia relaciones configurables y opcionales: centros de trabajo, equipos, líneas de reporte, roles personalizados.

## Por qué es post-MVP

R2 (Organization Foundation) deliberadamente NO obliga a una jerarquía WorkCenter→Area→Team, y R0-M03/R2-M06 fijan un RBAC mínimo de 4 roles fijos (OWNER/ADMIN/PLANNER/EMPLOYEE), no roles personalizables. Introducir R9 antes de validar el MVP arriesgaría exactamente la sobre-ingeniería que el master prompt prohíbe (§1: "no debe convertirse en... ERP... HRIS completo"). R9 solo tiene sentido si el piloto demuestra que 2 roles fijos + áreas opcionales resultan insuficientes para organizaciones reales.

## Modelo de dominio sketch

```text
WorkCenter          — ubicación física/operativa opcional, no jerárquicamente obligatoria sobre Area
Team                — agrupación opcional dentro o cruzando Areas
ReportingLine        — relación opcional empleado→responsable, generaliza el AREA_RESPONSIBLE fijo de R5-M01
CustomRole            — rol definido por la organización, más allá de OWNER/ADMIN/PLANNER/EMPLOYEE
RolePermission        — mapeo capability→CustomRole
RoleAssignment        — membership→CustomRole (sustituye/extiende memberships.role fijo de R0-M03)
Delegation             — cesión temporal de capacidad de aprobación/gestión de un usuario a otro
```

**Restricción explícita heredada del master prompt (§21):** estas relaciones deben ser configurables y opcionales — NO una jerarquía rígida `WorkCenter → Area → Team`. Cualquier spec futura de R9 que imponga un orden fijo obligatorio contradice esta decisión y debe detenerse para reconciliación.

## Relación con la base MVP

- `ReportingLine` sustituiría la resolución simplificada de `AREA_RESPONSIBLE` de R5-M01 (hoy: ADMIN por área o fallback a cualquier ADMIN) por una cadena real de responsables — requeriría migrar `area_responsibles` (R5-M01) hacia el nuevo modelo sin romper el historial de auditoría de aprobaciones ya decididas.
- `CustomRole`/`RolePermission`/`RoleAssignment` reemplazarían el CHECK constraint fijo de 4 roles introducido en R0-M03 — migración de datos no trivial, análoga en riesgo a la migración de 2→4 roles que R0-M03 ya identificó como sensible.
- `WorkCenter`/`Team` extenderían el modelo `organizations → areas → employees` de R2 sin reemplazarlo — una organización que nunca configure WorkCenter/Team debe seguir funcionando exactamente como en el MVP.

## Preguntas abiertas / riesgos

- Migrar de roles fijos (CHECK constraint) a `CustomRole`/`RolePermission` es una migración de alto riesgo sobre datos de producción reales de organizaciones piloto — requiere plan de migración explícito, no solo el nuevo esquema.
- ¿`Delegation` necesita expiración automática? Sin ella, una cesión de capacidad podría quedar activa indefinidamente por error humano — riesgo de seguridad a diseñar con cuidado, no como afterthought.
- Definir el límite exacto entre "configurable" y "excesivamente flexible" (riesgo de reconstruir un editor de permisos tipo IAM completo) antes de comprometerse a una implementación.
