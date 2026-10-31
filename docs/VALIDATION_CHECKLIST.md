# Checklist de validación — F3: aprobación y materialización de vacaciones, protección y conflicto con importaciones (2026-11-01)

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development (F3 sobre `cf18909`)
**Spec canónica:** `docs/specs/SPEC-SHIFTIMPORT-PLANNING-SIMPLIFICATION-MOBILE-AND-VACATIONS.md` (F3, §20.1)
**Entorno de validación:** runtime local con flags **efímeros** → Neon `main` (0050 ya aplicada, ninguna migración nueva); escrituras solo en tenants sintéticos `E2E-SHIFT-<runId>`; migración/SQL probados además en PostgreSQL 16 descartable.
**Datos:** sintéticos; 0 escrituras en `ShiftImport` real ni Groundforce (huella idéntica); residuo 0; 0 promociones; variables de Vercel intactas.

## 1. Qué cambia
- **Aprobar y rechazar vacaciones** (`/api/approval-requests`, con `kind=TIME_OFF|SHIFT_CHANGE|ALL`; sin `kind` todo igual que antes). Scope real (ORGANIZATION/AREAS/EMPLOYEES) en la consulta, anti-autoaprobación por usuario y empleado, el propietario siempre decide, la política estrecha al resto.
- **Materialización** al aprobar: los turnos previos pasan a `SUPERSEDED`, se crea `Vacaciones` por día (nunca `Baja`), con rastro en `calendar_changes`; si la solicitud ya había empezado solo se aplica de hoy en adelante y se informa de los días no aplicados.
- **Protección**: el planificador rechaza planificar un día con vacaciones aprobadas (422), la publicación las excluye y los borradores nuevos no las copian; el planificador las muestra bloqueadas.
- **Importaciones**: sobre un día con vacaciones aprobadas, una propuesta distinta queda pendiente de revisión (`APPROVED_VACATION_CONFLICT`); la ausencia sigue vigente.
- **Override auditado**: solo propietario/administrador pueden sustituir las vacaciones por la propuesta; queda registrado con quién lo hizo. Un planificador recibe 403.
- **UI**: insignia «protegida» (candado + texto) en el calendario, chip discontinuo «Vacaciones (Pendiente)» para tus solicitudes, origen y conflicto (con las cinco respuestas y dos acciones) en el detalle del día, motivo en la lista de diferencias, día bloqueado en el planificador.

## 2. Ya comprobado por el agente
| Comprobación | Resultado |
| --- | --- |
| 24 pruebas contra PostgreSQL real (materialización, OD-08, idempotencia/concurrencia, scope, tenant, planificador, override) | PASS |
| E2E real con flags efímeros, 5 escenarios (aprobación, rechazo, planificador, importación en conflicto + override, regresión de cambio de turno) | 5/5, residuo 0 |
| Flags apagados: rutas de vacaciones y `kind=TIME_OFF` ⇒ 404; `qa:local:smoke` | PASS |
| Huella de la organización real `ShiftImport` antes/después | idéntica; Groundforce no existe en esta BD |
| E2E real del feed unificado (`kind` × `status`, fusión ALL por resolución, cursor sin duplicados, tenant, rol, legacy sin `kind`) | PASS |
| `npm run test:f3` (35 ficheros, 510 tests; incluye regresión de aprobación de cambio de turno, estadísticas, ledger, auto-publicación F1) | PASS |
| Arnés accesibilidad/responsive (375/412/1440 × ES-oscuro / EN-claro) | 144/144 |
| `eslint` (0 warnings), `tsc`, `build` | PASS |
| Ninguna suite amplia ni completa ejecutada; ninguna migración nueva | confirmado |

## 3. NOT_RUN / gaps
- **Puerta F3 abierta**: los flags de Vercel Development no existen. Para cerrarla activa en **Development**, en este orden: `TIME_OFF_ENABLED=true` y después `VITE_TIME_OFF_ENABLED=true` (redeploy). Yo no cambio variables de Vercel.
- QA visual con `agent-browser` del flujo F3 sobre el runtime real: pendiente de esa activación (hoy validado con el arnés y los E2E de API).
- F4 (no iniciada): Centro de Solicitudes de gestores y aprobación en bloque (el historial de cambios de turno ya está en la API unificada de F3).
- Suite histórica amplia de `specs-qa-mirror`: deuda técnica no bloqueante de F1; no se ejecutó.

## 4. Para Toni
- Activa los dos flags en Development (servidor primero) y dime: cierro la puerta con la comprobación focal sobre ese entorno.
- Decisión confirmada: el propietario siempre decide (salvo autoaprobación); la política estrecha al resto.
