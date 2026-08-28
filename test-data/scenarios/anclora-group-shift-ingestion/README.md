Dataset sintético Anclora Group — ShiftImport
Periodo de turnos: 1-15 septiembre 2026

Roster:
- 30 empleados Logística (LOG-001..LOG-030)
- 15 empleados Operaciones (OPE-001..OPE-015)
- Total: 45

Incidencias deliberadas — Logística
1. LOG-007 / 2026-09-05: shiftType = X1 (código desconocido).
2. LOG-018 / 2026-09-09: nombre 'Gabriel Martines' no coincide con roster; el ID LOG-018 sí coincide.

Incidencias deliberadas — Operaciones
1. OPE-004 / 2026-09-06: dos turnos conflictivos para la misma persona/fecha.
2. OPE-011 / 2026-09-11: turno M con startTime 06:00 y endTime vacío.

El resto del dataset es coherente y sirve de control.

04_usuarios_45.csv — bulk user provisioning + automatic linking
Formato: email,name,role,external_employee_id (POST /api/memberships/bulk)

Filas y resultado esperado (primera ejecución, roster de 01_empleados_45.csv ya importado):
1-12. Emails nuevos + external_employee_id libre y válido (LOG-001..008, OPE-001..004)
      -> created_and_linked.
13. sin.empleado@ancloragroup.test, sin external_employee_id -> created (sin vínculo).
14. otro.intento@ancloragroup.test, external_employee_id LOG-002 (ya vinculado por la fila 2
    dentro de la misma importación) -> error EMPLOYEE_ALREADY_LINKED.
15. fantasma@ancloragroup.test, external_employee_id LOG-999 (no existe en el roster)
    -> error EMPLOYEE_NOT_FOUND. Nunca crea un empleado.
16. rol.invalido@ancloragroup.test, role MANAGER -> error INVALID_ROLE.
17. email-invalido-sin-arroba, formato de email inválido -> error INVALID_EMAIL.
18. aina.ferrer@ancloragroup.test (duplicado del email de la fila 2) -> error DUPLICATE_IN_FILE.

Segunda ejecución (idempotencia, misma CSV sin cambios):
- Filas 1-12 -> already_linked (mismo user, mismo employee, sin duplicar membership).
- Fila 13 -> existing (usuario ya es miembro).
- Esta segunda pasada es también el caso de aceptación "email existente dentro de la
  organización + employee libre" para cualquier fila que aún no tuviera vínculo.

---

SHIFTIMPORT_MULTIFORMAT_INGESTION_XLSX_JSON_XML — fixtures añadidas

03_turnos_operaciones_2026-09_01-15.json
- Equivalente JSON exacto de 03_turnos_operaciones_2026-09_01-15.csv (mismos 226
  registros, mismas dos incidencias deliberadas: OPE-004/2026-09-06 duplicado
  conflictivo y OPE-011/2026-09-11 turno incompleto sin endTime).
- Forma J3 (schemaVersion + organization + areaName + period + shifts[]).

05_turnos_multi_area_2026-09_01-15.xlsx
- 4 hojas: "Logística" (contenido íntegro de 02_turnos_logistica…csv, incluye las 2
  incidencias deliberadas de ese fichero: LOG-007 código X1 y LOG-018 nombre no
  coincidente), "Operaciones" (contenido íntegro de 03_…csv, con sus 2 incidencias),
  "Instrucciones" (una hoja de texto libre sin cabecera de roster — debe ignorarse) y
  "Notas" (hoja totalmente vacía — debe clasificarse como vacía, no como error).
- Resultado esperado: 45 empleados distintos (30 Logística + 15 Operaciones), 2 hojas
  procesadas, 1 ignorada, 1 vacía; ninguna fila se pierde entre hojas ni se duplica.

06_turnos_operaciones_2026-09_01-15.xml
- Subconjunto bien definido y semánticamente equivalente al JSON: empleados
  OPE-001..003 (control, periodo completo) + OPE-004 y OPE-011 (con sus incidencias
  deliberadas) + un registro adicional inválido (OPE-999, fecha no parseable — debe
  producir un diagnóstico INVALID_DATE) + un registro adicional de control válido
  (OPE-001 / 2026-09-16, fuera del periodo base, debe importarse sin incidencias).
- Forma X3 (schedule > organization/areaName/period + shifts > shift).

Todas estas incidencias se validan en:
- src/ingestion/adapters/json-adapter.test.ts
- src/ingestion/adapters/xml-adapter.test.ts
- src/ingestion/adapters/xlsx-workbook.test.ts
