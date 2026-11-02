# Checklist de validación — Solicitudes, Sustituir/Añadir y consistencia calendario ↔ planificador (2026-11-02)

> Se sobrescribe en cada entrega; el historial queda en Git. El cierre de F3 se conserva en la sección «F3 (cerrada)».

**Repositorio:** anclora-shiftimport
**Rama:** development (commits `11d9605`, `b98be89`, `dd466a9` sobre `a6a4ec2`)
**Spec canónica:** `docs/specs/SPEC-SHIFTIMPORT-PLANNING-SIMPLIFICATION-MOBILE-AND-VACATIONS.md` (§4.5 y §4.5.1)
**Entorno de validación local:** runtime local con flags efímeros → Neon `main`; ninguna migración nueva; escrituras solo en tenants sintéticos `E2E-SHIFT-<runId>`.
**Datos:** sintéticos; 0 escrituras en `ShiftImport` real ni Groundforce; residuo 0.

```text
AUTOMATED_QA=PASS
HUMAN_VALIDATION=PENDING
PREVIEW_INTEGRATED_QA=PENDING
PRODUCTION_DEPLOYMENT=NOT_AUTHORIZED
F4=NOT_STARTED
```

## 1. Qué cambia
### A. Solicitudes (`11d9605`)
- El modal «Solicitudes» se adapta al viewport (altura máxima, scroll interior solo si hace falta), lista primero las solicitudes existentes y abre «Cambio de turno» y «Vacaciones» en modales separados con «Volver a solicitudes».
- «Mis solicitudes»: un administrador/propietario con empleado vinculado puede pedir cambios de turno y vacaciones propios; la autoaprobación sigue prohibida. Las rutas `/api/me/change-requests*` exigen empleado vinculado en lugar del rol `EMPLOYEE`.
- Estado vacío con dos tarjetas (cambio de turno y vacaciones).

### B. Sustituir / Añadir turnos (`b98be89`)
- **D-01 APPROVED:** un día libre sustituido por trabajo pasa a `SUPERSEDED`, permanece en el historial y no cuenta en las estadísticas operativas (libres 0).
- **D-02 APPROVED:** si el día ya tiene turnos vigentes, un diálogo recomienda `REPLACE` o `ADD` (preseleccionado) y exige confirmación y motivo; el servidor repite todas las validaciones.
- **D-03 APPROVED:** `Regular` + `Extras` no solapados coexisten (`ADD`); cuentan una fecha trabajada.
- **D-04 DEFERRED:** descansos parciales/compensatorios, bolsas de horas y retribución quedan fuera.
- Mismo contrato `calendar_changes` (`ADD_SHIFT`/`ADD_EXTRA`, `TYPE_CHANGE`/`TIME_CHANGE`); historial y auditoría; concurrencia (`409 DAY_CHANGED`); vacaciones aprobadas protegidas (F3: `ADD` nunca; sustituirlas solo OWNER/ADMIN con auditoría).

### C. Planificador y publicación (`dd466a9`)
- Una asignación de borrador contradicha por un cambio manual posterior se marca **desactualizada** (`staleAgainstCalendar`) y se conserva.
- Publicar la **excluye** (`STALE_AGAINST_CALENDAR`) y no puede reintroducirla; en una versión **publicada** se muestra como «Excluida de publicación · Desactualizada respecto al calendario».
- Una versión nueva copia la asignación como evidencia, sigue marcada y se vuelve a excluir.
- Calendario operativo: solo turnos vigentes. Historial del día: «Vigente»/«Sustituido», cambios del más reciente al más antiguo.

## 2. Ya comprobado por el agente (`AUTOMATED_QA=PASS`)
| Comprobación | Resultado |
| --- | --- |
| Modal Solicitudes: layout 1366×768 y 375×812, sin clipping | PASS |
| Sustituir/Añadir: matriz REPLACE/ADD, F3, RBAC, tenant, concurrencia (tests + E2E real en tenant sintético) | PASS |
| Estadísticas: día libre sustituido = 0, Extras 420 min, regulares 0 | PASS |
| Borrador obsoleto → publicación `created:0`, `excluded:[STALE_AGAINST_CALENDAR]`; versión publicada y nueva versión | PASS (Postgres real) |
| Visual 1366×768 y 375×812 (calendario, historial, planificador antes/después de publicar) | PASS |
| Commit B aislado: `tsc` + 38/38 tests focales; tests focales de C 76/76; `eslint` (0 warnings) y `tsc` | PASS |
| Ninguna suite amplia ni completa; ninguna migración; residuo 0 | confirmado |

