# R7 — Attendance (POST-MVP, macro spec)

## Propósito y alcance

Introducir registro de asistencia real (fichaje) como eventos inmutables, distinto del schedule planificado (R3) — permitiendo comparar planificado vs. real en R8.

## Por qué es post-MVP

El MVP se centra en Safe Import + planificación + portal + aprobación. Fichaje introduce superficie regulatoria/laboral y de privacidad (localización, biometría) que el master prompt explícitamente excluye del MVP (§1: "no debe convertirse en... sistema avanzado de fichaje... plataforma de vigilancia laboral"). No aporta al piloto de validar Safe Import como moat.

## Modelo de dominio sketch

```text
AttendanceEvent   — evento inmutable (clock-in, clock-out, break-start, break-end), timestamp, employee_id, organization_id
WorkSession        — agregación derivada de un par clock-in/clock-out (calculado, no fuente de verdad — la fuente son los AttendanceEvent)
```

Explícitamente NO incluye: GPS continuo, capturas de pantalla, biometría. Un `AttendanceEvent` es un timestamp + tipo, nada más.

## Relación con la base MVP

- `AttendanceEvent.employee_id` referencia `employees` (R2).
- `WorkSession` se compararía contra `ShiftAssignment` (R3) en R8 — planificado vs. real.
- El portal de empleado (R4) sería la superficie natural para que un empleado registre sus propios eventos, si el producto decide ir en esa dirección — no asumido aquí.

## Preguntas abiertas / riesgos

- ¿Fichaje es auto-reportado por el empleado (bajo confianza) o requiere validación externa? Impacta directamente el modelo de invariantes.
- Cumplimiento normativo (laboral) varía por país/región — requiere validación legal antes de comprometerse a un modelo de datos específico.
- Inmutabilidad de `AttendanceEvent` implica que correcciones son eventos nuevos (p. ej. "corrección manual"), no ediciones — decisión de diseño a confirmar cuando se aborde.
