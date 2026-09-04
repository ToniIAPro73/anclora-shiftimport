# R5-M12 — MVP Release Gate

## 1. Objetivo

Declarar `MVP_READY` solo cuando el producto completo — desde signup hasta auditoría de una aprobación — funciona de extremo a extremo, con aislamiento de tenant, matriz de permisos correcta, idempotencia de importación, autoridad de API real, invariantes de base de datos verificadas y calidad transversal (lint/typecheck/tests/build/E2E/accesibilidad/responsive/temas/i18n) en verde.

## 2. Problema que resuelve

Ninguna release individual (R0-R5) certifica el producto como un todo coherente. Este Gate es la única puerta que puede declarar el MVP listo para piloto.

## 3. Estado actual del repositorio

MISSING como verificación agregada — depende de que R0-M07, R1-M16, R2-M12, R3-M16, R4-M13, R5-M11 estén TODOS en PASS.

## 4. Alcance IN

El flujo end-to-end completo (master-prompt §20):

```text
signup/login
→ organization
→ employee
→ area opcional
→ import
→ review
→ compare
→ confirm
→ schedule
→ future planning
→ publish
→ employee view
→ acknowledge
→ change request
→ approval
→ audit
```

Más:
- **Tenant isolation**: Org A != Org B, ningún dato se filtra ni muta transversalmente.
- **Permission matrix**: OWNER × ADMIN × PLANNER × EMPLOYEE × (ORGANIZATION × AREA × SELF).
- **Import idempotency**: mismo input → sin efectos secundarios duplicados.
- **API authority**: la UI nunca es la única barrera de autorización.
- **Database invariants**: verificación real sobre Neon de desarrollo, no solo mocks.
- **E2E real**: navegador → API → auth → DB → respuesta → UI.
- **Calidad**: lint, typecheck, tests, build, E2E, cero errores de consola, axe, responsive, dark/light, ES/EN.

## 5. Alcance OUT

Cualquier feature de R6-R9 (post-MVP) — su ausencia no bloquea `MVP_READY`.

## 6. Dependencias

R0-M07, R1-M16, R2-M12, R3-M16, R4-M13, R5-M11 — TODOS deben estar en PASS antes de iniciar este Gate. No hay ejecución parcial: si cualquiera está pendiente o en FAIL, este microfase queda BLOCKED, no se ejecuta.

## 7. Decisiones arquitectónicas

N/A — microfase de verificación pura, no introduce diseño nuevo. Cualquier decisión arquitectónica pendiente detectada aquí implica que un release anterior no estaba realmente cerrado y debe reabrirse (no se parchea aquí).

## 8. Modelo de datos afectado

N/A directamente — se verifican invariantes de todo el modelo acumulado (R0-R5) contra Neon dev real.

## 9. API / Backend

N/A directamente — se verifica que ningún endpoint del sistema completo depende de confianza en el cliente para autorización (repetición agregada de todas las matrices de autorización de R2-M08, R3-M13, R5-M09).

## 10. Frontend / UX

N/A directamente — se verifica el flujo completo en navegador real.

## 11. Seguridad y autorización

Foco central del Gate: tenant isolation + permission matrix completa, verificadas de extremo a extremo, no por componente aislado.

## 12. i18n

Flujo completo verificado en ES y en EN al menos una vez cada uno.

## 13. Accesibilidad

Pase de axe sobre las pantallas clave del flujo completo (import, dashboard, portal de empleado, bandeja de aprobación).

## 14. Responsive / temas

Flujo completo verificado en al menos un viewport móvil y en dark theme, además del desktop/light por defecto.

## 15. Observabilidad / errores

Cero errores de consola del navegador durante todo el recorrido E2E completo.

## 16. Migraciones

Todas las migraciones de R0-R5, en orden, aplicadas desde una base de datos vacía hasta el estado final, sin fallos ni pasos manuales no documentados.

## 17. Compatibilidad y datos existentes

Verificar contra un snapshot de datos "pre-R2-M06" (organizaciones con el modelo de 2 roles previo) que la migración a 4 roles/3 scopes no rompe ninguna organización real existente en desarrollo.

## 18. Tasks

### T01 — Ejecución del flujo E2E completo signup→audit

Objetivo: un único recorrido de navegador real cubriendo los 16 pasos del flujo listado en la sección 4.
Archivos: `qa/e2e-acceptance/specs-local/mvp-release-flow.spec.ts` (ilustrativo).
Cambios: nuevo spec que encadena los specs individuales de cada release en una sola narrativa continua.
No hacer: no dar por bueno el flujo si se ejecuta por partes desconectadas — debe ser una sesión de navegador continua o una cadena de sesiones que comparte el mismo estado de datos.
Criterios de aceptación:
- [ ] Los 16 pasos completan sin intervención manual.
Tests: el propio spec.
Evidencia esperada: reporte de ejecución completo + capturas por paso.

