# Escenario de aceptación: nueva empresa Anclora

Este escenario reproduce el uso de una empresa que acaba de contratar ShiftImport.

## Flujo manual

1. Partir de DB de desarrollo limpia.
2. Registrar `Toni`.
3. Crear Organization `Anclora`.
4. Crear dos áreas:
   - Operaciones
   - Administración
5. Importar `roster_employees.csv` (30 Employees).
6. Resolver la preview del roster:
   - empleados con email -> acceso/ACTIVE según flujo real;
   - empleados sin email -> PENDING_ACCESS.
7. Crear manualmente:
   - Marta Vives Roca
   - ANC-OPS-021
   - Operaciones
8. Importar turnos de Operaciones desde PDF.
9. Importar turnos de Administración desde CSV.
10. Validar calendarios, permisos y aislamiento por área.

## Archivos

- `organization.json`: datos esperados de organización/admin/áreas.
- `roster_employees.csv`: roster principal de 30 empleados.
- `roster_no_area_smoke.csv`: fixture de contrato para Organization sin áreas.
- `shifts_operaciones_september_2026.pdf`: cuadrante PDF de Operaciones, incluyendo Marta.
- `shifts_administracion_september_2026.csv`: turnos CSV de Administración (216 filas).
- `future_json_format_example_DO_NOT_IMPORT.json`: ejemplo futuro; no usar todavía como formato de producto.
- `expected_results.json`: resultados esperados.

## Regla sobre Areas

Areas son opcionales. Este escenario usa dos áreas para cubrir esa funcionalidad, pero la aplicación debe seguir funcionando con `areas = 0`.
