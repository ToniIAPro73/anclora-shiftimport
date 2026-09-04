# R4-M02 — My Week

## 1. Objetivo

Vista "Mi Semana": lista/calendario de los turnos publicados del empleado autenticado para la semana actual (y navegación a semanas adyacentes).

## 2. Problema que resuelve

Today (R4-M01) solo cubre el día actual; el empleado necesita visibilidad de la semana para planificar su vida fuera del trabajo.

## 3. Estado actual del repositorio

Ninguna vista de calendario personal existe para EMPLOYEE. El dashboard ADMIN tiene su propia vista de calendario (`src/components/shift-dashboard/`) pero está scoped a organización completa, no reutilizable directamente sin adaptación SELF-scoped.

## 4. Alcance IN

- Endpoint SELF-scoped de turnos por rango de fechas (semana).
- Componente de lista/semana con navegación anterior/siguiente.
- Reutilización de componentes visuales del dashboard ADMIN donde el contrato de props lo permita, sin acoplar lógica de autorización ADMIN.

## 5. Alcance OUT

Fichaje/attendance (R7). Edición de turnos. Vista mensual (fuera de alcance MVP, no descartada para post-MVP).

## 6. Dependencias

R4-M01 (endpoint/patrón SELF-scoped ya establecido).

## 7. Decisiones arquitectónicas

Mismo principio SELF-scope que R4-M01, extendido a rango de fechas. Un único endpoint parametrizado por `week_start` en vez de un endpoint por semana.

## 8. Modelo de datos afectado

Ninguna tabla nueva; lectura sobre `shifts`/estructura de publicación de R3.

## 9. API / Backend

`api/me/shifts/week.js?week_start=YYYY-MM-DD`, misma autorización SELF-scoped que R4-M01.

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
- [ ] Devuelve 7 días con turno o vacío cada uno.
Tests: integration con rango cruzando cambio de mes.
Evidencia esperada: respuesta JSON de una semana con turnos mixtos.

### T02 — Componente My Week
Objetivo: renderizar la semana con navegación.
Archivos: `src/components/employee-portal/MyWeek.tsx`.
Cambios: fetch parametrizado, navegación anterior/siguiente.
No hacer: no permitir edición inline.
Criterios de aceptación:
- [ ] Navegar a semana siguiente/anterior actualiza la vista sin recargar la página.
Tests: unit de navegación.
Evidencia esperada: captura de dos semanas consecutivas.

### T03 — Resalte de día actual y estado "libre"
Objetivo: mejorar legibilidad.
Archivos: `src/components/employee-portal/MyWeek.tsx`.
Cambios: estilo de día actual, label "libre" en días sin turno.
No hacer: no confundir "libre" con "turno no publicado aún" — distinguir ambos estados si R3 los diferencia.
Criterios de aceptación:
- [ ] Día actual visualmente distinguible.
Tests: unit de render.
Evidencia esperada: captura.

### T04 — Integración con navegación del portal
Objetivo: exponer My Week como tab accesible desde el shell.
Archivos: `src/components/employee-portal/PortalShell.tsx`.
Cambios: registrar la vista (la navegación visual final la define R4-M09).
No hacer: no construir aún la barra de navegación completa.
Criterios de aceptación:
- [ ] My Week accesible desde el shell.
Tests: integration de montaje.
Evidencia esperada: captura.

## 19. Tests obligatorios

Unit, Integration (rango de fechas, cruce de mes/año), Security (aislamiento SELF-scope).

## 20. Evidencias

Respuestas JSON de ejemplo, capturas de navegación semanal, resultado de tests.

## 21. Gate

Gates obligatorios: G5 (Functional), G6 (UX/UI).

## 22. Rollback / remediación

Revert del commit retira endpoint y componente; sin dato persistido que revertir.

## 23. Criterio de DONE

Empleado navega su semana con datos correctos y aislados; Gate G5+G6 PASS.
