# R3-M03 — ShiftAssignment

## 1. Objetivo
Crear `shift_assignments`, la unidad "empleado X trabaja turno Y en fecha Z" dentro de una `schedule_versions`.

## 2. Problema que resuelve
Cierra el modelo de datos base de Scheduling: sin esta tabla no hay dónde representar la planificación propuesta antes de publicar.

## 3. Estado actual del repositorio
MISSING. Depende de `schedule_versions` (R3-M02).

## 4. Alcance IN
- Tabla `shift_assignments`: id, schedule_version_id, employee_id, date, start_time, end_time, location (nullable), created_at, updated_at.
- FK a `schedule_versions` y `employees`.
- Índice por (schedule_version_id, employee_id, date) para lecturas del planner semanal.

## 5. Alcance OUT
Validación de solapamiento/descanso (R3-M06/M07). Edición vía API (R3-M05). Materialización a `shifts` (R3-M10).

## 6. Dependencias
R3-M02.

## 7. Decisiones arquitectónicas
`shift_assignments` NO tiene `organization_id` propio — se deriva vía `schedule_version_id → schedule_id → organization_id`, evitando duplicar el tenant-scoping (consistente con cómo `shifts.import_id` no repite organization_id de `imports`... salvo que `shifts` SÍ tiene organization_id propio directo por rendimiento de lectura. Para `shift_assignments`, dado que el volumen de lectura es acotado a un planner semanal y no al dashboard global, se opta por NO desnormalizar organization_id en esta tabla — mantiene la tabla más simple; si el rendimiento lo exige más adelante, se añade en una migración posterior, no ahora (evitar over-engineering anticipado, §3 del prompt).

`employee_id` sin `area_id` propio — el área se hereda del `employee.area_id` en el momento de lectura, evitando datos desnormalizados que puedan divergir si el empleado cambia de área entre la creación del assignment y su publicación (se prioriza consistencia sobre performance de lectura marginal).

## 8. Modelo de datos afectado
```sql
CREATE TABLE shift_assignments (
  id SERIAL PRIMARY KEY,
  schedule_version_id INTEGER NOT NULL REFERENCES schedule_versions(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shift_assignments_version_employee_date
  ON shift_assignments(schedule_version_id, employee_id, date);
```

## 9. API / Backend
N/A en esta microfase — CRUD en R3-M04/M05.

## 10. Frontend / UX
N/A.

## 11. Seguridad y autorización
N/A a nivel schema; aplicada vía join a `schedule_versions → schedules → organization_id` en R3-M13.

## 12. i18n
N/A.

## 13. Accesibilidad
N/A.

## 14. Responsive / temas
N/A.

## 15. Observabilidad / errores
N/A — sin código de aplicación aún.

## 16. Migraciones
`db/migrations/0015_shift_assignments.sql`, forward-only, aditiva.

## 17. Compatibilidad y datos existentes
Sin impacto en `shifts` ni otras tablas existentes — tabla completamente nueva y aislada hasta R3-M10 (publicación).

## 18. Tasks

### T01 — Migración `0015_shift_assignments.sql`
Objetivo: crear tabla e índice según sección 8.
Archivos / módulos probables: `db/migrations/0015_shift_assignments.sql`.
Cambios: CREATE TABLE + índice compuesto.
No hacer: no añadir aún constraint de solapamiento (eso es lógica de aplicación en R3-M06, no una constraint de DB genérica, porque el rango de solapamiento no es expresable con un UNIQUE simple).
Criterios de aceptación:
- [ ] Migración aplica limpio.
- [ ] FKs a `schedule_versions` y `employees` verificadas (insert con id inexistente falla).
Tests: test de migración verificando FKs y el índice.
Evidencia esperada: output de migración + test.

## 19. Tests obligatorios
`db`.

## 20. Evidencias
Migración commiteada, test en PASS.

## 21. Gate
Gates requeridos: **G2**, **G3**.

## 22. Rollback / remediación
DROP TABLE seguro — tabla aislada, sin dependientes hasta R3-M10.

## 23. Criterio de DONE
Migración 0015 aplicada, FKs verificadas, Gate G2+G3 PASS.