## 3. NOT_RUN / gaps
- **`PREVIEW_INTEGRATED_QA=PENDING`:** QA integrada sobre el Preview de Vercel del nuevo HEAD.
- **`HUMAN_VALIDATION=PENDING`:** validación de Toni en Preview/development.
- Regular + Extras (ADD) y vacaciones protegidas con Sustituir/Añadir: cubiertos por tests y por QA previa, no repetidos en navegador en esta entrega.
- **Limitación UX conocida:** el contador «N turnos» de la cabecera del planificador aún puede incluir asignaciones excluidas/obsoletas.
- La exclusión de una versión publicada se **deriva** (no se almacena); la ruta de publicación por importación (`publishImportedPairsTx`) no se tocó.
- Falso positivo posible: un borrador planificado a propósito sobre un día con cambio manual contradictorio queda marcado y no se publica.
- F4 (no iniciada). Suite histórica `specs-qa-mirror`: deuda técnica no bloqueante, no ejecutada.

## 4. Para Toni
- Valida en Preview/development: Solicitudes (escritorio y móvil, administrador con empleado vinculado), sustituir un Día libre por Extras (calendario + historial), y publicar un borrador obsoleto.
- No se promociona ni se activa Producción sin tu orden expresa.

---

## F3 (cerrada) — histórico conservado

### F3.1 Qué cambia
- **Aprobar y rechazar vacaciones** (`/api/approval-requests`, con `kind=TIME_OFF|SHIFT_CHANGE|ALL`; sin `kind` todo igual que antes). Scope real (ORGANIZATION/AREAS/EMPLOYEES) en la consulta, anti-autoaprobación por usuario y empleado, el propietario siempre decide, la política estrecha al resto.
- **Materialización** al aprobar: los turnos previos pasan a `SUPERSEDED`, se crea `Vacaciones` por día (nunca `Baja`), con rastro en `calendar_changes`; si la solicitud ya había empezado solo se aplica de hoy en adelante y se informa de los días no aplicados.
- **Protección**: el planificador rechaza planificar un día con vacaciones aprobadas (422), la publicación las excluye y los borradores nuevos no las copian; el planificador las muestra bloqueadas.
- **Importaciones**: sobre un día con vacaciones aprobadas, una propuesta distinta queda pendiente de revisión (`APPROVED_VACATION_CONFLICT`); la ausencia sigue vigente.
- **Override auditado**: solo propietario/administrador pueden sustituir las vacaciones por la propuesta; queda registrado con quién lo hizo. Un planificador recibe 403.
- **UI**: insignia «protegida» (candado + texto) en el calendario, chip discontinuo «Vacaciones (Pendiente)» para tus solicitudes, origen y conflicto (con las cinco respuestas y dos acciones) en el detalle del día, motivo en la lista de diferencias, día bloqueado en el planificador.

### F3.2 Ya comprobado por el agente
| Comprobación | Resultado |
| --- | --- |
| 24 pruebas contra PostgreSQL real (materialización, OD-08, idempotencia/concurrencia, scope, tenant, planificador, override) | PASS |
| E2E real con flags efímeros, 5 escenarios (aprobación, rechazo, planificador, importación en conflicto + override, regresión de cambio de turno) | 5/5, residuo 0 |
| Flags apagados: rutas de vacaciones y `kind=TIME_OFF` ⇒ 404; `qa:local:smoke` | PASS |
| Huella de la organización real `ShiftImport` antes/después | idéntica; Groundforce no existe en esta BD |
| E2E real del feed unificado (`kind` × `status`, fusión ALL por resolución, cursor sin duplicados, tenant, rol, legacy sin `kind`) | PASS |
| `npm run test:f3` (35 ficheros, 510 tests; incluye regresión de aprobación de cambio de turno, estadísticas, ledger, auto-publicación F1) | PASS |
| Arnés accesibilidad/responsive (375/412/1440 × ES-oscuro / EN-claro) | 144/144 |
| `eslint` (0 warnings, incluido el spec E2E), `tsc`, `build` | PASS |
| Ninguna suite amplia ni completa ejecutada; ninguna migración nueva | confirmado |

### F3.3 NOT_RUN / gaps
- **Puerta F3 cerrada (`PASS`)** sobre Vercel Preview (rama `development`, deploy `ed1d3a0` posterior a los flags): 6/6 E2E focales de F3 contra el Preview real, QA visual 375/412/1440 (ES oscuro, EN claro) y a11y focal; residuo 0. Producción sin flags.
- QA visual y a11y sobre el runtime real (Preview): hecho; el estado de conflicto de importación se valida en el runtime real por API y en el arnés visual.
- F4 (no iniciada): Centro de Solicitudes de gestores y aprobación en bloque (el historial de cambios de turno ya está en la API unificada de F3).
- Suite histórica amplia de `specs-qa-mirror`: deuda técnica no bloqueante de F1; no se ejecutó.

### F3.4 Para Toni
- Valida F3 en Preview/development; no se promociona ni se activa Producción sin tu orden expresa.
- Decisión confirmada: el propietario siempre decide (salvo autoaprobación); la política estrecha al resto.
