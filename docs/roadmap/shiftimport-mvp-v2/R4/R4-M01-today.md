# R4-M01 — Today

## 1. Objetivo

Pantalla "Hoy": vista de lectura del turno (o turnos) del propio empleado para la fecha actual, dentro del shell de R4-M00.

## 2. Problema que resuelve

El empleado no tiene hoy ninguna forma de consultar su turno de la jornada actual sin depender del cuadrante importado que solo ve el ADMIN.

## 3. Estado actual del repositorio

R3-M10 ya está cerrado: la publicación materializa los assignments publicados en `shifts`, y los turnos históricos importados conservan su semántica operativa. Antes de esta microfase no existía una lectura dedicada para el empleado ni la pantalla Today. La tabla `shifts` contiene `organization_id`, `employee_id`, `date`, `start_time`, `end_time`, `location` y `origin`.

## 4. Alcance IN

- Endpoint de lectura SELF-scoped: turnos del empleado autenticado para la fecha de hoy.
- Componente "Today" dentro del portal: turno(s) de hoy, hora inicio/fin, ubicación, estado (publicado).
- Estado vacío: "sin turno hoy".

## 5. Alcance OUT

- Fichaje/attendance — post-MVP (R7).
- Edición de turno — el empleado nunca escribe su propio turno directamente (eso pasa por Change Request, R4-M06).
- Turnos futuros más allá de hoy — eso es My Week (R4-M02).

## 6. Dependencias

R4-M00 (shell), R3-M10 (Publication — noción de turno "publicado" visible al empleado). Ambas dependencias están cerradas.

## 7. Decisiones arquitectónicas

- Lectura estrictamente SELF-scoped: el endpoint deriva `employee_id` de la sesión autenticada, nunca acepta un `employee_id` arbitrario del cliente.
- La pantalla es de solo lectura; ninguna mutación ocurre aquí.

## 8. Modelo de datos afectado

Ninguna tabla nueva. Lectura sobre `shifts` (y sobre el modelo de publicación que defina R3, si sustituye o complementa `shifts` con `ShiftAssignment`/`ScheduleVersion`).

## 9. API / Backend

Nuevo endpoint de solo lectura `api/me/shifts/today.js`. Requiere sesión válida y rol `EMPLOYEE`, deriva `employee_id` del contexto de sesión y filtra por `organization_id` de la membership activa. No acepta query/body. La fecha se resuelve con `CURRENT_DATE` en PostgreSQL. Como todavía no existe timezone por organización en el esquema, el contrato MVP usa la zona horaria configurada en la conexión/base de datos; la introducción de timezone organizativo queda para una microfase posterior.

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
- [x] Devuelve solo turnos del empleado de la sesión y de su organización activa.
- [x] 401 si no autenticado y 403 para roles que no son `EMPLOYEE`.
- [x] La consulta no recibe una fecha ni un employee id del cliente; usa `CURRENT_DATE`.
Tests: unit sobre la función de datos, integration sobre el endpoint con dos empleados distintos.
Evidencia: `api/me/shifts/today.test.js` cubre respuesta aislada, tenant/employee filtering, 401 y método no permitido.

### T02 — Componente Today

Objetivo: renderizar la tarjeta de turno de hoy.
Archivos / módulos probables: `src/components/employee-portal/Today.tsx`.
Cambios: fetch al nuevo endpoint, render de tarjeta/estado vacío/loading.
No hacer: no cachear turnos de otros días aquí.
Criterios de aceptación:
- [x] Estado vacío correcto cuando no hay turno.
- [x] Loading skeleton visible durante fetch.
- [x] Error visible con reintento manual y tarjeta de turno con hora, ubicación y estado publicado.
Tests: `Today.test.tsx` cubre turno, vacío, loading y error/reintento.
Evidencia: tests de componente con roles, `time`, estado y botón de reintento; copy ES/EN en el catálogo i18n.

### T03 — Integración con shell de R4-M00

Objetivo: montar Today como pantalla por defecto del portal.
Archivos / módulos probables: `src/components/employee-portal/PortalShell.tsx`.
Cambios: ruta/tab por defecto apunta a Today.
No hacer: no modificar navegación (eso es R4-M09).
Criterios de aceptación:
- [x] Al entrar al portal, Today es la vista inicial.
- [x] La navegación permanece como placeholder y no se adelanta R4-M09.
Tests: `PortalShell.test.tsx`, `App.employee-portal.test.tsx` y regresiones de entrada autenticada.
Evidencia: portal EMPLOYEE monta `Today`; ADMIN conserva el dashboard existente.

### T04 — Manejo de zona horaria de organización

Objetivo: asegurar que "hoy" se calcula en la zona horaria correcta de la organización, no del navegador del cliente sin control.
Archivos / módulos probables: `api/me/shifts/today.js`.
Cambios: cálculo de fecha "hoy" server-side, documentar supuesto de zona horaria (organización single-timezone en MVP).
No hacer: no implementar multi-timezone por área/empleado (fuera de alcance MVP).
Criterios de aceptación:
- [x] La fecha no depende del reloj, timezone ni parámetros manipulables del navegador.
- [x] La consulta delega el límite de día a `CURRENT_DATE` server-side.
Tests: el test de endpoint inspecciona la consulta generada y verifica que no contiene una fecha aportada por el cliente.
Evidencia: `api/me/shifts/today.test.js` — query `CURRENT_DATE`, valores únicamente `[organizationId, employeeId]`.

## 19. Tests obligatorios

Unit (función de datos, componente), Integration (endpoint con múltiples empleados/orgs), Security (intento de acceso cruzado), lint, typecheck/build y regresión de entrada al portal.

## 20. Evidencias

Resultado dirigido: 7 suites / 27 tests PASS. Suite completa: 113 suites / 1095 tests PASS. `npm run lint` PASS. `npm run build` PASS; permanece el warning no bloqueante de chunks grandes ya conocido. `git diff --check` PASS. La validación de UI se hizo con estados semánticos y CSS responsive/reduced-motion; no se añadieron capturas estáticas al repositorio.

## 21. Gate

Gates obligatorios: G5 (Functional), G6 (UX/UI).
G5: PASS — aislamiento SELF/tenant, 401, rol y fecha server-side verificados.
G6: PASS — estados loading/turno/vacío/error cubiertos, landmarks/roles/time/focus de reintento accesibles y estilos mobile-first con dark/light/reduced-motion heredados del shell.

**Resultado del Gate:** PASS

**Estado:** DONE

**Commit de cierre:** `947cef6` — `feat(employee-portal): complete R4-M01 today`

## 22. Rollback / remediación

Revert del commit desactiva la ruta y el componente; no hay dato persistido nuevo que revertir.

## 23. Criterio de DONE

Un empleado ve su turno de hoy (o estado vacío) de forma aislada de otros empleados; Gate G5+G6 PASS.
