# P5 — Role Reality & Employee Self-Service Gate

Fecha: 2026-09-06
Rama: `development`
Resultado: **PASS**

## Baseline y decisiones

- Baseline documental de P5: `d7f8838` (`docs(scheduling): register approved P5 product decisions`).
- Las decisiones D-03, D-04 y D-05 están registradas como Product Decisions en `sdd/decisions/`.
- P5 se ejecutó sin migraciones ni acceso a producción.

## Evidencia ejecutada

| Área | Evidencia | Resultado |
|---|---|---|
| ADMIN | Fixture Team; cuadrícula muestra Employees activos y ADMIN vinculado; ADMIN sin Employee queda fuera; endpoints de employees/areas/memberships/imports y reset operativo responden correctamente | PASS |
| PLANNER con área | Creación de borrador dentro del área: 201; intento sin área: 403 | PASS |
| PLANNER sin área | Con áreas activas: `SCOPE_UNAVAILABLE` y UI bloqueada; sin áreas activas: `GET /api/schedules` 200 | PASS |
| EMPLOYEE activo | Turno propio visible; turno ajeno devuelve 404; `/app/schedule` redirige al portal | PASS |
| EMPLOYEE inactivo/sin vínculo activo | No obtiene scope SELF; lectura de turnos devuelve 403; UI muestra `Cuenta no vinculada` | PASS |
| Self-import | Filtrado de roster propio, filas ajenas, no identificables, identidad ausente y ambigua; preview/resultados con desglose | PASS |
| Fechas futuras | EMPLOYEE no persiste futuros ni crea planificación: `SELF_IMPORT_FUTURE_FORBIDDEN`; la UI los excluye con conteo | PASS |
| Aislamiento | Destino ajeno y cross-tenant rechazados con 403; no se abre transacción de escritura | PASS |
| Matriz de roles | La matriz publicada en `docs/fase1-multitenant.md` coincide con los guards server-side y el smoke compacto | PASS |

Smoke browser compacto:

```text
cd qa/e2e-acceptance
npm run test:p5-role
1 passed (1.9m), Chromium, 1 worker
```

El smoke concentra las variantes de autorización en un único test y reserva el navegador para
los estados UI materiales. Las combinaciones contractuales se cubren en Vitest/data-access.

## Cambios de dominio

- `resolveEffectiveAccessScope` hace que D-05 dependa server-side de las áreas activas.
- `upsertShifts` rechaza destinos ajenos y fechas futuras de EMPLOYEE antes de mutar.
- `confirmFutureImport` rechaza el intento de crear planificación futura desde EMPLOYEE.
- El bootstrap de la aplicación conserva el estado seguro de EMPLOYEE sin Employee activo, sin
  convertir un 403 esperado en modo invitado.
- El self-import conserva sólo filas propias inequívocas, separa ajenas/no identificables y
  bloquea coincidencias ambiguas.

## Validación técnica

- Vitest: **139 ficheros, 1247 tests PASS**.
- Lint: **PASS**.
- Typecheck/build: **PASS** (`npm run build`).
- `git diff --check`: **PASS**.
- Accesibilidad/i18n: labels y estados de bloqueo añadidos en ES/EN; tabla accesible y portal
  preservados.
- Responsive/dark/light: no se modifican superficies visuales fuera de los estados de rol; el
  smoke browser se ejecuta en Chromium con tema oscuro y la suite existente cubre responsive y
  tema.
- Diálogos nativos: el smoke falla si aparece un diálogo browser; resultado: ninguno.

## Resultado del Gate

`PHASE_P5_GATE = PASS`. No quedan gaps contractuales de D-03, D-04 o D-05. P6 y P7 no se han
iniciado por instrucción expresa del usuario.
