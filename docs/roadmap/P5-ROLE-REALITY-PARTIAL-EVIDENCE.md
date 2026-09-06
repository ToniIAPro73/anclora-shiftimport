# P5 — Evidencia parcial de realidad de roles

Fecha: 2026-09-06  
Rama: `development`  
Estado: `BLOCKED — decisiones D-03/D-04/D-05 no registradas`

## P5-M01 — Fixture de QA

La fixture local existente crea `E2E Org A` con plan `team`, un ADMIN sin Employee, un
PLANNER vinculado a `E2E Area A`, un EMPLOYEE vinculado a Employee activo y un ADMIN que también
es Employee activo. La provisión usa inserciones de setup contra Neon development; no existe ni
se añade endpoint para cambiar el plan desde el cliente.

## Evidencia browser dirigida

Comando ejecutado desde `qa/e2e-acceptance`:

```text
npx playwright test --config playwright.local.config.ts \
  specs-local/scheduling-authz.spec.ts \
  --grep "EMPLOYEE UI|active Employee"
```

Configuración efectiva: Chromium, 1 worker, fixtures sintéticas con setup/teardown automático.

Resultado: `2 passed`.

Además, se añadió un runner específico de un solo test para las siguientes ejecuciones:

```text
npm run test:p5-role
1 passed (47,4 s)
```

Este runner mantiene las variantes de scope del PLANNER en API dentro del mismo contexto y usa
solo dos navegaciones browser para ADMIN y EMPLOYEE, reduciendo la repetición del runner histórico.

Casos cubiertos:

1. `EMPLOYEE UI does not expose planner and API rejects draft writes`: el EMPLOYEE no ve el
   planificador, es redirigido fuera de `/app/schedule` y la API rechaza la creación de borrador.
2. `planner surfaces use active Employee records, not administrative memberships`: el planner
   muestra Employees activos, muestra el ADMIN que tiene Employee activo y excluye el ADMIN sin
   Employee en cuadrícula, filtro y selector de nuevo turno.

Las dos ejecuciones fueron dirigidas a esos riesgos; no se lanzó la batería histórica completa.

## Cobertura aún pendiente

- ADMIN: recorrido completo de gestión, importación y reset.
- PLANNER: verificación browser con scope de área y el caso sin área.
- EMPLOYEE: estado sin vínculo y Employee inactivo.
- P5-M05: self-import, filas ajenas, identidad ausente y fechas futuras.
- P5-M06: matriz completa rol × capacidad × HTTP.

## Bloqueo formal

P5 no puede cerrarse hasta registrar D-03, D-04 y D-05. D-04 es el bloqueo material: define qué
ocurre cuando un EMPLOYEE importa un fichero multiempleado y qué alcance temporal puede escribir.
No se modifica el comportamiento de importación ni se hacen mutaciones correctivas de datos sin
esa decisión.
