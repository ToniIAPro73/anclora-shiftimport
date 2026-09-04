# R4-M03 — Shift Detail

## 1. Objetivo

Vista de detalle de un turno individual, accesible desde Today/My Week, mostrando toda la información del turno y los puntos de entrada a Acknowledgement (R4-M04), Comments (R4-M05) y Change Request (R4-M06).

## 2. Problema que resuelve

Today/My Week muestran resúmenes; el empleado necesita un lugar único para ver el detalle completo de un turno y actuar sobre él (reconocer, comentar, solicitar cambio).

## 3. Estado actual del repositorio

No existe. Depende de que R4-M01/M02 ya expongan turnos SELF-scoped con un identificador navegable.

## 4. Alcance IN

- Endpoint de detalle de un turno por id, SELF-scoped.
- Componente de detalle: fecha, hora, ubicación, estado de publicación, área (si aplica).
- Puntos de entrada (botones/enlaces) a acknowledge/comment/change-request — sin implementar aún esa lógica (se conectan en R4-M04/M05/M06).

## 5. Alcance OUT

Lógica de acknowledge/comment/change-request en sí (microfases siguientes). Fichaje/attendance.

## 6. Dependencias

R4-M01, R4-M02.

## 7. Decisiones arquitectónicas

Un turno se identifica por `shift.id`; el endpoint de detalle valida que el `shift.employee_id` corresponda al empleado de la sesión antes de devolver cualquier dato (nunca confiar en que el id "parece" válido).

## 8. Modelo de datos afectado

Ninguna tabla nueva; lectura puntual sobre `shifts`.

## 9. API / Backend

`api/me/shifts/[id].js` — lectura con verificación de pertenencia (403 si el turno no pertenece al empleado de la sesión, no 404, para no filtrar existencia — o 404 uniforme, a decidir en implementación siguiendo el patrón ya usado en otros endpoints del repo).

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

Error 404/403 claro si el turno no existe o no pertenece al empleado; sin stack traces expuestos.

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
- [ ] 403/404 uniforme para turno ajeno.
Tests: integration con id de otro empleado.
Evidencia esperada: respuesta de error para acceso cruzado.

### T02 — Componente Shift Detail
Objetivo: renderizar el detalle completo.
Archivos: `src/components/employee-portal/ShiftDetail.tsx`.
Cambios: fetch por id desde ruta/param, render de secciones.
No hacer: no implementar aún los botones de acción funcionales.
Criterios de aceptación:
- [ ] Toda la info del turno visible y correcta.
Tests: unit de render.
Evidencia esperada: captura de detalle completo.

### T03 — Navegación desde My Week/Today a Shift Detail
Objetivo: enlazar listas con detalle.
Archivos: `src/components/employee-portal/{Today,MyWeek}.tsx`.
Cambios: navegación al detalle al seleccionar un turno.
No hacer: no romper el estado de la lista al volver.
Criterios de aceptación:
- [ ] Volver desde detalle preserva la semana/día previamente visto.
Tests: integration de navegación.
Evidencia esperada: captura de flujo completo.

## 19. Tests obligatorios

Unit, Integration (pertenencia del turno), Accessibility (foco/heading order).

## 20. Evidencias

Capturas de detalle, respuestas de error para acceso cruzado, resultado de tests.

## 21. Gate

Gates obligatorios: G5 (Functional), G6 (UX/UI).

## 22. Rollback / remediación

Revert retira ruta/componente de detalle; los enlaces de entrada desde Today/My Week deben revertirse en el mismo commit para no dejar enlaces rotos.

## 23. Criterio de DONE

Empleado accede al detalle de sus propios turnos únicamente; Gate G5+G6 PASS.
