# P2 Gate — Plan Entitlement UX

**Baseline:** `7f65138`
**Branch:** `development`
**Resultado:** `PASS_WITH_GAPS`

## Alcance verificado

- `GET /api/organizations/current` expone `entitlement` derivado de la
  organización resuelta por sesión: plan, features, límites y empleados
  activos.
- El descriptor ignora valores de plan enviados por cliente y mantiene el
  aislamiento por sesión.
- Personal/free muestran la capacidad de gestión de equipo visible,
  deshabilitada y explicada antes de escribir; el motivo se asocia al grupo
  mediante `aria-describedby`.
- La importación multi-empleado muestra el mismo aviso previo y bloquea la
  selección de fichero en planes sin esa capacidad.
- `addMember`, alta de empleado, reactivación y alta masiva siguen usando la
  autoridad server-side; los rechazos relevantes emiten
  `PLAN_LIMIT_REJECTED` con metadata acotada, sin email ni contraseña.
- `team` conserva sus flujos sin aviso de bloqueo; las reglas de backend no se
  relajan.

## Evidencia

| Capa | Resultado |
|---|---|
| Tests de plan, endpoint, data-access y componentes | PASS — 185 tests dirigidos |
| E2E navegador dirigido | PASS — 1 test Chromium, Personal, 390×844, 22,7 s |
| Lint | PASS |
| Typecheck/build | PASS |
| Migraciones | N/A — P2 no introduce migración |
| Seguridad/tenant | PASS — plan derivado del contexto; 403 `PLAN_LIMIT` conservado |
| i18n | PASS — ES/EN añadidos conjuntamente |

## Estrategia E2E reducida

Se ejecuta un único recorrido de navegador para la promesa de mayor riesgo:
entitlement visible antes del esfuerzo, controles realmente deshabilitados,
viewport móvil estrecho y rechazo directo del backend. Las variantes Team,
los contratos del descriptor y los caminos de creación se cubren en tests de
API/data/componentes para evitar repetir login, seed y teardown en varios
proyectos Playwright.

## Gap no bloqueante

No se repitió en navegador una segunda sesión Team dentro de este Gate. La
ausencia del banner y la compatibilidad del flujo Team están cubiertas por
tests de componentes, el modelo de planes y la regresión de backend. La
comparativa visual Team queda absorbida por el Gate final del programa.

## Veredicto

`PASS_WITH_GAPS`. P3 puede comenzar; no se modifica billing ni la autoridad
server-side.
