# R4-M02 — My Week

## 1. Objetivo

Vista "Mi Semana": lista/calendario de los turnos publicados del empleado autenticado para la semana actual (y navegación a semanas adyacentes).

## 2. Problema que resuelve

Today (R4-M01) solo cubre el día actual; el empleado necesita visibilidad de la semana para planificar su vida fuera del trabajo.

## 3. Estado actual del repositorio

R4-M01 ya proporciona el patrón SELF-scoped para el portal. No existía una vista semanal personal para EMPLOYEE. El dashboard ADMIN tiene su propia vista de calendario (`src/components/shift-dashboard/`), pero está scoped a organización completa y no se reutiliza directamente.

## 4. Alcance IN

- Endpoint SELF-scoped de turnos por rango de fechas (semana).
- Componente de lista/semana con navegación anterior/siguiente.
- Reutilización de componentes visuales del dashboard ADMIN donde el contrato de props lo permita, sin acoplar lógica de autorización ADMIN.

## 5. Alcance OUT

Fichaje/attendance (R7). Edición de turnos. Vista mensual (fuera de alcance MVP, no descartada para post-MVP).

## 6. Dependencias

R4-M01 (endpoint/patrón SELF-scoped ya establecido).

## 7. Decisiones arquitectónicas

Mismo principio SELF-scope que R4-M01, extendido a rango de fechas. Un único endpoint parametrizado por `week_start` en vez de un endpoint por semana. El endpoint exige una fecha ISO que sea lunes y devuelve exactamente siete buckets `days`, uno por fecha, cada uno con `shifts`; la UI no necesita crear días implícitos ni confiar en un rango arbitrario.

## 8. Modelo de datos afectado

Ninguna tabla nueva; lectura sobre `shifts`/estructura de publicación de R3.

## 9. API / Backend

`api/me/shifts/week.js?week_start=YYYY-MM-DD`, misma autorización SELF-scoped que R4-M01. La respuesta es `{ weekStart, days: [{ date, shifts }] }` con siete entradas y sin `employee_id` de entrada.

## 10. Frontend / UX

Lista de días de la semana con turno o "libre"; navegación semana anterior/siguiente; resalte del día actual.

## 11. Seguridad y autorización

Mismo control server-side que R4-M01; verificar que `week_start` no permite enumerar turnos de otra organización via manipulación de fecha (el filtro por `organization_id`/`employee_id` de sesión sigue aplicando siempre).

## 12. i18n

Nombres de días/meses localizados ES/EN.

## 13. Accesibilidad

Navegación semana anterior/siguiente operable por teclado; anuncio de cambio de semana para lectores de pantalla.

## 14. Responsive / temas

Lista en mobile, posible vista más ancha en desktop; dark/light verificado.

## 15. Observabilidad / errores

Error state si el fetch de semana falla; no perder la semana seleccionada al reintentar.

## 16. Migraciones

N/A — motivo: sin cambios de esquema.

## 17. Compatibilidad y datos existentes

Semanas pasadas con turnos importados históricamente deben renderizar igual que semanas futuras planificadas vía R3.

## 18. Tasks

### T01 — Endpoint `GET /api/me/shifts/week`
Objetivo: turnos SELF-scoped de una semana dada.
Archivos: `api/me/shifts/week.js`, `api/_lib/data.js`.
Cambios: función de datos por rango de fechas, reutilizando el patrón SELF-scope de R4-M01.
No hacer: no aceptar `employee_id` de entrada.
Criterios de aceptación:
- [x] Devuelve 7 días con turno o vacío cada uno.
- [x] Cruza cambios de mes/año mediante rango SQL parametrizado.
- [x] Rechaza fechas inválidas o que no sean lunes antes de resolver datos.
Tests: `api/me/shifts/week.test.js` con turnos mixtos, tenant/employee distintos, 401 y validación de `week_start`.
Evidencia: respuesta con `days.length === 7`; solo se devuelve el empleado autenticado.

### T02 — Componente My Week
Objetivo: renderizar la semana con navegación.
Archivos: `src/components/employee-portal/MyWeek.tsx`.
Cambios: fetch parametrizado, navegación anterior/siguiente.
No hacer: no permitir edición inline.
Criterios de aceptación:
- [x] Navegar a semana siguiente/anterior actualiza la vista sin recargar la página.
- [x] El reintento conserva la semana seleccionada.
Tests: `MyWeek.test.tsx` cubre carga, semana con turno, días libres, navegación y error/reintento.
Evidencia: navegación comprobada con llamadas a endpoint parametrizadas por lunes consecutivo.

### T03 — Resalte de día actual y estado "libre"
Objetivo: mejorar legibilidad.
Archivos: `src/components/employee-portal/MyWeek.tsx`.
Cambios: estilo de día actual, label "libre" en días sin turno.
No hacer: no confundir "libre" con "turno no publicado aún" — distinguir ambos estados si R3 los diferencia.
Criterios de aceptación:
- [x] Día actual visualmente distinguible y etiquetado como "Hoy".
- [x] Los días sin turnos muestran "Libre" sin introducir edición o attendance.
Tests: `MyWeek.test.tsx` verifica siete días y estado libre explícito.
Evidencia: clase `employee-week__day--today` y label localizado.

### T04 — Integración con navegación del portal
Objetivo: exponer My Week como tab accesible desde el shell.
Archivos: `src/components/employee-portal/PortalShell.tsx`.
Cambios: registrar la vista (la navegación visual final la define R4-M09).
No hacer: no construir aún la barra de navegación completa.
Criterios de aceptación:
- [x] My Week accesible desde el shell mediante control keyboard-operable con `aria-current`.
- [x] Today sigue siendo la vista inicial; la navegación final móvil queda para R4-M09.
Tests: `PortalShell.test.tsx` verifica cambio de vista sin navegación de página.
Evidencia: shell monta `MyWeek` tras activar el tab Semana.

## 19. Tests obligatorios

Unit, Integration (rango de fechas, cruce de mes/año), Security (aislamiento SELF-scope), i18n, lint, typecheck/build y regresión de portal.

## 20. Evidencias

Tests dirigidos: 3 suites / 10 tests PASS. Suite completa: 115 suites / 1103 tests PASS. `npm run lint` PASS. `npm run build` PASS; permanece el warning no bloqueante de chunks grandes ya conocido. `git diff --check` PASS. La cobertura responsive/accesible se verifica con estructura semántica, foco visible y media queries mobile/desktop; no se añaden capturas estáticas al repositorio.

## 21. Gate

Gates obligatorios: G5 (Functional), G6 (UX/UI).

G5: PASS — endpoint SELF/tenant scoped, siete buckets, validación de lunes, 401 y navegación parametrizada.

G6: PASS — layout mobile-first, vista desktop de siete columnas, labels localizados, controles keyboard-operables, `aria-live`, foco visible y reduced-motion.

**Resultado del Gate:** PASS

**Estado:** DONE

**Commit de cierre:** `47d7b69` — `feat(employee-portal): complete R4-M02 my week`

## 22. Rollback / remediación

Revert del commit retira endpoint y componente; sin dato persistido que revertir.

## 23. Criterio de DONE

Empleado navega su semana con datos correctos y aislados; Gate G5+G6 PASS.
