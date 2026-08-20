# Anclora ShiftImport - Dataset sintético de pruebas

## Contenido

1. `01_team_preloaded_40_employees.csv`
   - 40 empleados ficticios que deben existir previamente en la organización de prueba.
   - No contiene contraseñas ni credenciales reales.
   - `email_synthetic` usa el dominio reservado `example.invalid`.

2. `02_team_preloaded_40_employees.json`
   - La misma plantilla en JSON para crear un script seed idempotente.

3. `03_cuadrante_agosto_2026.pdf`
   - Cuadrante sintético completo de agosto de 2026.
   - 40 empleados ya preexistentes.
   - Incluye turnos diurnos, nocturnos, `DL` y algunos `AJ`.
   - Maquetado en dos quincenas para parecerse a un cuadrante real.

4. `04_turnos_septiembre_2026.csv`
   - CSV row-per-day para septiembre de 2026.
   - Contiene los 40 empleados preexistentes + 2 empleados NUEVOS:
     - SI129901 Mario Riera López
     - SI129902 Noelia García Pons
   - Permite probar el alta inline de nuevos empleados.

5. `05_expected_results.csv`
   - Resultados esperados por empleado/mes.
   - Sirve para comprobar número de días trabajados, DL, AJ y turnos nocturnos.

## Casos de prueba cubiertos

- Matching por `external_employee_id`.
- Matching por nombre.
- 40 empleados ya registrados.
- Dos empleados nuevos en septiembre.
- Coexistencia de muchos empleados el mismo día.
- Selección de uno / varios / todos (cuando la UI lo soporte).
- Turnos nocturnos (17:00-01:00 y 21:00-05:00).
- Días libres (`DL`).
- Ausencias justificadas (`AJ`).
- Histórico agosto -> septiembre.
- Importación PDF -> importación CSV.

## Recomendación para cargar los 40 empleados

No crear usuarios ni contraseñas ficticias manualmente.

Crear un script `seed-dev` idempotente que:
1. resuelva la organización de pruebas existente;
2. lea `02_team_preloaded_40_employees.json`;
3. cree/actualice `employees` por `(organization_id, external_employee_id)`;
4. NO cree cuentas User salvo que se indique explícitamente;
5. nunca opere contra Production;
6. pueda ejecutarse varias veces sin duplicar empleados.

El usuario ADMIN real ya existente se mantiene fuera de este dataset.
