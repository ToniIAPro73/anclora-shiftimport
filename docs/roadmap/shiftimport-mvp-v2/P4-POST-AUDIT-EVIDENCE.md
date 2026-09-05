# P4 — Evidencia de accesibilidad y responsive

Fecha de ejecución: 2026-09-06
Rama: `development`
Baseline de trabajo: `c61a28d`

## Estado de microtareas

| Microtarea | Resultado | Evidencia |
|---|---|---|
| P4-M01 — nombres accesibles de color | PASS | `SettingsModal.tsx` expone `aria-label` único por tipo; test de componente específico |
| P4-M02 — scroll de tabla accesible | PASS | wrapper `overflow-x/y: auto`, `tabIndex=0`, `aria-label`, affordance de borde |
| P4-M03 — scroll de estadísticas | PASS | `StatsBar` conserva scroll horizontal y affordance visual en el ribbon |
| P4-M04 — editor móvil | PASS | editor estable; clearance interno evita ocultar la última fila; foco retorna al control de celda |
| P4-M05 — navegación landing móvil | PASS | menú colapsable ≤480px, `aria-expanded`, `aria-controls`, cierre con ESC y foco de retorno |
| P4-M06 — validación onboarding | PASS | reproducción previa en test: el `required` nativo impedía el mensaje inline; ahora hay error persistente, `aria-describedby` y foco |
| P4-M07 — suite responsive | PASS | runner compacto P4, un recorrido sintético con 1440, 834, 390 y 844×390 |

## Validación dirigida

```text
npm run test:p4
1/1 PASS en 1m06 s
```

El runner cubre planner en cuadrícula, tabla accesible, scroll interno, cabecera sticky,
ausencia de overflow horizontal del body, editor móvil, tema oscuro/claro y navegación pública
colapsable. Los datos del planner son sintéticos e interceptados; no repite creación, publicación
ni historial.

```text
npm test -- --run \
  src/components/PublicHeader.test.tsx \
  src/components/shift-dashboard/SettingsModal.test.tsx \
  src/components/scheduling/WeeklyPlanner.test.tsx \
  src/components/shift-dashboard/OnboardingChoiceModal.test.tsx
4 ficheros / 44 tests PASS en 1,95 s
```

El cambio de P4-M06 se hizo después de una prueba roja reproducible: con el campo vacío y el
checkbox activo, la validación nativa detenía `submit` sin renderizar `role="alert"` ni mover el
foco. La regresión ahora exige el mensaje localizado, foco en el campo y ausencia de escritura.

## Alcance y límites

El inventario axe focalizado ampliado de dashboard, planner y portal pasa 1/1 en 38,0 s; se
añadieron nombres accesibles a navegación mensual y landmarks semánticos al shell del dashboard.
P4 aún no se declara Gate formalmente cerrado hasta completar su evidencia visual comparativa y
la ejecución del checklist transversal completo. Esta evidencia no modifica el veredicto formal
P0 (`MVP_NOT_READY`); elimina los bloqueadores axe asignados a P4.