### T02 — Tenant isolation E2E (Org A / Org B)

Objetivo: verificar que ninguna acción de Org A es visible o mutable desde Org B en ningún punto del flujo.
Archivos: spec E2E dedicado con dos organizaciones completas.
Cambios: nuevo spec.
No hacer: no limitarse a un solo endpoint — cubrir imports, empleados, schedules, change requests, approvals.
Criterios de aceptación:
- [ ] 0 filtraciones detectadas en ningún dominio.
Tests: el propio spec.
Evidencia esperada: resultado de test.

### T03 — Permission matrix completa

Objetivo: verificar OWNER/ADMIN/PLANNER/EMPLOYEE × ORGANIZATION/AREA/SELF contra las acciones críticas de cada release.
Archivos: test de integración agregado (reutiliza matrices de R2-M08, R3-M13, R5-M09; no las reescribe).
Cambios: tabla de verificación consolidada.
No hacer: no dejar ninguna celda sin test.
Criterios de aceptación:
- [ ] Matriz 100% cubierta.
Tests: el propio agregado.
Evidencia esperada: tabla + referencias.

### T04 — Import idempotency bajo carga real

Objetivo: repetir el mismo import (mismo archivo, mismo fingerprint) y verificar cero efectos secundarios duplicados.
Archivos: test de integración/E2E.
Cambios: nuevo test si no cubierto ya por R1-M07/M15.
No hacer: no dar por bueno solo por unit test — verificar contra Neon dev real.
Criterios de aceptación:
- [ ] Segundo import idéntico no crea filas duplicadas.
Tests: el propio test.
Evidencia esperada: conteo de filas antes/después.

### T05 — Database invariants sobre Neon dev real

Objetivo: verificar constraints, índices únicos y foreign keys críticos con datos reales de desarrollo, no solo fixtures sintéticos.
Archivos: script de verificación.
Cambios: nuevo script o extensión de `db/migrate.mjs`.
No hacer: no ejecutar contra producción.
Criterios de aceptación:
- [ ] Todas las invariantes críticas (unicidad de structureHash, unicidad de approval_request por change_request, etc.) verificadas.
Tests: el propio script.
Evidencia esperada: log de verificación.

### T06 — Checklist de calidad transversal

Objetivo: ejecutar lint, typecheck, `npm test`, build, E2E completo, axe, responsive, dark/light, ES/EN en una sola pasada consolidada.
Archivos: N/A — ejecución.
Cambios: ninguno de producto.
No hacer: no omitir ningún ítem del checklist sin justificación explícita documentada como warning.
Criterios de aceptación:
- [ ] Todos los ítems en verde o con warning justificado y no bloqueante.
Tests: todos los anteriores.
Evidencia esperada: log consolidado.

## 19. Tests obligatorios

Todos los listados en la sección 18 (E2E completo, tenant isolation, permission matrix, idempotency, invariantes DB, checklist de calidad).

## 20. Evidencias

Reporte E2E completo, tabla de matriz de permisos, log de invariantes DB, log de checklist de calidad, capturas de los 16 pasos del flujo en al menos ES/light/desktop y una pasada adicional en EN/dark/mobile.

## 21. Gate

No hay taxonomía G-parcial aquí: este Gate exige el conjunto completo relevante (G0-G15 según lo que cada release individual ya declaró como obligatorio, más G11/G12/G13 de forma explícita a nivel de sistema completo).

**Regla explícita: solo se declara `MVP_READY` si TODOS los bloqueadores de TODOS los releases anteriores (R0-R5) están cerrados. No existe "MVP_READY parcial" ni "MVP_READY con excepciones" salvo que un warning específico haya sido declarado explícitamente no bloqueante en la spec del release donde se originó (regla PASS_WITH_WARNINGS de master-prompt §9), y dicho warning se re-liste aquí con su justificación vigente.**

Resultado posible: `MVP_READY` | `MVP_NOT_READY` (equivalente a FAIL/BLOCKED a este nivel, con lista explícita de bloqueadores).

## 22. Rollback / remediación

Si el Gate resulta `MVP_NOT_READY`, no hay commit de "release" — se documenta la lista de bloqueadores, se remedian en el release/microfase de origen (nunca parcheando directamente en este Gate), y se repite T01-T06.

## 23. Criterio de DONE

`MVP_READY` declarado únicamente cuando el flujo de 16 pasos, el aislamiento de tenant, la matriz de permisos completa, la idempotencia de importación, las invariantes de base de datos y el checklist de calidad transversal están todos verificados y en verde (o con warning explícitamente no bloqueante y justificado), contra un entorno de desarrollo real.
