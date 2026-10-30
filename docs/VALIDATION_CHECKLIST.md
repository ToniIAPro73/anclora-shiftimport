# Checklist de validación — F1: planificación móvil y auto-publicación en importación (2026-10-30)

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development (`64b4390`, `9e0f0a6`, `f956210`, `69217b1` sobre `7979b35`)
**Spec canónica:** `docs/specs/SPEC-SHIFTIMPORT-PLANNING-SIMPLIFICATION-MOBILE-AND-VACATIONS.md` (F1)
**Entorno de validación del agente:** navegador con la API **simulada** (0 contacto con Neon) y un PostgreSQL 16 **local descartable** (contenedor propio, ya eliminado). Neon: solo lectura (`db:migrate:status`).
**Datos:** sintéticos. 0 escrituras en Neon, 0 en la organización `ShiftImport`, 0 despliegues manuales, 0 promociones.

## 1. Qué cambia
- **Móvil**: `day-focus` rediseñado (era una tira de ~10 px por especificidad CSS), pista de scroll encima de la rejilla, barra del planificador en rejilla ≤640, «1 turno», calendario mensual compacto con panel del día (`MonthDayAgenda`), TopBar compacto con Rol/Empleado en el menú de cuenta (OD-06).
- **Importación**: nueva decisión `historical-and-auto-publish` (publica solo lo válido, de hoy en adelante, atribuible a la propia importación y sin pisar trabajo manual). Detrás de `IMPORT_AUTO_PUBLISH_ENABLED` (**apagado por defecto**): con el switch apagado todo se comporta como hoy.
- **Reversión** de importaciones auto-publicadas (1:1 o bloqueada) y notificación única por empleado y lote.
- **Migración `0049` preparada y NO aplicada** (`db/migrations/0049_import_auto_publish_decision.sql`, sha256 `550cc2042877…`).

## 2. Ya comprobado por el agente
| Comprobación | Resultado |
| --- | --- |
| Diagnóstico de desbordamiento a 360/375/390/412/430/1440 (calendario, planificador cuadrícula y tabla) | sin desbordamiento del documento; las capturas Samsung equivalen a un layout de ~980 px (no es un defecto de la app) |
| Defectos reproducidos a ≤980 px y corregidos | `day-focus`, pista de scroll, barra del planificador, plural |
| Superficies de importación a 360–430 y 1440, ES/EN, claro/oscuro | sin desbordamiento |
| SQL de publicación granular y flujo completo contra PostgreSQL local | 20 escenarios PASS (publica, SPLIT, semana con borrador ajeno, descanso, manual protegido, procedencia NULL, carrera que rompe el gate, reintento, PLANNER `EMPLOYEES`, otro tenant, `plan-preview` sin escrituras, reversión limpia y SPLIT, dependientes, edición posterior, borrador posterior) |
| Migración `0049` en PostgreSQL local | aplica, queda en el ledger con centinela, idempotente |
| Suite completa (`vitest`) | 2240 PASS, 2 omitidas (integración local) |
| `eslint` / `tsc` / `build` | PASS |
| `db:migrate:status` (Neon, solo lectura) | 48 aplicadas, 1 pendiente (`0049`) |

## 3. NOT_RUN
E2E Playwright contra `vercel dev`/Neon (requieren escribir en la base compartida); verificación de `0049` en Neon; revisión visual manual del consentimiento de importación con datos reales.

## 4. Para Toni
- **Bloqueante para cerrar F1:** autorizar la aplicación de `0049` en Neon (aditiva e idempotente; compatible con el código ya desplegado). Hasta entonces F1 queda `WAITING_MIGRATION_AUTHORIZATION`.
- Confirmar en el móvil si el navegador estaba en «Sitio de escritorio»: las capturas encajan con un layout de ~980 px (`innerWidth` real en `javascript:alert(innerWidth)`).
- Revisar el calendario compacto y el menú de cuenta (Rol/Empleado) en el móvil.
