# R4-M01 — Today

## 1. Objetivo

Pantalla "Hoy": vista de lectura del turno (o turnos) del propio empleado para la fecha actual, dentro del shell de R4-M00.

## 2. Problema que resuelve

El empleado no tiene hoy ninguna forma de consultar su turno de la jornada actual sin depender del cuadrante importado que solo ve el ADMIN.

## 3. Estado actual del repositorio

No existe pantalla ni endpoint de lectura de turnos "propios". `shifts` existe en DB con `employee_id`, `date`, `start_time`, `end_time`, `location`. No hay aún `ScheduleVersion`/publicación (R3) — R4-M01 debe apoyarse en lo que R3-M10 defina como "turno publicado visible para el empleado".

## 4. Alcance IN

- Endpoint de lectura SELF-scoped: turnos del empleado autenticado para la fecha de hoy.
- Componente "Today" dentro del portal: turno(s) de hoy, hora inicio/fin, ubicación, estado (publicado).
- Estado vacío: "sin turno hoy".

## 5. Alcance OUT

- Fichaje/attendance — post-MVP (R7).
- Edición de turno — el empleado nunca escribe su propio turno directamente (eso pasa por Change Request, R4-M06).
- Turnos futuros más allá de hoy — eso es My Week (R4-M02).

## 6. Dependencias

R4-M00 (shell), R3-M10 (Publication — noción de turno "publicado" visible al empleado). Si R3-M10 aún no ha entregado el modelo de publicación, esta microfase queda BLOCKED hasta que exista.

## 7. Decisiones arquitectónicas

- Lectura estrictamente SELF-scoped: el endpoint deriva `employee_id` de la sesión autenticada, nunca acepta un `employee_id` arbitrario del cliente.
- La pantalla es de solo lectura; ninguna mutación ocurre aquí.

## 8. Modelo de datos afectado

Ninguna tabla nueva. Lectura sobre `shifts` (y sobre el modelo de publicación que defina R3, si sustituye o complementa `shifts` con `ShiftAssignment`/`ScheduleVersion`).

## 9. API / Backend

Nuevo endpoint de solo lectura, p. ej. `api/me/shifts/today.js`, siguiendo la convención de `api/employees/index.js`. Autorización: requiere sesión válida, deriva `employee_id` del `user_id` de la sesión vía la relación `employees.user_id`, filtra por `organization_id` de la membership activa y `date = today` en la zona horaria de la organización.

## 10. Frontend / UX

Tarjeta de turno de hoy: hora, ubicación, badge de estado. Estado vacío ilustrado ("no tienes turno asignado hoy"). Loading skeleton mientras carga.

## 11. Seguridad y autorización

Server-side: el endpoint nunca confía en un `employee_id` de query/body; solo usa el derivado de sesión. Verificar con test que un EMPLOYEE no puede leer turnos de otro empleado manipulando parámetros.

## 12. i18n

Todos los textos (estado vacío, labels de hora/ubicación) en catálogos ES/EN.

## 13. Accesibilidad

Tarjeta de turno legible por lector de pantalla (hora y ubicación anunciadas con texto, no solo iconografía).

## 14. Responsive / temas

Tarjeta adaptable a mobile (prioridad) y desktop; contraste verificado en dark/light.

## 15. Observabilidad / errores

Error state si el endpoint falla (reintento manual, no automático agresivo). Log de servidor en fallos de autorización (intento de acceso a `employee_id` ajeno) sin exponer detalle al cliente.

## 16. Migraciones

N/A — motivo: sin cambios de esquema, solo lectura sobre estructuras existentes o las que introduzca R3.

## 17. Compatibilidad y datos existentes

Turnos importados históricamente sin flujo de publicación explícito deben seguir siendo visibles si R3-M10 los trata como "publicados por defecto" — la spec de R3-M10 debe resolver esta transición; R4-M01 simplemente consume el contrato que R3-M10 defina.

## 18. Tasks

### T01 — Endpoint `GET /api/me/shifts/today`

Objetivo: exponer el/los turno(s) de hoy del empleado autenticado.
Archivos / módulos probables: `api/me/shifts/today.js`, `api/_lib/data.js` (nueva función de lectura SELF-scoped).
Cambios: nueva ruta + función de datos filtrada por sesión.
No hacer: no aceptar `employee_id` como parámetro de entrada.
Criterios de aceptación:
- [ ] Devuelve solo turnos del empleado de la sesión.
- [ ] 401 si no autenticado.
Tests: unit sobre la función de datos, integration sobre el endpoint con dos empleados distintos.
Evidencia esperada: respuesta JSON de ejemplo para dos usuarios distintos, confirmando aislamiento.

### T02 — Componente Today

Objetivo: renderizar la tarjeta de turno de hoy.
Archivos / módulos probables: `src/components/employee-portal/Today.tsx`.
Cambios: fetch al nuevo endpoint, render de tarjeta/estado vacío/loading.
No hacer: no cachear turnos de otros días aquí.
Criterios de aceptación:
- [ ] Estado vacío correcto cuando no hay turno.
- [ ] Loading skeleton visible durante fetch.
Tests: unit de render en los tres estados (con turno, vacío, error).
Evidencia esperada: capturas de los tres estados.

### T03 — Integración con shell de R4-M00

Objetivo: montar Today como pantalla por defecto del portal.
Archivos / módulos probables: `src/components/employee-portal/PortalShell.tsx`.
Cambios: ruta/tab por defecto apunta a Today.
No hacer: no modificar navegación (eso es R4-M09).
Criterios de aceptación:
- [ ] Al entrar al portal, Today es la vista inicial.
Tests: test de integración de montaje.
Evidencia esperada: captura de portal abierto en Today.

### T04 — Manejo de zona horaria de organización

Objetivo: asegurar que "hoy" se calcula en la zona horaria correcta de la organización, no del navegador del cliente sin control.
Archivos / módulos probables: `api/me/shifts/today.js`.
Cambios: cálculo de fecha "hoy" server-side, documentar supuesto de zona horaria (organización single-timezone en MVP).
No hacer: no implementar multi-timezone por área/empleado (fuera de alcance MVP).
Criterios de aceptación:
- [ ] Turno de hoy correcto cerca de medianoche en pruebas.
Tests: unit con fecha simulada cerca de límite de día.
Evidencia esperada: test pasante documentado.

## 19. Tests obligatorios

Unit (función de datos, componente), Integration (endpoint con múltiples empleados/orgs), Security (intento de acceso cruzado).

## 20. Evidencias

Respuestas JSON de ejemplo, capturas de los tres estados de UI, resultado de tests.

## 21. Gate

Gates obligatorios: G5 (Functional), G6 (UX/UI).
G5 PASS si aislamiento SELF-scope verificado por test. G6 PASS si los tres estados de UI están cubiertos y son responsive/accesibles.

## 22. Rollback / remediación

Revert del commit desactiva la ruta y el componente; no hay dato persistido nuevo que revertir.

## 23. Criterio de DONE

Un empleado ve su turno de hoy (o estado vacío) de forma aislada de otros empleados; Gate G5+G6 PASS.
