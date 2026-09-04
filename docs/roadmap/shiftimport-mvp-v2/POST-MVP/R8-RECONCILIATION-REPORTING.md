# R8 — Reconciliation & Reporting (POST-MVP, macro spec)

## Propósito y alcance

Comparar planificado (schedule publicado, R3) contra real (attendance, R7) y generar reportes de discrepancia (ausencias, retrasos, horas extra no planificadas).

## Por qué es post-MVP

Depende íntegramente de R7 (Attendance), que ya es post-MVP. No hay datos "reales" que reconciliar contra lo planificado hasta que exista una fuente de verdad de asistencia. Nota importante para evitar confusión durante ejecución: el término "reconciliation" ya aparece en el código de ingestión (comparación de conteos import-time: X nuevos/Y modificados/Z duplicados de R1-M05 Compare Stage) — es un concepto distinto y no relacionado con R8; no confundir al escribir specs futuras de R8.

## Modelo de dominio sketch

No introduce entidades nuevas de escritura — es una capa de lectura/agregación sobre `shift_assignments` (R3) y `attendance_events`/`work_sessions` (R7):

```text
DiscrepancyReport (vista derivada, no tabla de escritura primaria)
  - planned_shift_assignment_id
  - actual_work_session_id (nullable si no hubo fichaje)
  - discrepancy_type (ausencia / retraso / salida anticipada / horas extra no planificadas)
```

## Relación con la base MVP

- Lee `schedule_versions` publicadas (R3) como fuente de "planificado".
- Lee `work_sessions` (R7) como fuente de "real".
- Podría alimentarse del mecanismo de auditoría de R2-M09/R5-M06 para explicar discrepancias ya conocidas (p. ej. un Change Request aprobado que legitima una diferencia).

## Preguntas abiertas / riesgos

- ¿Reportes son solo lectura interna, o se exportan (CSV/PDF) para uso externo (nómina, cumplimiento)? Impacta si esto raya con "no debe convertirse en payroll" (§1 del master prompt) — debe mantenerse estrictamente informativo, no un motor de cálculo de nómina.
- Volumen de datos para reportes agregados puede requerir vistas materializadas o un pipeline de agregación separado del OLTP — decisión de arquitectura a tomar cuando haya evidencia de volumen real de piloto.
