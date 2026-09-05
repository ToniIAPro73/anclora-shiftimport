# R4-M03 — Shift Detail

## 1. Objetivo

Vista de detalle de un turno individual, accesible desde Today/My Week, mostrando toda la información del turno y los puntos de entrada a Acknowledgement (R4-M04), Comments (R4-M05) y Change Request (R4-M06).

## 2. Problema que resuelve

Today/My Week muestran resúmenes; el empleado necesita un lugar único para ver el detalle completo de un turno y actuar sobre él (reconocer, comentar, solicitar cambio).

## 3. Estado actual del repositorio

DONE — PASS en `development` (commit de implementación: `834967d`). R4-M01/M02 ya exponen turnos SELF-scoped y esta microfase añade el detalle navegable.

## 4. Alcance IN

- Endpoint de detalle de un turno por id, SELF-scoped.
- Componente de detalle: fecha, hora, ubicación, estado de publicación, área (si aplica).
- Puntos de entrada (botones/enlaces) a acknowledge/comment/change-request — sin implementar aún esa lógica (se conectan en R4-M04/M05/M06).

## 5. Alcance OUT

Lógica de acknowledge/comment/change-request en sí (microfases siguientes). Fichaje/attendance.

## 6. Dependencias

R4-M01, R4-M02.

## 7. Decisiones arquitectónicas

Un turno se identifica por `shift.id`; el endpoint de detalle valida en backend que `shift.organization_id` y `shift.employee_id` correspondan al contexto de sesión. Un id inválido o un turno ajeno devuelve 404 uniforme para no filtrar existencia. El portal conserva la semana seleccionada en el shell y devuelve el foco al trigger original.

## 8. Modelo de datos afectado

Ninguna tabla nueva; lectura puntual sobre `shifts`.

## 9. API / Backend

`api/me/shifts/[id].js` — lectura SELF con verificación de pertenencia; devuelve `shift` con `areaName` opcional. Requiere sesión, organización activa y rol `EMPLOYEE`; turno ajeno, de otro tenant o id malformado responden 404 uniforme.

## 10. Frontend / UX

Pantalla de detalle con secciones claras: info del turno, acciones disponibles (placeholders deshabilitados hasta R4-M04/05/06 estén implementadas si se despliega esta microfase de forma aislada).

## 11. Seguridad y autorización

Verificación server-side de pertenencia del turno al empleado autenticado en cada request, no solo en la carga inicial de la lista.

## 12. i18n

Todos los labels de detalle en ES/EN.

## 13. Accesibilidad

Encabezados jerárquicos correctos; foco gestionado al navegar desde My Week al detalle y al volver.

## 14. Responsive / temas

Vista de detalle adaptada a mobile como caso principal.

## 15. Observabilidad / errores

Error 404 claro si el turno no existe o no pertenece al empleado; sin stack traces expuestos. Los errores de red del detalle ofrecen reintento.

## 16. Migraciones

N/A — motivo: sin cambios de esquema.

## 17. Compatibilidad y datos existentes

Turnos históricos importados (sin flujo de acknowledgement todavía) deben mostrar detalle correctamente aunque los campos de acknowledgement/comments estén vacíos.

## 18. Tasks

### T01 — Endpoint `GET /api/me/shifts/:id`
Objetivo: detalle de un turno con verificación de pertenencia.
Archivos: `api/me/shifts/[id].js`.
Cambios: lectura + check de pertenencia.
No hacer: no exponer turnos de otro empleado ni con id adivinado.
Criterios de aceptación:
- [x] 404 uniforme para turno ajeno, tenant ajeno e id malformado.
Tests: integration con ownership SELF, tenant isolation, anonymous y method guard.
Evidencia esperada: `api/me/shifts/[id].test.js` — 5 casos PASS.

### T02 — Componente Shift Detail
Objetivo: renderizar el detalle completo.
Archivos: `src/components/employee-portal/ShiftDetail.tsx`.
Cambios: fetch por id desde ruta/param, render de secciones.
No hacer: no implementar aún los botones de acción funcionales.
Criterios de aceptación:
- [x] Toda la info del turno visible y correcta, incluyendo área opcional, estado publicado y acciones futuras deshabilitadas.
Tests: unit de render, error/retry y foco.
Evidencia esperada: `ShiftDetail.test.tsx` — 3 casos PASS.

### T03 — Navegación desde My Week/Today a Shift Detail
Objetivo: enlazar listas con detalle.
Archivos: `src/components/employee-portal/{Today,MyWeek}.tsx`.
Cambios: navegación al detalle al seleccionar un turno.
No hacer: no romper el estado de la lista al volver.
Criterios de aceptación:
- [x] Hoy y My Week abren el detalle mediante triggers de teclado.
- [x] Volver preserva la semana seleccionada y restaura el foco al trigger de origen.
Tests: integración PortalShell y callback accesible de MyWeek.
Evidencia esperada: `PortalShell.test.tsx` y `MyWeek.test.tsx` PASS.

## 19. Tests obligatorios

Unit, Integration (pertenencia del turno), Accessibility (foco/heading order).

## 20. Evidencias

Resultado reproducible de tests y build; la validación visual queda cubierta por la estructura responsive/dark-light existente y los estados UI implementados. No se añaden capturas binarias al repositorio.

### Resultado de validación

- Tests dirigidos: 4 archivos / 16 tests PASS.
- Suite completa: 117 archivos / 1.112 tests PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Warning no bloqueante: Vite informa chunks de producción >500 kB; es deuda de empaquetado existente, sin impacto funcional de M03.

## 21. Gate

Gates obligatorios: G5 (Functional), G6 (UX/UI).

Resultado: **PASS**.

- G5: endpoint SELF, ownership/tenant isolation, estados loading/error/retry, datos de detalle y compatibilidad histórica verificados.
- G6: navegación Hoy/My Week, triggers keyboard-accessible, heading/focus management, responsive mobile-first y acciones futuras claramente disabled verificados.
- Commit: `834967d feat(employee-portal): complete R4-M03 shift detail`.

## 22. Rollback / remediación

Revert retira ruta/componente de detalle; los enlaces de entrada desde Today/My Week deben revertirse en el mismo commit para no dejar enlaces rotos.

## 23. Criterio de DONE

Empleado accede al detalle de sus propios turnos únicamente; Gate G5+G6 PASS. Microfase cerrada en `834967d`.
