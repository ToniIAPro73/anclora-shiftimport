# SPEC — ShiftImport Post UX Audit / CRC Tryp / End-to-End

**Autoridad de implementación.** Este documento gobierna el trabajo posterior a la auditoría UX/UI
de 2026-09-05. Las FASES, MICROTAREAS y GATES viven en
[`docs/roadmap/ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md`](../roadmap/ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md)
y no se duplican aquí: las secciones 31–33 remiten a él y esa remisión es normativa.

**Ubicación documental.** `docs/roadmap/` ya existe como ubicación canónica de roadmaps de este
repositorio. `docs/specs/` **no existía** y se ha creado para este documento, por simetría con
`docs/roadmap/` y porque `.anclora/AOS_ADOPTION.md` reserva `sdd/` para specs SDD de *feature*
(estructura `00_PRODUCT_SPEC` … `06_FINAL_REPORT`), formato que no corresponde a una spec
transversal de release que abarca 8 fases. `sdd/` sigue siendo canónico para specs de feature; este
documento es una spec de programa y queda subordinado a los contratos de `docs/standards/` y a AOS.

**Estado**: PLANIFICACIÓN. Nada de lo aquí especificado ha sido implementado.

---

## 1. EXECUTIVE SUMMARY

ShiftImport en `36e7857` es un producto considerablemente más maduro de lo que su propia
documentación declara. Los releases R0 a R5 del roadmap MVP v2 están cerrados con Gate PASS —
incluyendo Scheduling futuro (R3), Portal de Empleado (R4) y Approval Lite (R5) — mientras el
README sigue afirmando que esas tres etapas "no están implementadas todavía", `AGENTS.md` y
`docs/fase1-multitenant.md` describen un modelo de 3 roles con un `MANAGER` eliminado por la
migración `0007`, y `PROGRESS-STATUS.md` congela el progreso en "R2, 3 de 13 microfases".

La auditoría UX/UI encontró 9 hallazgos materiales (2 HIGH, 3 MEDIUM, 2 LOW, 1 OPPORTUNITY, 1 LOW
de confianza baja) y cerró en `PASS_WITH_GAPS`. Ninguno impide completar la tarea núcleo. La
fricción real es de **confianza y comprensión**: el producto decide cosas importantes y no las
cuenta de forma persistente.

Este análisis ha verificado los 9 hallazgos contra el código en HEAD (los 9 siguen vigentes) y ha
localizado la **causa raíz de datos** del hallazgo HIGH principal, que la auditoría no podía ver
desde el navegador: `api/_lib/data.js:1486` fija `const status = 'completed'` en `createImport`.
Un intento de importación bloqueado o fallido **no puede** persistirse. Por eso el usuario, tras un
intento real, encuentra "No hay importaciones registradas". Esto coincide exactamente con el
hallazgo abierto y no corregido de `R1-M09` ("`status='failed'` no tiene ningún path de código"):
un problema de UX y un problema de dominio que resultan ser el mismo problema.

Se ha encontrado además que el único Gate abierto del roadmap histórico es `R5-M12` (MVP Release
Gate), sin línea `STATUS`, lo que deja al producto sin veredicto formal pese a tener R0–R5 en PASS.

El cuaderno NotebookLM sobre CRC Tryp es **inaccesible** (redirección 302 a `accounts.google.com`).
No se ha derivado ninguna idea de esa fuente y la fase correspondiente queda `BLOCKED`.

El plan resultante son 8 fases ejecutables (`P0`–`P7`) con 58 microtareas, más una fase `P8`
bloqueada. `P0` restaura la verdad documental y cierra el MVP Release Gate; `P1` convierte la
importación en una operación que siempre deja rastro y siempre indica cómo recuperarse; `P2`
adelanta el gating de plan; `P3` erradica los 18 diálogos nativos restantes; `P4` cierra los
defectos confirmados de accesibilidad y responsive; `P5` verifica en navegador real los tres roles
nunca probados y define el autoservicio del empleado; `P6` hace legible el histórico; `P7` alinea
la promesa comercial con el modelo Import↔Schedule.

---

## 2. BASELINE

```
BASELINE_VERIFIED
  repo:            anclora-shiftimport
  remote:          https://github.com/ToniIAPro73/anclora-shiftimport.git
  branch:          development (default; excepción AOS EX-SI-001)
  local HEAD:      36e78573c01f968a71cef6066249d0ce2f008576
  origin HEAD:     36e78573c01f968a71cef6066249d0ce2f008576
  drift:           NINGUNO
  worktree inicial: LIMPIO
  commit:          test(scheduling): cover active employee eligibility
  fecha análisis:  2026-09-05
  entorno auditado: https://shiftimport.anclora.com
```

Últimos commits relevantes verificados con `git log`:

| SHA | Mensaje | Relevancia |
|---|---|---|
| `36e7857` | `test(scheduling): cover active employee eligibility` | Elegibilidad de Employee activo cubierta por tests + E2E |
| `867858d` | `test(scheduling): align employee logout E2E flow` | EMPLOYEE redirige de `/app/schedule` al portal |
| `3ff90b2` | `fix(onboarding): decouple owner identity from employee creation` | OWNER ya no genera Employee implícito; remediación aplicada |
| `4b4a346` | `docs(approval): close R5 final gate` | R5-M11 PASS |
| `7d97239` | `test(approval): complete R5-M10 approval E2E` | 4/4 escenarios Playwright contra Neon dev |
| `3d80fce` | `fix(approval): consolidate authorization enforcement` | R5-M09 |
| `ec5ec8a` | `feat(approval): harden concurrent decisions` | R5-M08 concurrencia/idempotencia |

Stack: Vite + React 18 + TypeScript; Vercel Functions sobre Neon Postgres; 32 migraciones
aplicadas; i18n centralizado en `src/lib/i18n.ts` (2636 líneas, ES/EN) con
`i18n-coverage.test.ts`; Playwright en `qa/e2e-acceptance/` con 4 configuraciones y 21 specs;
Vitest para `src/` y `api/` (1216 tests en 136 ficheros según R5-M11).

---

## 3. SOURCE INVENTORY

| Id | Fuente | Acceso | Fiabilidad |
|---|---|---|---|
| A | Repositorio `development` @ `36e7857` | Completo (lectura directa) | **ALTA — autoridad última** |
| B | Auditoría "Auditoría ShiftImport" (`ux-product-experience-review`, `AUDIT_WITH_REPO_CONTEXT`), artifact `404f5d5f` | Completo (leído íntegro) | ALTA para lo `MEASURED_BROWSER`; MEDIA para lo `MEASURED_CODE` (verificado aquí) |
| C | NotebookLM CRC Tryp `82e11632-…` | **BLOQUEADO** (302 → `accounts.google.com/ServiceLogin`) | **NULA — no utilizada** |
| D1 | `docs/roadmap/shiftimport-mvp-v2/` (86 specs R0–R5 + POST-MVP R6–R9) | Completo | ALTA para diseño; MEDIA para estado (verificado con `grep '^STATUS'`) |
| D2 | `sdd/` (specs SDD de feature) | Completo | MEDIA — algunas anteriores al roadmap MVP v2 |
| D3 | `docs/product/SCHEDULING_DOMAIN.md`, `APPLICATION_STRUCTURE_AREAS_OPTIONAL.md` | Completo | ALTA — coincide con código |
| D4 | `docs/standards/` (contratos de marca, modal, motion, i18n, cookies) | Completo | ALTA (copia local; canónico en la vault) |
| D5 | `AGENTS.md`, `.anclora/AOS_ADOPTION.md`, `README.md`, `README.en.md`, `docs/fase1-multitenant.md`, `docs/pricing-hypothesis.md`, `PROGRESS-STATUS.md` | Completo | **BAJA — cinco de siete contradicen el código** |
| D6 | `docs/DAFO_…`, `docs/IMPORT_RECOVERY_FORMAT_MEMORY_REMEDIATION_2026-09-04.md`, `docs/db-environments.md`, `docs/vlm-fallback.md`, `docs/manual/` | Completo | MEDIA-ALTA |

**Regla de precedencia aplicada en todo este documento**: cuando A contradice a cualquier otra
fuente, gana A. Cuando B contradice a A, se re-verifica contra A y se anota el resultado. C no se
usa en absoluto.

---

## 4. SOURCE RECONCILIATION

### SOURCE_RECONCILIATION_MATRIX

| TOPIC | AUDIT_SAYS | REPO_SAYS | DOCS_SAY | NOTEBOOKLM_SAYS | CURRENT_TRUTH | CONFLICT | ACTION_REQUIRED | EVIDENCE |
|---|---|---|---|---|---|---|---|---|
| Modelo de roles | 4 roles reales (OWNER/ADMIN/PLANNER/EMPLOYEE), doc obsoleta (F5) | `rank = { EMPLOYEE:1, PLANNER:2, ADMIN:3, OWNER:4 }` | `AGENTS.md` y `fase1-multitenant.md` dicen ADMIN/MANAGER/EMPLOYEE; `pricing-hypothesis.md` también | BLOCKED | **4 roles**; `MANAGER` eliminado en migración `0007` | SÍ — docs vs código | P0-M01, P0-M03, P0-M06 | `api/_lib/auth.js:177`; `db/migrations/0007_remove_manager_role.sql`; `0013_membership_roles_owner.sql` |
| MANAGER vs PLANNER | PLANNER es el rol real con reglas de scope distintas | `resolveAccessScope` trata PLANNER con `scopedAreaId` | Docs describen MANAGER sin scope | BLOCKED | **PLANNER con scope AREA (o ORGANIZATION si no tiene área asignada)** | SÍ | P0-M03; verificar en P5-M03 | `api/_lib/auth.js:188-210` |
| ADMIN vs OWNER | OWNER es el rol por defecto al crear organización personal; ADMIN existe aparte | `rank` OWNER=4 > ADMIN=3; migración `0014_single_owner_per_organization` | Docs no mencionan OWNER | SÍ | **OWNER único por organización; ADMIN sin esa restricción** | SÍ | P0-M03 | `db/migrations/0013`, `0014` |
| UI de Tipos de turno | Existe pestaña completa (F5) | `SettingsModal.tsx` con CRUD, color, archivar, "cuenta como trabajo" | `AGENTS.md:56` dice que **no** existe | BLOCKED | **Existe** | SÍ | P0-M02 | `SettingsModal.tsx:696,:743`; captura de auditoría |
| Employee vs User | Employee = persona del cuadrante; puede no tener User | `employees.user_id` nullable; estado `pending_access` (`0006`) | `fase1-multitenant.md` correcto en esto | BLOCKED | **Concordante** | NO | Ninguna | `db/migrations/0006_employee_pending_access.sql` |
| OWNER que también es Employee | Onboarding con checkbox opcional (F9) | `3ff90b2` desacopla: el Employee ya **no** se crea implícitamente del nombre del owner | Docs no lo cubrían | BLOCKED | **Relación explícita, nunca implícita** | NO (ya corregido) | No reintroducir | `3ff90b2`; `api/onboarding/onboarding.js` |
| Import vs Schedule | Distinción correcta pero mal comunicada (F8) | `api/_lib/future-import.js`; migraciones `0017`–`0021` | `SCHEDULING_DOMAIN.md` correcto; README lo declara "en roadmap" | BLOCKED | **Implementado; comunicación insuficiente** | SÍ (README) | P0-M04, P7 | `docs/product/SCHEDULING_DOMAIN.md`; `src/components/scheduling/` |
| Personal vs Team | Paywall Team al submit (F2) | `plans.js`: `free`/`personal`/`team` con `teamManagement`, `multiEmployeeImport`, `fullHistory` | `pricing-hypothesis.md` correcto salvo en roles | BLOCKED | **3 planes, enforcement server-side real** | Parcial (roles) | P0-M06, P2 | `api/_lib/plans.js` |
| Import multiempleado | No ejecutado E2E (gap) | `TeamImportModal.tsx` + matching recognized/ambiguous/new; gate transitivo por `maxEmployees` | `pricing-hypothesis.md` §2 lo explica | BLOCKED | **Implementado, no verificado en navegador** | NO, pero **NEEDS_VALIDATION** | P5-M01, P5 | `TeamImportModal.tsx`; auditoría §12 |
| Approval workflow | Preservar lo validado en R5 | `api/approval-requests/` + migraciones `0027`–`0032`; R5-M11 PASS | Roadmap R5 completo | BLOCKED | **Implementado y validado** | NO | No duplicar en el nuevo roadmap | `R5-M11-r5-final-gate.md` §21 |
| Comportamiento del histórico | Histórico vacío tras intento real (F1) | `createImport` fija `status='completed'`; no hay path para `failed`/`blocked` | `R1-M09` documenta el hallazgo y lo deja abierto | BLOCKED | **Los intentos no completados no se registran** | SÍ (producto vs expectativa) | P1-M02, P1-M03, P6 | `api/_lib/data.js:1486`; `R1-M09-import-history.md` |
| Turnos futuros | Ruta a borrador comunicada en una línea pequeña (F8) | `future-import.js`; `shift_assignments`; publicación explícita | `SCHEDULING_DOMAIN.md` correcto | BLOCKED | **Ruta a borrador real e intencionada** | NO (solo comunicación) | P7 | `api/_lib/future-import.js` |
| Self-import de EMPLOYEE | No verificado (PLAN_BLOCKED) | `createImport` acepta scope `SELF` y fuerza `employeeId` propio; `upsertShifts` idem | Ninguna doc lo especifica | BLOCKED | **Técnicamente posible; contractualmente indefinido** | **SÍ — UNRESOLVED hasta D-04** | Decisión D-04 → P5-M05 | `api/_lib/data.js:1500-1513`, `:1686-1700` |
| Limitaciones de plan | Reveladas tarde (F2) | `requireFeature`/`requireWithinLimit` server-side reales | `pricing-hypothesis.md` marca precios como hipótesis | BLOCKED | **Enforcement real, señalización tardía** | SÍ (UX) | P2 | `api/_lib/plans.js`; auditoría F2 |
| Alcance implementado | R3/R4/R5 existen y funcionan | `src/components/scheduling/`, `employee-portal/`, `api/approval-requests/` | `README.md` dice "no están implementadas todavía" | BLOCKED | **Implementadas** | SÍ | P0-M04 | `README.md`; árbol de `src/` |
| Progreso del roadmap | N/A | R0–R5 cerrados; solo R5-M12 abierto | `PROGRESS-STATUS.md` dice "R2, 3 de 13", HEAD `2a64852` | BLOCKED | **R0–R5 cerrados en `36e7857`** | SÍ | P0-M05 | `grep '^STATUS' docs/roadmap/…` |
| MVP Release Gate | N/A | `R5-M12` sin línea `STATUS` | Especificado, no ejecutado | BLOCKED | **NOT_IMPLEMENTED — único gate abierto** | SÍ (estado formal ausente) | P0-M07..M10 | `R5-M12-mvp-release-gate.md` §3 |
| Diálogos nativos | 8+ usos en flujos de negocio (F1) | **18 usos** verificados en 8 ficheros | Ninguna doc los cubre | BLOCKED | **18 usos en journeys de negocio** | La auditoría infravaloró el alcance | P1, P3 | `grep -rn "window.confirm\|window.alert" src/` |
| Copy de estados vacíos | 3 usos indebidos de `orgSelector.noResults` (F3) | Confirmado: `MembersModal.tsx:1100,:1365,:1465` | N/A | BLOCKED | **Vigente** | SÍ | P3-M01 | `src/lib/i18n.ts:484` |
| Inputs de color sin nombre | 2 instancias (F4) | Confirmado: `SettingsModal.tsx:696,:743` | N/A | BLOCKED | **Vigente** | SÍ | P4-M01 | `grep 'type="color"' SettingsModal.tsx` |
| Falsos positivos de accesibilidad | ~30 candidatos regex, mayoría falsos | `TeamImportModal.tsx:1032` sí tiene `aria-label` | N/A | BLOCKED | **No reabrir sin evidencia de navegador** | NO | Excluido explícitamente de P4 | Auditoría F4 nota de método |
| Design system | `anclora-design-system` no integrado; tokens locales | `src/index.css` con tokens locales; sin dependencia | Gap ya documentado por el equipo | BLOCKED | **Gap conocido y aceptado** | NO | Fuera de alcance de este roadmap | `design-system-consumer-check` PASS_WITH_GAPS |
| Modo invitado | Explorado incidentalmente (gap) | `localStorage` local-first intacto | `AGENTS.md` correcto | BLOCKED | **Intacto, no verificado a fondo** | NO, **NEEDS_VALIDATION** | Cobertura en el Gate final | Auditoría §12 |
| Login social | Botones enlazan a endpoints reales; flujo no ejercitado | `api/auth/oauth/{google,github}/` completos; migración `0026` | Commit `73d184e` | BLOCKED | **Implementado, no verificado E2E** | NO, **NEEDS_VALIDATION** | Cobertura en el Gate final | `api/_lib/oauth/` |
| Recuperación de contraseña | No ejercitada | `api/auth/request-reset.js`, `reset-password.js`; migración `0002` | — | BLOCKED | **Implementado, no verificado E2E** | NO, **NEEDS_VALIDATION** | Cobertura en el Gate final | `api/auth/` |
| Formatos de importación | Solo CSV verificado en navegador | PDF/XLSX/CSV/JSON/XML/imagen + fallback VLM; corpus GS-01..10 + GN-01..07 | `AGENTS.md` correcto | BLOCKED | **6 formatos implementados; 1 verificado en navegador** | NO, **NEEDS_VALIDATION** | Cobertura en el Gate final | `src/ingestion/`; `R1-M03` |
| CRC Tryp | N/A | N/A | N/A | **INACCESIBLE** | **Sin información** | N/A | `NOTEBOOKLM_BLOCKED` — P8 | WebFetch → 302 `accounts.google.com` |

**UNRESOLVED declarados**: exactamente uno — el contrato de self-import del EMPLOYEE (fila
"Self-import de EMPLOYEE"). Se resuelve con la decisión **D-04**. Ninguna otra contradicción
material queda sin acción asignada.

### Reconciliación de los ítems del roadmap histórico

| Ítem | Estado reconciliado | Evidencia |
|---|---|---|
| R0 Product & Architecture Rebaseline | `IMPLEMENTED` | `R0-FINAL-GATE-REPORT.md` |
| R1 Safe Import Completion | `IMPLEMENTED` con un `PARTIALLY_IMPLEMENTED` interno: persistencia de imports fallidos | `R1-M09` §T02; `data.js:1486` |
| R2 Organization Foundation | `IMPLEMENTED` | `R2-M12` `DONE — PASS` |
| R3 Future Scheduling | `IMPLEMENTED` | `R3-M16` `DONE — PASS` |
| R4 Employee Portal | `IMPLEMENTED` | `R4-M13`; `a57f674` |
| R5 Approval Lite | `IMPLEMENTED` | `R5-M11` §21 |
| R5-M12 MVP Release Gate | `NOT_IMPLEMENTED` | sin `STATUS`; §3 dice `MISSING` |
| Scheduling | `IMPLEMENTED` | `src/components/scheduling/`, migraciones `0017`–`0021` |
| Approval | `IMPLEMENTED` | migraciones `0027`–`0032` |
| Authorization | `IMPLEMENTED` | `auth.js`, `scope.test.js`, `R2-M08` |
| Multi-format ingestion | `IMPLEMENTED`, `NEEDS_VALIDATION` en navegador para 5 de 6 formatos | `src/ingestion/`; auditoría §12 |
| Employees | `IMPLEMENTED` | `R2-M02`; migraciones `0005`, `0006` |
| Areas | `IMPLEMENTED` (opcionales por diseño) | migración `0008`; `APPLICATION_STRUCTURE_AREAS_OPTIONAL.md` |
| Onboarding | `IMPLEMENTED`, corregido en `3ff90b2` | `R2-M10-owner-employee-separation-remediation.md` |
| Historical imports | `PARTIALLY_IMPLEMENTED` | solo `completed` y `deleted` son representables |
| Premium/Team features | `IMPLEMENTED` (sin billing), `REQUIRES_PRODUCT_DECISION` en la señalización | `plans.js`; `pricing-hypothesis.md` §4 |
| Responsive | `PARTIALLY_IMPLEMENTED` | F6, F7 |
| Accessibility | `PARTIALLY_IMPLEMENTED` | F4 |
| Role model | `IMPLEMENTED` en código, `OBSOLETE` en documentación | F5 |
| POST-MVP R6–R9 | `NOT_IMPLEMENTED` por diseño | `POST-MVP/` |

---

## 5. CURRENT PRODUCT STATE

Para cada área: `WHAT_EXISTS` / `WHAT_WORKS` / `WHAT_IS_PARTIAL` / `WHAT_IS_OUTDATED` /
`WHAT_IS_MISSING` / `WHAT_IS_UNCERTAIN`.

### PRODUCT
- **EXISTS**: plataforma B2B/B2B2E de gestión operativa de turnos con Safe Import como núcleo; derivada comercial de `anclora-groundsync`; modo invitado local-first + modo autenticado multi-tenant.
- **WORKS**: registro → organización → import CSV → previsualización editable → calendario, en minutos, en ambos temas.
- **PARTIAL**: la promesa comercial ("calendario listo para usar") no contempla la publicación de futuros.
- **OUTDATED**: `README.md`/`README.en.md` declaran R3/R4/R5 como no implementados; `AGENTS.md` describe el producto como "Premium B2C" mientras el README lo describe como B2B/B2B2E.
- **MISSING**: billing; no existe ningún paso de pago.
- **UNCERTAIN**: posicionamiento B2C vs B2B — las dos fuentes internas discrepan y ninguna es claramente posterior.

### ARCHITECTURE
- **EXISTS**: Vite + React 18 + TS; Vercel Functions en `api/`; Neon Postgres; router propio `src/lib/route.ts` (8 rutas); backend legacy en saneamiento (`server.mjs`, `server-export.mjs`, `proxy-server.mjs`).
- **WORKS**: aislamiento por `organization_id` forzado en backend; toda operación pasa por `api/_lib/data.js` con contexto de sesión.
- **PARTIAL**: `src/App.tsx` concentra 1813 líneas de estado y orquestación — punto de contención de escritura y riesgo de regresión.
- **OUTDATED**: la descripción de `api/` en `AGENTS.md` no menciona `approval-requests/`, `schedules/`, `me/`.
- **MISSING**: integración de `anclora-design-system` (gap conocido y aceptado).
- **UNCERTAIN**: si el backend legacy sigue teniendo consumidores.

### DATA_MODEL
- **EXISTS**: 32 migraciones. Organization (`personal`/`company`, `plan`), User, Membership (rol + `scoped_area_id`), Employee (`status`: `active`/`inactive`/`pending_access`, `user_id` nullable, `area_id`), Area (opcional), Import, Shift, Schedule, ScheduleVersion, ShiftAssignment, Acknowledgement, Comment, ChangeRequest, Notification, OAuthIdentity, ApprovalPolicy, ApprovalRequest, OrganizationAuditEvent, FormatProfile.
- **WORKS**: `organization_id NOT NULL` en las 6 tablas de negocio (auditado en R2-M00); unicidad de `structureHash`; único OWNER por organización (`0014`); idempotencia de import (`0011`, `0012`).
- **PARTIAL**: `imports.status` no admite `partial`/`blocked`/`failed`.
- **OUTDATED**: nada.
- **MISSING**: motivo estructurado de resultado de importación; `blocking_employee_id`.
- **UNCERTAIN**: si `backfill-import-counters.mjs` asume implícitamente `status='completed'`.

### AUTH_MODEL
- **EXISTS**: sesiones por cookie (`anclora_session`), scrypt + `timingSafeEqual`, rate limit de login (10/5min en memoria por instancia), OAuth Google/GitHub con PKCE, reset de contraseña.
- **WORKS**: `resolveContext` sin fallback silencioso — multi-org sin selección ⇒ 400 `Organization selection required`; `x-organization-id` solo se honra con membership.
- **PARTIAL**: rate limit no distribuido (limitación ya documentada).
- **MISSING**: verificación de email; infraestructura de correo (contraseñas iniciales se entregan fuera de banda).
- **UNCERTAIN**: comportamiento real del flujo OAuth completo (nunca ejercitado end-to-end).

### ROLE_MODEL
- **EXISTS**: OWNER > ADMIN > PLANNER > EMPLOYEE (`requireRole`); scopes ORGANIZATION / AREA / SELF (`resolveAccessScope`).
- **WORKS**: el cliente no puede ensanchar el scope; EMPLOYEE sin employee vinculado → `SCOPE_UNAVAILABLE`.
- **PARTIAL**: PLANNER sin `scoped_area_id` cae a scope ORGANIZATION — comportamiento correcto en código, no declarado en ningún documento de producto.
- **OUTDATED**: toda la documentación de roles (P0).
- **MISSING**: verificación en navegador de ADMIN, PLANNER, EMPLOYEE.
- **UNCERTAIN**: si el fallback de PLANNER a ORGANIZATION es intencionado (decisión D-05).

### PLAN_MODEL
- **EXISTS**: `free` / `personal` / `team` en `organizations.plan` con `CHECK`; `plans.js` como única autoridad; espejo de display en `src/lib/plans.ts`.
- **WORKS**: `requireFeature` / `requireWithinLimit`; plan desconocido → `free` (falla cerrado); plan leído de la fila, nunca del cliente.
- **PARTIAL**: la UI no anticipa el bloqueo (F2).
- **MISSING**: billing; el onboarding de empresa concede `team` incondicionalmente como grant pre-billing.
- **UNCERTAIN**: si ese grant debe seguir siendo la vía de provisión de QA (decisión D-06).

### IMPORT_MODEL
- **EXISTS**: pipeline `analyze → review → compare → confirm`; perfiles declarativos; parsers PDF/XLSX/CSV/JSON/XML; fallback VLM server-side para PDF/imagen; estados canónicos de diagnóstico (`READY`/`NEEDS_USER_INPUT`/`PARTIAL`/`BLOCKED`/`UNSUPPORTED`/`FAILED`); asistente de formato posicional y tabular; memoria de formato (`format_profiles`).
- **WORKS**: nunca escribe antes de la previsualización; transacción envolvente en `upsertShifts` (corregido en R1-M08); idempotencia por `(org, employee, fingerprint, contexto)`; corpus de aceptación GS-01..10 + GN-01..07.
- **PARTIAL**: la comunicación del resultado (F1); solo CSV verificado en navegador.
- **MISSING**: persistencia de intentos no completados; recuperación contextual; reintento.
- **UNCERTAIN**: comportamiento real de imagen + VLM en navegador (cubierto por QA visual `qa/vlm-fallback/`, no por E2E interactivo).

### SCHEDULING_MODEL
- **EXISTS**: Schedule, ScheduleVersion (borrador/publicada), ShiftAssignment; planificador semanal; tabla accesible alternativa; validación de solapes; regla de descanso base; historial de versiones; bloqueo de versión publicada.
- **WORKS**: feedback ejemplar al crear borrador (fortaleza señalada por la auditoría); solo Employees activos son asignables (`36e7857`).
- **PARTIAL**: responsive de la tabla accesible a 390px (F6).
- **MISSING**: nada material dentro del alcance MVP.
- **UNCERTAIN**: alcance efectivo de PLANNER sin área (D-05).

### APPROVAL_MODEL
- **EXISTS**: ApprovalPolicy (`NO_APPROVAL` / `ORGANIZATION_ADMIN` / `AREA_RESPONSIBLE`), routing de ChangeRequest, inbox de aprobador, aprobar/rechazar con motivo obligatorio, aplicación del cambio aprobado, auditoría, control de concurrencia.
- **WORKS**: R5-M11 PASS con 4/4 E2E contra Neon dev; 8 organizaciones existentes migradas a `NO_APPROVAL`.
- **PARTIAL/MISSING/UNCERTAIN**: nada identificado. **Este dominio se preserva; el nuevo roadmap no lo toca.**

### EMPLOYEE_MODEL
- **EXISTS**: Employee con `status`, `external_employee_id` único por organización cuando está presente, `user_id` opcional, `area_id` opcional; alta inline durante import; bulk provisioning.
- **WORKS**: `EMPLOYEE_HAS_HISTORY` impide borrar con historial; `LAST_ADMIN` protege al último administrador; el vínculo User↔Employee activa automáticamente al empleado.
- **PARTIAL**: los cuatro caminos de bloqueo por identidad (inactivo, `pending_access`, ambiguo, nuevo) se comunican con diálogos nativos.
- **MISSING**: contrato de autoservicio del EMPLOYEE.
- **UNCERTAIN**: qué debe ocurrir con las filas ajenas en un import hecho por un EMPLOYEE (D-04).

### MEMBERSHIP_MODEL
- **EXISTS**: Membership(user, organization, role, `scoped_area_id`, `employee_id`); gestión B2B en `api/memberships`.
- **WORKS**: whitelist de roles server-side; el último ADMIN no se degrada ni se elimina; auto-eliminación prohibida; al remover, el employee queda con `user_id NULL`.
- **PARTIAL**: la UI de alta permite rellenar todo antes de revelar el paywall (F2).
- **OUTDATED**: la whitelist documentada incluye `MANAGER`.
- **MISSING**: invitación por email (no hay infraestructura de correo).

### AREA_MODEL
- **EXISTS**: áreas opcionales (`0008`), responsables de área, import con alcance de área, snapshot de nombre en el histórico.
- **WORKS**: una organización sin áreas no sufre fricción; el mismatch de área nunca importa en silencio.
- **PARTIAL**: la decisión de mismatch se toma con `window.confirm`.

### HISTORY_MODEL
- **EXISTS**: `imports` extendida (`0010`) con modo, periodo, alcance, snapshot de área, conteos, fingerprint y soft-delete; API con paginación y 6 filtros; `ImportHistoryModal`.
- **WORKS**: soft-delete de la fila + hard-delete de los shifts creados por `import_id`; los turnos manuales nunca se tocan.
- **PARTIAL**: solo `completed` y `deleted` son representables; los filtros de la API no están expuestos en UI.
- **MISSING**: registro de intentos bloqueados/fallidos; enlaces de recuperación; señalización de `fullHistory`.

### SETTINGS_MODEL
- **EXISTS**: perfil, organización (renombrar), equipo, tipos de turno (CRUD completo con color y "cuenta como trabajo"), perfiles de formato, reset operativo.
- **WORKS**: todo lo anterior en navegador (verificado por la auditoría).
- **PARTIAL**: accesibilidad de los selectores de color (F4).
- **OUTDATED**: `AGENTS.md:56` niega la existencia de esta UI.

### I18N_MODEL
- **EXISTS**: ES/EN centralizados en `src/lib/i18n.ts` (2636 líneas); `i18n-coverage.test.ts`; `LOCALIZATION_CONTRACT.md`.
- **WORKS**: cobertura verificada por test propio.
- **PARTIAL**: `orgSelector.noResults` reutilizada en 3 puntos semánticamente incorrectos (F3).
- **UNCERTAIN**: el escáner genérico `i18n-integrity-check` espera `locales/` — limitación de herramienta, no de producto.

### ACCESSIBILITY_STATE
- **EXISTS**: `ModalShell` con ESC, focus trap, foco inicial/retorno, `role="dialog" aria-modal`; tabla accesible del planificador con `aria-label` verificado en el árbol de accesibilidad; `prefers-reduced-motion` respetado; contraste correcto en ambos temas.
- **WORKS**: lo anterior.
- **PARTIAL**: `ImportResultModal` usa `div role="dialog"` crudo en lugar de `ModalShell`; 2 inputs de color sin nombre.
- **MISSING**: alternativa accesible a los 18 diálogos nativos (un `window.confirm` no es un `alertdialog`).
- **UNCERTAIN**: nada. Los ~30 candidatos regex fueron descartados manualmente y **no deben reabrirse sin evidencia de navegador**.

### RESPONSIVE_STATE
- **EXISTS**: suite responsive con 4 viewports y una config dedicada de landscape.
- **WORKS**: la app "cabe" en los cuatro viewports.
- **PARTIAL**: tabla accesible y `StatsBar` se recortan a 390px sin affordance; panel "Añadir turno" se solapa; nav del landing se apila por encima del CTA.

### TESTING_STATE
- **EXISTS**: Vitest (`src` + `api`), 1216 tests / 136 ficheros; Playwright con 4 configs y 21 specs; corpus de aceptación de ingesta; QA visual (`qa/vlm-fallback/`, `qa/public-header-auth/`); `db/migrations.test.mjs`; `scripts/smoke-api.mjs`.
- **WORKS**: cobertura fuerte de dominio y autorización.
- **PARTIAL**: no hay guardia automática contra la reintroducción de diálogos nativos; matriz de roles no es un test ejecutable.
- **MISSING**: E2E de import bloqueado→recuperación; E2E de entitlement; E2E de matriz de roles.

### AOS_STATE
- **EXISTS**: `.anclora/AOS_ADOPTION.md`, adopción 0.2.0, Governance Level 3, excepción `EX-SI-001` (default branch `development`) `ACCEPTED`.
- **WORKS**: la declaración es coherente con la realidad de ramas.
- **PARTIAL**: `Last Reviewed: 2026-08-18` — la política declara revisión al inicio de cada fase de producto; se han cerrado R0–R5 desde entonces sin revisión registrada.
- **MISSING**: registro de la revisión de adopción correspondiente a R1–R5.

### DOCUMENTATION_STATE
- **EXISTS**: 86 specs de roadmap, `docs/standards/` (11 contratos), `docs/product/`, manual de usuario con capturas, `sdd/`.
- **WORKS**: `SCHEDULING_DOMAIN.md`, `RBAC-MODEL.md`, `db-environments.md` y `pricing-hypothesis.md` (salvo roles) coinciden con el código.
- **OUTDATED**: `AGENTS.md` (roles, UI de tipos, inventario de `api/`), `docs/fase1-multitenant.md` (tabla de permisos, whitelist), `README.md`/`README.en.md` (alcance), `PROGRESS-STATUS.md` (progreso), `pricing-hypothesis.md` §1 (roles).
- **MISSING**: contrato de resultado de importación; contrato de autoservicio del empleado; matriz de roles verificada.

---

## 6. PRODUCT PRINCIPLES

Principios que gobiernan toda decisión de este programa. Derivados de invariantes ya presentes en
el código y en `AGENTS.md`, no inventados.

1. **La importación nunca escribe antes de que la persona confirme.** Previsualización editable siempre.
2. **La importación nunca falla en silencio — y a partir de P1, tampoco desaparece en silencio.** Todo intento deja rastro consultable.
3. **Nunca se importan turnos sobre una identidad de empleado no verificada.** Esta regla no se relaja por conveniencia de UX; solo cambia cómo se comunica.
4. **El backend es la única autoridad de autorización y de plan.** La UI puede anticipar, nunca decidir.
5. **El cliente no puede ensanchar su propio scope.** Ni por id, ni por header, ni por body.
6. **Ningún `Shift` sin `organization_id` + `employee_id`.**
7. **Toda acción destructiva se confirma explícitamente y describe su consecuencia en números.**
8. **Un estado vacío nunca miente sobre lo que el usuario está mirando.**
9. **Una capacidad de pago se muestra deshabilitada y explicada, no oculta.** La descubribilidad comercial importa; el esfuerzo desperdiciado, no.
10. **Importado ≠ publicado.** La distinción es del modelo de datos y debe ser del lenguaje.
11. **La documentación de referencia es un artefacto de producto.** Si contradice al código, es un defecto, no una imprecisión.
12. **La evidencia manda sobre el escáner.** Un regex no abre un finding de accesibilidad; el árbol de accesibilidad del navegador, sí.

---

## 7. USERS

| Usuario | Contexto | Necesidad primaria | Superficie principal |
|---|---|---|---|
| Propietario primerizo (OWNER) | Crea la organización en el registro | Pasar de un PDF/CSV a un calendario en minutos | Landing → signup → onboarding → `/app` |
| Propietario recurrente (OWNER) | Cuadrante nuevo cada mes | Importar sin sorpresas y ver qué pasó | `/app` → ImportModal → histórico |
| Administrador (ADMIN) | Gestiona personas y configuración | Saber de antemano qué permite su plan | Ajustes → Usuarios / Empleados / Áreas |
| Planificador (PLANNER) | Responsable de un área | Planificar dentro de su alcance sin miedo | `/app/schedule` |
| Empleado (EMPLOYEE) | Consulta y confirma sus turnos | Ver lo suyo, confirmar, pedir cambios | Portal (Hoy / Mi semana / Solicitudes / Más) |
| Usuario Personal | B2C/prosumer, una sola persona | Sus propios turnos, sin equipo | `/app` con plan `personal` |
| Usuario Team | Organización con varias personas | Operaciones multiempleado | `/app` con plan `team` |
| Visitante / invitado | Sin sesión | Probar sin registrarse | Landing, `/pricing`, `/app` local-first |

---

## 8. ROLE MATRIX

Estado objetivo. La columna "Verificación" indica el nivel de evidencia exigido al cierre de P5.
Hoy solo OWNER tiene `MEASURED_BROWSER`.

| Capacidad | OWNER | ADMIN | PLANNER | EMPLOYEE | Scope efectivo | Verificación exigida |
|---|---|---|---|---|---|---|
| Ver su propio calendario | ✔ | ✔ | ✔ | ✔ | SELF/ORG | BROWSER |
| Ver calendarios de la organización | ✔ | ✔ | ✔ (su área) | ✘ | ORG/AREA | BROWSER |
| Importar turnos de terceros | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |
| Importar los propios turnos | ✔ | ✔ | ✔ | ✔ (según D-04) | SELF | BROWSER |
| Importación multiempleado | ✔ (plan `team`) | ✔ (plan `team`) | ✘ | ✘ | ORG | BROWSER |
| Crear Employee (alta inline) | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |
| Editar/desactivar Employee | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |
| Vincular User ↔ Employee | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |
| Gestionar memberships y roles | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |
| Gestionar áreas | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |
| Gestionar tipos de turno | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |
| Renombrar la organización | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |
| Reset de datos operativos | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |
| Crear/editar borrador de planificación | ✔ | ✔ | ✔ (su área) | ✘ | ORG/AREA | BROWSER |
| Publicar versión de planificación | ✔ | ✔ | ✔ (su área) | ✘ | ORG/AREA | BROWSER |
| Confirmar recepción de turno (acknowledge) | ✔ (si es Employee) | ✔ (idem) | ✔ (idem) | ✔ | SELF | BROWSER |
| Solicitar cambio de turno | ✔ (idem) | ✔ (idem) | ✔ (idem) | ✔ | SELF | BROWSER |
| Aprobar/rechazar solicitudes | ✔ | ✔ | ✔ (si es responsable de área) | ✘ | ORG/AREA | BROWSER |
| Ver histórico de importaciones | ✔ | ✔ | ✔ (su área) | ✔ (solo suyas) | ORG/AREA/SELF | BROWSER |
| Eliminar una importación | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |
| Ver eventos de auditoría | ✔ | ✔ | ✘ | ✘ | ORG | BROWSER |

**Invariantes de la matriz**
- Único OWNER por organización (migración `0014`).
- El último ADMIN no puede degradarse ni eliminarse; nadie puede auto-eliminarse.
- PLANNER sin `scoped_area_id` opera a nivel ORGANIZATION (comportamiento actual — pendiente de D-05).
- EMPLOYEE sin Employee vinculado queda bloqueado en "Cuenta no vinculada", sin datos.
- EMPLOYEE cuyo Employee está `inactive` no puede recibir turnos importados ni asignaciones.

---

## 9. PLAN MATRIX

| Capacidad | free | personal | team | Autoridad |
|---|---|---|---|---|
| Empleados activos | 1 | 1 | ilimitado | `plans.js.limits.maxEmployees` |
| Importaciones/mes | 5 | ilimitado | ilimitado | `plans.js.limits.maxMonthlyImports` |
| Importación multiempleado | ✘ | ✘ | ✔ | `features.multiEmployeeImport` |
| Gestión de equipo (invitar usuarios) | ✘ | ✘ | ✔ | `features.teamManagement` |
| Histórico completo | ✘ | ✔ | ✔ | `features.fullHistory` |

**Reglas normativas**
1. Plan y Rol son **ortogonales**: `plans.js` no importa `auth.js` ni `data.js`, y no debe hacerlo.
2. Un `planId` desconocido resuelve a `free` — falla siempre hacia el plan más restrictivo.
3. El plan se lee de la fila de la organización resuelta por sesión, nunca de un header o body.
4. **Requisito de UX (P2)**: toda capacidad bloqueada por plan debe señalizarse **antes** de que el usuario invierta esfuerzo, y seguir deshabilitada, visible y explicada — nunca oculta ni silenciosamente rota.
5. No existe billing. El onboarding de empresa concede `team` como grant pre-billing; esto es una decisión comercial vigente (D-06), no un defecto.

---

## 10. CURRENT JOURNEYS

Journeys tal como se comportan hoy, con la fricción medida.

- **J1 Registro → onboarding → organización**: entrada por `/signup`; sin verificación de email; sesión inmediata; onboarding en 2 pasos con checkbox "También trabajaré como empleado" que revela un campo obligatorio. *Fricción*: sin validación inline visible en el intento observado (F9, confianza baja).
- **J2 Importación individual**: seleccionar formato → subir → analizar → asistente si hace falta → previsualizar/editar → confirmar. *Fricción*: si el empleado es nuevo/pendiente/ambiguo/inactivo, la decisión y el resultado se comunican con `window.confirm` + `window.alert`, el modal se cierra y **no queda nada** (F1). El histórico queda vacío porque el intento no se persiste (`data.js:1486`).
- **J3 Importación de equipo**: `TeamImportModal` con matching recognized/ambiguous/new. *Fricción*: bloqueado por plan; no verificado E2E.
- **J4 Gestión de usuarios**: Ajustes → Usuarios de la organización. *Fricción*: formulario completo habilitado; paywall al enviar (F2). Estados vacíos dicen "No se encontraron organizaciones" (F3).
- **J5 Planificación**: crear borrador semanal → editar asignaciones → publicar. *Fortaleza*: feedback ejemplar al crear borrador. *Fricción*: recorte sin affordance a 390px (F6); borrado de asignación con `confirm` nativo.
- **J6 Portal de empleado**: Hoy / Mi semana / Solicitudes / Más; acknowledge, comentarios, solicitud de cambio. *No verificado en navegador.*
- **J7 Aprobación**: inbox → aprobar/rechazar con motivo → aplicar → auditar. *Validado en R5.*
- **J8 Histórico**: listar, filtrar por API, eliminar con `confirm` nativo. *Fricción*: no explica por qué está vacío ni registra intentos no completados.
- **J9 Ajustes**: perfil, organización, equipo, tipos de turno, perfiles de formato. *Fricción*: selectores de color sin nombre accesible (F4).
- **J10 Landing/pricing**: promesa "calendario listo para usar", 3 pasos, CTA único. *Fricción*: nav apilada sobre el CTA a 390px (F7); la promesa omite la publicación de futuros (F8).

---

## 11. TARGET JOURNEYS

Estado objetivo al cierre de P7. Cada journey indica los roles que pueden ejecutarlo. **No todos
los roles pueden ejecutar todos los journeys.**

| Journey | Roles | Comportamiento objetivo |
|---|---|---|
| REGISTER | Visitante | Alta con email+contraseña o social; estado de carga explícito; sin verificación de email (limitación declarada, no un defecto oculto). |
| ONBOARD | Nuevo OWNER | 2 pasos; el checkbox "También trabajaré como empleado" es la **única** vía de crear un Employee para el propietario; validación inline con `aria-describedby` si falta el nombre. |
| CREATE ORGANIZATION | OWNER | Personal (`free`/`personal`) o empresa (`team`); el plan resultante y sus límites se muestran al terminar. |
| LINK OWNER TO EMPLOYEE | OWNER, ADMIN | Explícito y reversible; nunca implícito a partir del nombre de usuario. |
| IMPORT OWN SHIFTS | Todos los roles con Employee vinculado | Import bajo scope SELF; filas ajenas descartadas con recuento visible; identidad ausente ⇒ `blocked` con acción de desambiguación (D-04). |
| IMPORT TEAM SHIFTS | OWNER, ADMIN con plan `team` | Aviso de plan **antes** de seleccionar fichero; matching por lote con desglose de 5 categorías; una única confirmación. |
| RESOLVE UNKNOWN EMPLOYEE | OWNER, ADMIN | Alta parcial (`pending_access`) ofrecida sin salir del flujo; el intento se detiene, se registra como `blocked` y ofrece "Completar alta" + "Reintentar". |
| RESOLVE AMBIGUOUS EMPLOYEE | OWNER, ADMIN | Resultado persistente con la lista de candidatos y una acción de desambiguación, no un `alert`. |
| COMPLETE PENDING EMPLOYEE | OWNER, ADMIN | Desde el resultado o desde el histórico, con el empleado ya localizado en "Usuarios de la organización". |
| RETRY BLOCKED IMPORT | OWNER, ADMIN, EMPLOYEE (para el suyo) | Reintento explícito con el mismo fichero, respetando la deduplicación; la entrada de histórico refleja el nuevo intento. |
| VIEW IMPORT RESULT | Actor del import | Resumen persistente hasta cierre explícito: N de M turnos, motivo, entidad bloqueante, acción siguiente, y cuántos fueron a borrador. |
| VIEW IMPORT HISTORY | Todos (según scope) | Cinco estados legibles + actor + alcance + formato + periodo + conteos + filtros + enlaces de recuperación; `fullHistory` señalizado antes en `free`. |
| CREATE SCHEDULE | OWNER, ADMIN, PLANNER (su área) | Borrador semanal con feedback explícito (comportamiento actual, preservado). |
| EDIT SCHEDULE | OWNER, ADMIN, PLANNER (su área) | Solo sobre versiones en borrador; solo Employees activos como destino. |
| PUBLISH SCHEDULE | OWNER, ADMIN, PLANNER (su área) | Publicación explícita; la versión publicada queda inmutable. |
| APPROVE / REJECT | OWNER, ADMIN, PLANNER responsable de área | Según `ApprovalPolicy`; rechazo con motivo obligatorio; decisiones concurrentes resueltas (preservado de R5). |
| VIEW PERSONAL CALENDAR | Todos con Employee vinculado | Solo turnos publicados propios para EMPLOYEE. |
| MANAGE EMPLOYEES | OWNER, ADMIN | Con confirmaciones que cuantifican la consecuencia. |
| MANAGE USERS | OWNER, ADMIN con plan `team` | Aviso de plan antes del formulario; capacidad visible y deshabilitada en planes inferiores. |
| MANAGE AREAS | OWNER, ADMIN | Áreas opcionales; desactivar informa cuántos empleados afecta. |
| MANAGE SHIFT TYPES | OWNER, ADMIN | Con nombres accesibles en los selectores de color; eliminar informa cuántos turnos lo referencian. |
| LOGOUT | Todos | Limpia contexto de cliente y token de servidor; EMPLOYEE sale desde "Más". |

---

## 12. DATA MODEL

Modelo objetivo. Solo se especifica lo que **cambia**; el resto queda tal como está y es
`DO_NOT_BREAK`.

**Cambio único previsto (P1-M02, migración `0033_import_outcome.sql`)**:

```
imports
  status          TEXT NOT NULL   -- CHECK ampliado: 'completed' | 'partial' | 'blocked' | 'failed'
  outcome_reason  TEXT NULL       -- EMPLOYEE_PENDING_ACCESS | EMPLOYEE_INACTIVE |
                                  -- EMPLOYEE_AMBIGUOUS | EMPLOYEE_UNKNOWN |
                                  -- SELF_IDENTITY_NOT_FOUND | PLAN_LIMIT |
                                  -- AREA_MISMATCH_DECLINED | DOCUMENT_ERROR | SYSTEM_ERROR
  outcome_detail  JSONB NULL      -- conteos y contexto; nunca contenido del fichero, nunca PII nueva
  blocking_employee_id UUID NULL REFERENCES employees(id) ON DELETE SET NULL
```

**Reglas**
- Forward-only, aditiva, idempotente (`IF NOT EXISTS`). El `CHECK` se **amplía**, nunca se estrecha.
- Filas existentes conservan `completed` y `NULL` en las columnas nuevas.
- Un intento `blocked` **no** consume la clave de idempotencia: el reintento posterior con el mismo fingerprint debe poder completarse.
- `outcome_detail` está acotado a datos ya visibles para el actor en su scope.

**Invariantes preservadas**: `organization_id NOT NULL` en las 6 tablas de negocio; ningún `Shift`
sin `organization_id` + `employee_id`; unicidad de `structureHash`; único OWNER por organización;
unicidad de `approval_request` por `change_request`; soft-delete de `imports` con hard-delete de sus
shifts por `import_id`; los turnos manuales (`import_id IS NULL`) nunca se tocan.

---

## 13. AUTHORIZATION MODEL

```
sesión (cookie anclora_session)
  → resolveContext(req, sql)        -- sin fallback silencioso
  → membership(user, organization)  -- x-organization-id solo si hay membership
  → role                            -- OWNER 4 > ADMIN 3 > PLANNER 2 > EMPLOYEE 1
  → resolveAccessScope(membership)  -- ORGANIZATION | AREA(areaId) | SELF(employeeId)
  → data-access org-scoped          -- api/_lib/data.js, siempre
```

**Reglas normativas**
1. `requireOrgContext` para todo endpoint de datos; `requireAuthenticatedContext` solo para onboarding y perfil.
2. `requireRole(ctx, minimum)` compara rangos; un rol desconocido siempre falla cerrado.
3. `resolveAccessScope` es **puro**: el llamante no puede ensancharlo con ids del cliente.
4. `assertEmployeeInScope` y `assertScopedResource` se aplican a todo recurso direccionado por id.
5. Un recurso de otra organización devuelve 403 sin filtrar existencia.
6. `SCOPE_UNAVAILABLE` cuando un EMPLOYEE no tiene Employee vinculado.
7. El plan **no** es autorización: `PlanLimitError` (403, `code: 'PLAN_LIMIT'`) es una capa distinta y ortogonal.
8. Ningún endpoint nuevo puede cambiar el plan de una organización desde el cliente (restricción explícita de P5-M01).

---

## 14. IMPORT DOMAIN

**Etapas**: `analyze → review → compare → confirm`, seguidas del nuevo estadio **`outcome`** (P1).

**`ImportOutcome` (contrato normativo, P1-M01)**

| status | Significado | Datos obligatorios |
|---|---|---|
| `completed` | Todas las filas elegibles se persistieron | conteos creados/existentes |
| `partial` | Se persistió un subconjunto; el resto no, con motivo | conteos por categoría + motivo del resto |
| `blocked` | Nada se persistió por una condición resoluble por el usuario | motivo + entidad bloqueante + acción de desbloqueo |
| `failed` | Nada se persistió por error de documento o de sistema | tipo de error + si es reintentable |

Reglas:
- `completed` con 0 turnos creados y 0 existentes es un error de contrato (400 en `POST /api/imports`).
- Todo intento produce exactamente un `ImportOutcome` y exactamente una fila de `imports`.
- Un `blocked` no consume la clave de idempotencia.
- `blocked` y `failed` emiten un `organization_audit_event`.
- El `ImportOutcome` es un nivel **superior** a la taxonomía de `src/ingestion/diagnostics.ts` (que describe el *análisis* del documento), no la reemplaza ni la renombra.

**Deduplicación**: conflicto = `organization + employee + fingerprint`, nunca solo fecha.
**Atomicidad**: `upsertShifts` dentro de `sql.transaction` (R1-M08). No se relaja.
**Futuros**: las fechas futuras se enrutan a `ScheduleVersion` en borrador; el resultado debe
declarar cuántos turnos quedaron confirmados y cuántos en borrador (P7-M03).

---

## 15. EMPLOYEE / USER DOMAIN

- **User** = identidad de acceso. **Employee** = persona del cuadrante. La relación es opcional y explícita.
- Estados de Employee: `active` (puede recibir turnos), `inactive` (no), `pending_access` (existe pero sin User; bloquea la importación hasta completar el alta).
- Vincular un User a un Employee `pending_access` lo activa automáticamente.
- Un OWNER **no** genera un Employee implícitamente (`3ff90b2`). Debe pedirlo.
- Desvincular deja `user_id NULL` sin cambiar el estado.
- `EMPLOYEE_HAS_HISTORY` impide el borrado permanente; se ofrece desactivar.
- `LAST_ADMIN` protege al empleado vinculado al último administrador.

**Contrato de autoservicio (P5-M05, condicionado a D-04)** — estado objetivo:
- Un EMPLOYEE puede importar un fichero para **sus propios** turnos.
- Si el fichero contiene otras personas, esas filas se descartan con recuento explícito y visible.
- Si su identidad no aparece, el resultado es `blocked` / `SELF_IDENTITY_NOT_FOUND`.
- Un EMPLOYEE **nunca** puede crear un Employee desde el flujo de importación.
- El alcance temporal (histórico y futuro) que puede escribir queda fijado por D-04.

---

## 16. SCHEDULING DOMAIN

**Preservado íntegro desde R3.** El nuevo roadmap no cambia su modelo.

- Schedule → ScheduleVersion (`draft` | `published`) → ShiftAssignment.
- Publicar materializa los turnos; una versión publicada queda bloqueada (R3-M11); se crea una nueva versión para cambiar.
- Validación de solapes y regla de descanso base.
- Solo Employees `active` son destino válido (`36e7857`).
- Alcance: OWNER/ADMIN a nivel organización; PLANNER limitado a su `scoped_area_id` (o a la organización si no tiene área — pendiente de D-05).
- Alternativa accesible en tabla, con `aria-label` descriptivo verificado. **Fortaleza a preservar.**
- Cambios previstos en este roadmap: únicamente presentación responsive (P4) y comunicación (P7).

---

## 17. APPROVAL DOMAIN

**Preservado íntegro desde R5.** Este roadmap **no** introduce microtareas en este dominio; solo lo
protege por regresión.

- `ApprovalPolicy` por organización: `NO_APPROVAL` | `ORGANIZATION_ADMIN` | `AREA_RESPONSIBLE`.
- ChangeRequest del empleado → routing → inbox del aprobador → aprobar / rechazar (motivo obligatorio) → aplicación del cambio → auditoría.
- Decisiones concurrentes resueltas de forma idempotente (R5-M08).
- Autorización consolidada (R5-M09, `3d80fce`).
- E2E 4/4 contra Neon development (R5-M10).
- Gap identificado en este análisis: **ninguno**. Cualquier hallazgo nuevo en este dominio debe abrirse como microfase en R5, no aquí.

---

## 18. HISTORY DOMAIN

Estado objetivo (P6):

| Campo | Origen | Visible para |
|---|---|---|
| Estado (`completed`/`partial`/`blocked`/`failed`/`deleted`) | `imports.status` + `deleted_at` | según scope |
| Motivo | `outcome_reason` | según scope |
| Entidad bloqueante | `blocking_employee_id` | según scope |
| Actor | `user_id` del import | quien tenga scope para verlo |
| Alcance | `scope_type` + `area_name_snapshot` | según scope |
| Modo | `import_mode` (individual/team) | según scope |
| Periodo | `period_label` + `period_kind` | según scope |
| Formato de origen | `source_format` | según scope |
| Empleados / turnos | `employee_count`, `shift_count`, `created_shift_count`, `existing_shift_count` | según scope |
| Acción de recuperación | derivada de `outcome_reason` | actor con permiso |

Reglas:
- El nombre de área mostrado es el **snapshot del momento del import**, no el actual.
- Eliminar una importación borra exclusivamente sus shifts por `import_id` y deja la fila como "Eliminada".
- Los turnos manuales nunca se ven afectados.
- EMPLOYEE lee solo dentro de su scope; el borrado es ADMIN+.
- `fullHistory` (plan) se señaliza **antes** de explorar; el recorte real lo aplica el backend.

---

## 19. TEAM / ENTITLEMENT DOMAIN

- Autoridad única: `api/_lib/plans.js`. Espejo de display: `src/lib/plans.ts` (nunca decide).
- Descriptor expuesto (P2-M01) en `GET /api/organizations/current`:
  `entitlement: { planId, features, limits, usage: { activeEmployees } }`.
- Superficies que deben anticipar el gate: alta de usuario (`teamManagement`), import multiempleado
  (`multiEmployeeImport`), creación de empleado sobre `maxEmployees`, histórico (`fullHistory`).
- Patrón obligatorio: **visible + deshabilitado + explicado**, nunca oculto, nunca habilitado-y-luego-denegado.
- Los rechazos `PLAN_LIMIT` se registran como evento de auditoría, sin credenciales en el payload.
- Provisión de organizaciones `team` para QA: por la ruta de onboarding de empresa existente. No se
  introduce ningún endpoint de cambio de plan (restricción de seguridad de P5-M01).

---

## 20. ERROR / RECOVERY MODEL

Toda condición de error o bloqueo se describe con cinco elementos obligatorios:

1. **Qué pasó** — en el vocabulario del usuario, no del sistema.
2. **Qué se persistió y qué no** — en números.
3. **Por qué** — motivo estructurado, no "algo salió mal".
4. **Qué hacer ahora** — una acción nombrada y alcanzable desde donde está.
5. **Persistencia** — el mensaje no desaparece solo si es un error o un bloqueo.

Correspondencia motivo → acción de desbloqueo:

| `outcome_reason` | Acción ofrecida |
|---|---|
| `EMPLOYEE_UNKNOWN` | "Dar de alta y detener importación" → luego "Completar alta" + "Reintentar" |
| `EMPLOYEE_PENDING_ACCESS` | "Completar alta de {empleado}" → "Reintentar" |
| `EMPLOYEE_INACTIVE` | "Reactivar {empleado}" (solo ADMIN+) o "Cancelar" |
| `EMPLOYEE_AMBIGUOUS` | "Elegir identidad" (desambiguación), no "Reintentar" |
| `SELF_IDENTITY_NOT_FOUND` | "Indicar cuál de estas filas eres tú" |
| `PLAN_LIMIT` | "Actualizar a Team" (informativo, sin checkout) |
| `AREA_MISMATCH_DECLINED` | "Importar igualmente" o "Cambiar el área del import" |
| `DOCUMENT_ERROR` | "Ver detalle del formato" → asistente de formato |
| `SYSTEM_ERROR` | "Reintentar" + indicación de que no se escribió nada |

**Prohibiciones**: ningún `window.alert` como canal de resultado de negocio; ningún
`window.confirm` como canal de decisión de negocio; ningún toast como único vehículo de un error;
ningún cierre de modal que borre el resultado sin acción explícita del usuario.

---

## 21. UX STATE MODEL

| Estado | Cuándo | Presentación exigida |
|---|---|---|
| Idle | Sin operación en curso | Estado vacío con acción primaria evidente |
| Loading | Operación en curso | `aria-busy`, botón deshabilitado con etiqueta de progreso, `prefers-reduced-motion` respetado |
| Empty | Sin datos | Copy **veraz** sobre lo que se está mirando (nunca `orgSelector.noResults` fuera del selector de organizaciones) + causa + acción |
| Success | Operación completada | Confirmación explícita con números; `role="status"` |
| Partial | Éxito parcial | Desglose por categoría; persistente |
| Blocked | Bloqueo resoluble | Persistente hasta cierre explícito; motivo + entidad + acción; `role="alert"` |
| Error | Fallo | Persistente; qué se escribió (nada o qué); reintentable o no |
| Disabled-by-plan | Capacidad de pago | Visible, deshabilitada, con motivo asociado por `aria-describedby`; **no** `role="alert"` |
| Disabled-by-role | Sin permiso | Ausente o deshabilitada con motivo; la API devuelve 403 igualmente |
| Destructive confirm | Acción destructiva | `alertdialog`, consecuencia cuantificada, acción nombrada por su efecto, foco inicial en la opción segura, ESC = cancelar |

---

## 22. ACCESSIBILITY REQUIREMENTS

1. Todo control interactivo tiene nombre accesible único y significativo en su contexto. Caso confirmado a corregir: los `<input type="color">` de tipos de turno (`SettingsModal.tsx:696`, `:743`).
2. Todo diálogo cumple `docs/standards/MODAL_CONTRACT.md`: ESC, click-outside, focus trap, foco inicial y de retorno, `role="dialog" aria-modal`. Los destructivos usan `alertdialog` con foco inicial en la acción segura.
3. `ImportResultModal` migra de `div role="dialog"` crudo a `ModalShell` (P1-M05).
4. Ningún estado se comunica solo por color (chips de estado del histórico, badge de borrador).
5. Los contenedores con scroll horizontal son alcanzables por teclado y tienen nombre accesible.
6. Los errores de formulario se asocian por `aria-describedby` y mueven el foco al campo.
7. `prefers-reduced-motion` se respeta (ya cumplido tras R1-M14).
8. Contraste correcto en light y dark (verificado como fortaleza; no debe degradarse).
9. **Método**: un finding de accesibilidad requiere evidencia del árbol de accesibilidad del navegador o inspección de código confirmada. Un candidato de regex no basta — los ~30 falsos positivos de la auditoría no se reabren.

---

## 23. RESPONSIVE REQUIREMENTS

1. Viewports obligatorios: 1440 (desktop), 834 (tablet), 390×844 (mobile portrait), 844×390 (mobile landscape).
2. El `body` **nunca** hace scroll horizontal. El contenido ancho (tablas, cuadrículas, barras de métricas, bloques de código) vive en un contenedor `overflow-x:auto` propio.
3. Todo contenedor con scroll tiene affordance visual (sombra o gradiente de borde), no solo el recorte natural del layout.
4. Ningún panel flotante o inline oculta contenido operativo (caso confirmado: "Añadir turno" sobre la tabla del planificador a 390px).
5. En el landing por debajo de ~480px, el titular y el CTA principal aparecen por encima del pliegue; la navegación secundaria colapsa con `aria-expanded`.
6. Los diálogos son usables a 390px sin recorte de sus acciones.
7. Sticky headers y primeras columnas, donde existan, se conservan al introducir contenedores de scroll.

---

## 24. I18N REQUIREMENTS

1. Fuente única: `src/lib/i18n.ts`; paridad ES/EN garantizada por `i18n-coverage.test.ts`.
2. Ninguna clave se reutiliza fuera de su dominio semántico. Caso confirmado: `orgSelector.noResults` en `MembersModal.tsx:1100,:1365,:1465`.
3. Glosario de UI unificado (P7-M01): un único término por concepto en cada idioma, con declaración explícita de lo que **no** significa ("importado ≠ publicado").
4. Toda clave nueva se añade simultáneamente en ES y EN en el mismo commit.
5. Las etiquetas históricas (p. ej. `period_label` del histórico) **no** se retraducen a posteriori: se renderizan en el idioma activo en el momento del import y se conservan como snapshot.
6. `LOCALIZATION_CONTRACT.md` sigue siendo el contrato aplicable.
7. Nota de herramienta: `i18n-integrity-check` espera un directorio `locales/`; su `PASS_WITH_GAPS` es una limitación del escáner, no del producto, y no genera trabajo.

---

## 25. OBSERVABILITY

- **Eventos de auditoría de organización** (`organization_audit_events`, migración `0016`): se amplían con `IMPORT_BLOCKED`, `IMPORT_FAILED` (P1-M04) y `PLAN_LIMIT_REJECTED` (P2-M04).
- El actor de un evento es siempre el de la sesión, jamás un actor enviado por el cliente.
- Ningún evento registra credenciales, contraseñas iniciales ni contenido de ficheros importados.
- **El histórico de importaciones es la superficie de observabilidad del dominio Import** para el usuario final; los eventos de auditoría lo son para el administrador.
- Evidencia de Gate archivada por fase: reportes de Playwright, logs de test, capturas, tablas de matriz de permisos.
- No se introduce telemetría de producto ni analítica de terceros en este programa.

---

## 26. SECURITY

Requisitos que ninguna fase puede degradar:

1. Autorización y entitlement se resuelven **siempre** en backend. La UI anticipa, nunca decide.
2. El cliente no puede ensanchar su scope ni cambiar su plan.
3. Un intento de acceso a otra organización devuelve 403 sin filtrar existencia.
4. Passwords con scrypt y `timingSafeEqual`; login con mensaje genérico (sin enumeración de usuarios).
5. Rate limit de login vigente (limitación de no-distribución documentada).
6. La importación nunca escribe sobre una identidad no verificada.
7. `POST /api/imports` valida el `ImportOutcome` y rechaza un `completed` sin turnos creados.
8. Ningún dato sensible en `outcome_detail` ni en eventos de auditoría.
9. Ninguna operación de este programa se ejecuta contra Neon **producción**. Antes de cualquier diagnóstico contra base de datos, comparar el host con `.env.development.local` (`docs/db-environments.md`, incidente real 2026-09-03).
10. Prohibido: `git push`, deploy, promoción de ramas, migraciones en producción, `sudo`, Docker privilegiado, `kill`/`pkill`, bypass de sandbox — sin autorización humana explícita y específica.
11. El VLM solo acepta headers de fake (`x-vlm-fake-*`) cuando `VLM_PROVIDER=fake`; con proveedor real se ignoran.

---

## 27. TENANT ISOLATION

- `organization_id NOT NULL` en las 6 tablas de negocio, verificado en R2-M00.
- Todo acceso a datos pasa por `api/_lib/data.js` con contexto de sesión; prohibido confiar en ids de organización/empleado enviados por el cliente sin validar pertenencia.
- `assertAreaInOrg`, `assertEmployeeInScope`, `assertScopedResource` en todo recurso direccionado por id.
- Verificación obligatoria en los Gates de P0, P1, P5 y P6, con **dos** organizaciones de datos homólogos.
- El aislamiento se re-verifica con los **cuatro** roles en P5, no solo con OWNER.
- Las filas nuevas de `imports` con estado `blocked`/`failed` están sujetas al mismo aislamiento.

---

## 28. MIGRATION STRATEGY

- Una sola migración nueva en todo el programa: `0033_import_outcome.sql` (P1-M02).
- Forward-only, aditiva, idempotente (`ADD COLUMN IF NOT EXISTS`), `CHECK` ampliado nunca estrechado.
- Aplicación: `node --env-file=.env.development.local db/migrate.mjs`, siempre contra **development**.
- Validación obligatoria: aplicación incremental sobre la base existente **y** aplicación desde cero en un schema efímero, con eliminación del schema al terminar (mismo patrón usado en R5-M11).
- `db/migrations.test.mjs` cubre la nueva migración.
- Ninguna otra fase introduce migraciones. Si una fase descubre que las necesita, debe detenerse y elevar una decisión de producto.

---

## 29. BACKWARD COMPATIBILITY

- Las filas existentes de `imports` conservan `completed`; ninguna se reinterpreta.
- `GET /api/imports` sigue devolviendo los campos actuales; los nuevos son aditivos.
- `POST /api/imports` sigue aceptando el payload actual; `outcome` es opcional y por defecto se comporta como hoy (`completed`), salvo la nueva validación de coherencia (400 si `completed` con 0 turnos).
- El modo invitado local-first permanece intacto: sin sesión, todo en `localStorage`.
- Las rutas conocidas de `src/lib/route.ts` no cambian; el fallback a `/app` para deep links legacy se conserva.
- `orgSelector.noResults` sigue existiendo y sigue usándose en `OrgSelectorModal`; solo se retiran sus usos indebidos.
- Rollback: cada fase se revierte por commit; para P1 el rollback exige revertir código **y** mapear estados nuevos a `completed` en la vista, nunca borrar filas.

---

## 30. ROADMAP

Ocho fases ejecutables más una bloqueada. Detalle completo en el documento de roadmap.

| Fase | Nombre | Prioridad del encargo cubierta |
|---|---|---|
| P0 | Baseline Truth & MVP Release Gate | (8) roles reales; (K) documentación/verdad de agente |
| P1 | Trusted Import Completion | (1) confianza en el journey núcleo; (3) feedback persistente; (4) recuperación; (A) |
| P2 | Plan Entitlement UX | (5) gating de plan correcto; (B) |
| P3 | Dialog Replacement & Copy Correctness | (2) coherencia frontend↔dominio; (A) |
| P4 | Accessibility & Responsive Hardening | (6) accesibilidad; (7) responsive; (H); (I) |
| P5 | Role Reality & Employee Self-Service | (8) roles reales; (9) autoservicio; (10) multiempleado; (C); (D); (E) |
| P6 | Import History & Operational Traceability | (11) histórico; (F) |
| P7 | Import vs Schedule Communication | (12) scheduling/approval — comunicación; (J) |
| P8 | CRC Tryp Research | (13) mejoras CRC Tryp — **BLOCKED** |

Área (G) "Scheduling/Approval": se **preserva** lo validado en R5 y no se abren microtareas nuevas;
solo se protege por regresión (§34). Área (14) "diferenciación Premium/Team": cubierta parcialmente
por P2 y P6-M05; la diferenciación de producto más allá de la señalización requiere la decisión
D-06 y, en su caso, la investigación bloqueada de P8.

---

## 31. PHASES

Definición completa de cada fase (`PHASE_ID`, `GOAL`, `WHY_NOW`, `USER_VALUE`, `BUSINESS_VALUE`,
`SOURCE_DRIVERS`, `SCOPE`, `OUT_OF_SCOPE`, `DEPENDENCIES`, `PREREQUISITES`, `RISKS`,
`DO_NOT_BREAK`, `AFFECTED_*`, `MIGRATION_IMPACT`, `ROLLBACK_STRATEGY`, `OBSERVABILITY`,
`DOCUMENTATION_UPDATES`) en
[`ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md`](../roadmap/ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md),
secciones `PHASE P0` a `PHASE P8`. **Esa remisión es normativa**: no se mantiene una copia en este
documento para evitar dos autoridades divergentes.

---

## 32. MICROTASKS

58 microtareas, todas con `ID`, `TITLE`, `PURPOSE`, `SOURCE`, `PRECONDITIONS`,
`FILES_LIKELY_AFFECTED`, impactos (`DATA_MODEL` / `API` / `UI` / `I18N` / `ACCESSIBILITY` /
`SECURITY`), `TESTS_REQUIRED`, `E2E_REQUIRED`, `MANUAL_QA_REQUIRED`, `ACCEPTANCE_CRITERIA` en
Given/When/Then, `DO_NOT_BREAK`, `DEPENDENCIES`, `RISK` y `ESTIMATED_COMPLEXITY`, en el documento
de roadmap, sección `MICROTASKS` de cada fase.

Distribución: P0 = 10, P1 = 10, P2 = 5, P3 = 9, P4 = 7, P5 = 6, P6 = 6, P7 = 5, P8 = 0 (bloqueada).

Orden general aplicado, con las desviaciones justificadas en cada fase:

```
DOMAIN CONTRACT → DATA MODEL → MIGRATION → AUTHORIZATION → API
→ APPLICATION SERVICE → UI → FEEDBACK → I18N → ACCESSIBILITY
→ TESTS → E2E → DOCS → GATE
```

---

## 33. PHASE GATES

Cada fase termina en un Gate formal `PHASE_X_GATE` con su tabla de criterios y su bloque
`EVIDENCE_REQUIRED`, en el documento de roadmap.

**Criterios obligatorios en todos los Gates**: `FUNCTIONAL`, `DATA_INTEGRITY`, `AUTHORIZATION`,
`TENANT_ISOLATION`, `SECURITY`, `REGRESSION`, `ACCESSIBILITY`, `RESPONSIVE`, `I18N`,
`UNIT_TESTS`, `INTEGRATION_TESTS`, `E2E`, `BUILD`, `LINT`, `TYPECHECK`, `DOCUMENTATION`,
`AOS_COMPLIANCE`, `WORKTREE_STATE`. Cuando un criterio no aplica a una fase, debe declararse
`N/A` **con su justificación y su verificación por ausencia** (p. ej. `git diff --stat` sin cambios
en `api/` ni `db/`), nunca omitirse.

**Criterios condicionales**: `MIGRATION_VALIDATION`, `REAL_NEON_VALIDATION`, `CONCURRENCY`,
`IDEMPOTENCY`, `DUPLICATE_HANDLING`, `ERROR_RECOVERY`, `ROLLBACK`, `PLAN_ENTITLEMENT`,
`ROLE_MATRIX`, `BROWSER_QA`, según la tabla de cada fase.

**Resultados permitidos y su semántica**

| Resultado | Definición |
|---|---|
| `PASS` | Todos los criterios obligatorios satisfechos con evidencia. |
| `PASS_WITH_GAPS` | Funcionalidad segura y usable; queda un gap explícito, acotado, no bloqueante, documentado con su motivo y su fase de absorción. |
| `FAIL` | Alguna condición obligatoria falla. No se avanza. |
| `BLOCKED` | No evaluable por dependencia externa o decisión de producto pendiente. |

**Reglas duras**
- Una fase **no** puede declararse `PASS` porque `npm test` y `npm run build` estén en verde. El Gate verifica comportamiento real observado.
- `PASS_WITH_GAPS` exige nombrar la fase que absorbe el gap.
- `EVIDENCE_REQUIRED` no admite "verificado manualmente" sin describir qué se verificó, con qué datos y con qué resultado.
- Ninguna fase `Pn` se inicia sin el Gate de `Pn-1` en `PASS` o `PASS_WITH_GAPS`, salvo las independencias declaradas en §3 del roadmap.

---

## 34. CROSS-PHASE REGRESSION MATRIX

| CAPABILITY | CURRENTLY_WORKING | PHASES_TOUCHING_IT | REGRESSION_RISK | MANDATORY_TEST | DO_NOT_BREAK |
|---|---|---|---|---|---|
| Registro con email+contraseña | SÍ (browser) | P0 | BAJO | `auth-flow.spec.ts` | Estado de carga visible; sin verificación de email como bloqueo |
| Onboarding orientado al formato | SÍ (browser) | P4 | BAJO | `OnboardingChoiceModal.test.tsx` | La pregunta "¿Cómo recibes tu cuadrante?" y la promesa de <2 min |
| Separación OWNER ↔ Employee | SÍ (`3ff90b2`) | P4, P5 | **ALTO** | `onboarding.test.js` | El Employee nunca se crea implícitamente del nombre del owner |
| Asistente de formato ("¿Cuál de estas filas eres tú?") | SÍ (browser) | P1, P5 | MEDIO | `ProfileAssistantPanel.test.tsx`, `tabular.spec.ts` | Botón continuar deshabilitado hasta elegir |
| Previsualización editable antes de escribir | SÍ | P1, P3, P7 | **ALTO** | `ImportModal.test.tsx`, `import-integrity.spec.ts` | Nunca escribir antes de confirmar; poder editar y borrar filas |
| Idempotencia de importación | SÍ | P1, P6 | **ALTO** | `data.test.js`, `format-memory.spec.ts` | `(org, employee, fingerprint, contexto)`; `blocked` no consume clave |
| Atomicidad de `upsertShifts` | SÍ (R1-M08) | P1, P5 | **ALTO** | `data.test.js` | `sql.transaction` envolvente |
| Desglose de 5 categorías en Compare | SÍ (R1-M05) | P3, P7 | MEDIO | `TeamImportModal.test.tsx` | nuevos/conflictos/duplicados/ignorados/errores |
| Soft-delete de import + hard-delete de sus shifts | SÍ | P3, P6 | **ALTO** | `data.test.js`, `ImportHistoryModal.test.tsx` | Turnos manuales (`import_id IS NULL`) intactos |
| Tabla accesible del planificador | SÍ (browser, árbol a11y) | P4 | MEDIO | `WeeklyPlanner.test.tsx`, responsive suite | `aria-label` descriptivo; alternancia con cuadrícula |
| Feedback al crear borrador semanal | SÍ (browser) | P7 | BAJO | `scheduling-draft.spec.ts` | "Borrador semanal creado." + chip + contador |
| Bloqueo de versión publicada | SÍ (R3-M11) | P3, P7 | **ALTO** | `publish.test.js`, `version.test.js` | Una versión publicada es inmutable |
| Elegibilidad de Employee activo | SÍ (`36e7857`) | P5 | **ALTO** | `scheduling-authz.spec.ts`, `scheduling-draft.spec.ts` | Solo `active` recibe asignaciones/importaciones |
| Autorización por rol y scope | SÍ (R2-M08) | P1, P2, P5, P6 | **ALTO** | `scope.test.js`, `authorization.test.js`, `role-matrix.spec.ts` | `resolveAccessScope` puro; sin ensanchamiento por cliente |
| Aislamiento multi-tenant | SÍ (R2-M11) | P0, P1, P5, P6 | **ALTO** | `cross-tenant-isolation.spec.ts` | 403 sin filtrar existencia |
| Enforcement de plan server-side | SÍ | P2, P6 | **ALTO** | `plans.test.js`, `plan-entitlement.spec.ts` | 403 `PLAN_LIMIT` aunque la UI cambie |
| Ortogonalidad Plan ↔ Role | SÍ | P2 | MEDIO | grep documentado | `plans.js` no importa `auth.js`/`data.js` |
| Approvals (routing, decisión, concurrencia, auditoría) | SÍ (R5) | ninguna | BAJO (solo regresión) | `approval-lite.spec.ts`, `approval.test.js` | **Dominio congelado en este programa** |
| Portal de empleado (Hoy/Semana/Solicitudes/Más) | SÍ (R4) | P5 | MEDIO | `employee-portal.spec.ts` | EMPLOYEE solo ve lo suyo publicado |
| Redirección de EMPLOYEE fuera de `/app/schedule` | SÍ (`867858d`) | P5 | MEDIO | `scheduling-authz.spec.ts` | Redirige al portal |
| Estado "Cuenta no vinculada" | SÍ | P5 | MEDIO | `scope.test.js` | EMPLOYEE sin Employee ⇒ sin datos |
| Modo invitado local-first | SÍ | P3 (LegalPage) | MEDIO | manual + `LandingPage.test.tsx` | Sin sesión, todo en `localStorage`; reset solo local |
| Tema claro y oscuro | SÍ (browser) | P1, P3, P4, P7 | MEDIO | QA visual + capturas de Gate | Contraste correcto en ambas superficies |
| `prefers-reduced-motion` | SÍ (R1-M14) | P1, P3, P4 | BAJO | `ImportModal.test.tsx` | Spinner y transiciones respetan la preferencia |
| Contrato de modales (`ModalShell`) | SÍ | P1, P3 | MEDIO | tests de cada modal | ESC, focus trap, foco inicial/retorno |
| Cobertura i18n ES/EN | SÍ | P1, P2, P3, P4, P6, P7 | MEDIO | `i18n-coverage.test.ts` | Paridad en el mismo commit |
| Router y deep links legacy | SÍ | P4 (landing) | BAJO | `route` tests | Fallback a `/app` para rutas desconocidas |
| OAuth Google/GitHub | Implementado, no verificado E2E | ninguna | BAJO | pendiente (Gate final) | Endpoints reales, no placeholders |
| Recuperación de contraseña | Implementado, no verificado E2E | ninguna | BAJO | pendiente (Gate final) | — |
| Ingesta multi-formato (6 formatos) | Implementado, 1 verificado en browser | P1, P7 | MEDIO | corpus GS/GN + `positive-pdf.spec.ts`, `ocr.spec.ts`, `tabular.spec.ts` | El fallback VLM nunca sustituye un resultado determinista usable |

---

## 35. TEST STRATEGY

- **Unitarios** (Vitest, `src/` + `api/`): toda función pura nueva (contrato `ImportOutcome`, derivación de entitlement, mapeo motivo→acción) con casos límite explícitos.
- **Integración de data-access** (`api/_lib/*.test.js` con sql fake): toda ruta de `data.js` tocada, incluyendo los caminos de denegación (403, `SCOPE_UNAVAILABLE`, `PLAN_LIMIT`, `LAST_ADMIN`, `EMPLOYEE_HAS_HISTORY`).
- **Componentes** (Testing Library): todo modal migrado verifica ausencia de diálogos nativos, foco inicial, ESC y ejecución exactamente una vez.
- **Migraciones** (`db/migrations.test.mjs`): aplicación incremental, desde cero e idempotencia.
- **Contratos**: un test que falle si la matriz de roles publicada y la salida de `role-matrix.spec.ts` divergen.
- **Regla**: ninguna corrección se da por buena sin un test que **falle antes** del cambio. Las fixtures son siempre sintéticas; nunca cuadrantes reales.

---

## 36. E2E STRATEGY

- Base: `qa/e2e-acceptance/playwright.local.config.ts` contra `vercel dev` + Neon **development**, con seed/teardown automáticos.
- Specs nuevas previstas: `import-recovery.spec.ts` (P1), `plan-entitlement.spec.ts` (P2), `role-matrix.spec.ts` (P5), ampliación de `specs-responsive/` (P4), ampliación del histórico (P6), recorrido import→borrador→publicación (P7).
- **Guardia obligatoria**: en todo spec de journey de negocio, un handler `page.on('dialog')` que haga **fallar** el test si aparece un diálogo nativo.
- Los 16 pasos del flujo completo se ejecutan en P0 y se re-ejecutan como smoke en el Gate final.
- Determinismo: se prefiere una matriz compacta y determinista a una exhaustiva y lenta, siguiendo el criterio ya adoptado en R3-M16 (evitar que el Gate mida la latencia del harness en vez del producto).
- Prohibido ejecutar E2E contra producción.

---

## 37. MANUAL QA STRATEGY

Obligatorio cuando la evidencia automatizada no puede sustituir la observación:

1. **Árbol de accesibilidad del navegador** para cada control cuya corrección de nombre se reclame (P4-M01) y para cada modal migrado.
2. **Capturas comparativas antes/después** en 1440, 834, 390 portrait y 844×390 landscape, en tema claro y oscuro, ES y EN, para toda fase con `BROWSER_QA`.
3. **Recorrido por rol** en P5: una sesión real por cada uno de los cuatro roles, con anotación de cada capacidad presente/ausente y su código HTTP al llamar directamente.
4. **Reproducción previa obligatoria** para findings de confianza baja: F9 no se implementa sin reproducir primero el fallo; si no se reproduce, se cierra como `NOT_REPRODUCIBLE` con evidencia.
5. **Formato del registro**: qué se hizo, con qué datos, qué se observó, qué se esperaba. "Verificado manualmente" sin estos cuatro elementos no es evidencia y hace fallar el Gate.

---

## 38. ROLLBACK STRATEGY

| Nivel | Mecanismo |
|---|---|
| Microtarea | Un commit por microtarea; `git revert` individual. Staging explícito, nunca `git add .`. |
| Fase | Revertir la serie de commits de la fase en orden inverso; re-ejecutar el Gate de la fase anterior. |
| Migración `0033` | Aditiva y forward-only. **No se revierte la migración.** Se revierte el código y se mapean los estados nuevos a `completed` en la capa de presentación. Ninguna fila se borra. |
| Datos | Ninguna fase de este programa realiza mutaciones correctivas de datos. Si una se hiciera necesaria, requiere aprobación humana explícita y previa, con el patrón acotado e idempotente ya usado en R2-M02. |
| Ramas | Trabajo en `development`. Sin `git push`, sin promoción a `staging`/`production`/`main` sin aprobación humana. |

---

## 39. DOCUMENTATION PLAN

| Documento | Acción | Fase |
|---|---|---|
| `AGENTS.md` | Roles reales; UI de tipos de turno; inventario de `api/`; regla "un intento de importación nunca desaparece" | P0-M01, P0-M02, P1-M10 |
| `docs/fase1-multitenant.md` | Matriz de 4 roles × 3 scopes; whitelist real; luego, matriz **verificada** | P0-M03, P5-M06 |
| `README.md` / `README.en.md` | Alcance implementado real (R3/R4/R5) | P0-M04 |
| `docs/roadmap/shiftimport-mvp-v2/PROGRESS-STATUS.md` | Snapshot veraz + enlace a este programa | P0-M05 |
| `docs/pricing-hypothesis.md` | Roles reales (§1); UX de bloqueo (§2) | P0-M06, P2 |
| `docs/roadmap/shiftimport-mvp-v2/R5/R5-M12-mvp-release-gate.md` | Línea `STATUS` con el veredicto | P0-M10 |
| `docs/roadmap/shiftimport-mvp-v2/R1/R1-M09-import-history.md` | Cerrar el hallazgo abierto | P1-M10 |
| `docs/product/IMPORT_OUTCOME_CONTRACT.md` | **Nuevo** | P1-M01 |
| `docs/product/EMPLOYEE_SELF_SERVICE_CONTRACT.md` | **Nuevo** | P5-M05 |
| `docs/standards/MODAL_CONTRACT.md` | Nota de confirmación destructiva | P3 |
| `docs/roadmap/shiftimport-mvp-v2/R0/DOMAIN-GLOSSARY.md` | Anexo de glosario de UI | P7-M01 |
| `docs/manual/manual-usuario.md` | Histórico y comunicación de futuros | P6, P7 |
| `.anclora/AOS_ADOPTION.md` | `Last Reviewed` actualizado; `EX-SI-001` intacta | P0 |

---

## 40. AOS COMPLIANCE

- Adopción declarada: AOS 0.2.0, Governance Level 3 (autoridad local de producto), `.anclora/AOS_ADOPTION.md`.
- Fuentes AOS de referencia: `anclora-governance/` (constitution, MASTER_DECISIONS, CURRENT_STATE, SOURCE_OF_TRUTH_REGISTRY, standards, playbooks) y `anclora-vault/00-governance/`.
- Decisiones de producto (PD) se registran en `sdd/`; ED → `MASTER_DECISIONS`; OD → mecanismo CHG de la vault; EX → la propia declaración de adopción. **Una decisión, una fuente canónica.**
- Las decisiones abiertas de §41 son **PD**: se registran en `sdd/` cuando se resuelvan, no en este documento.
- Excepción vigente `EX-SI-001` (default branch `development`): `ACCEPTED`, se conserva sin modificación.
- **Deuda AOS identificada**: `Last Reviewed: 2026-08-18` pese a haberse cerrado R1–R5 desde entonces; la política exige revisión al inicio de cada fase de producto. Se salda en P0.
- Los contratos de `docs/standards/` son copia local; el canónico vive en la vault y no se modifica desde este repositorio.
- Regla de un solo escritor: `src/App.tsx`, `MembersModal.tsx` y `SettingsModal.tsx` son puntos de contención entre P1/P2/P3/P4; su escritura se serializa.

---

## 41. OPEN DECISIONS

### PRODUCT_DECISIONS_REQUIRED

---
**DECISION_ID**: D-01
**QUESTION**: ¿Cuál es el posicionamiento canónico de ShiftImport: B2C/prosumer Premium o B2B/B2B2E?
**CURRENT_BEHAVIOR**: `AGENTS.md` dice "Producto Premium B2C"; `README.md` dice "Plataforma B2B/B2B2E"; `.anclora/AOS_ADOPTION.md` dice "Premium B2C/prosumer". Los tres son documentos vigentes.
**OPTIONS**
- **A**: B2B/B2B2E canónico, con plan `personal` como puerta de entrada individual.
- **B**: B2C/prosumer canónico, con `team` como extensión.
- **C**: Dual explícito, con dos narrativas de producto declaradas y separadas.
**RECOMMENDATION**: **A**.
**RATIONALE**: el modelo de datos (Organization/Membership/Area/Employee/Approval), la matriz de roles de 4 niveles y todo R2–R5 están construidos para organizaciones. `personal` es un caso degenerado de ese modelo, no al revés.
**IMPACT**: copy del landing, `/pricing`, README, AOS, y la priorización de P2/P5.
**BLOCKS_PHASES**: influye en P0-M04 y P7-M04; no los bloquea.
**DEFAULT_IF_NOT_DECIDED**: A (se documenta como decisión provisional y se marca para revisión).

---
**DECISION_ID**: D-02
**QUESTION**: Un intento de importación bloqueado, ¿debe registrarse en el histórico visible del usuario, o solo en auditoría interna?
**CURRENT_BEHAVIOR**: no se registra en ninguna parte (`data.js:1486`).
**OPTIONS**
- **A**: registrar en el histórico visible con estado propio y acción de recuperación.
- **B**: registrar solo en `organization_audit_events`, dejando el histórico limpio de "no éxitos".
- **C**: registrar en el histórico pero oculto tras un filtro "mostrar intentos no completados".
**RECOMMENDATION**: **A**.
**RATIONALE**: la auditoría midió exactamente la confusión que produce un histórico vacío tras un intento real. Ocultar el intento reproduce el problema. C es un compromiso que añade una interacción para ver lo que el usuario ya está buscando.
**IMPACT**: define el alcance de P1-M02/M03 y de todo P6.
**BLOCKS_PHASES**: **P1 y P6**.
**DEFAULT_IF_NOT_DECIDED**: A.

---
**DECISION_ID**: D-03
**QUESTION**: ¿Puede un EMPLOYEE importar sus propios turnos?
**CURRENT_BEHAVIOR**: técnicamente **sí** — `createImport` y `upsertShifts` aceptan scope `SELF` forzando el `employeeId` propio (`api/_lib/data.js:1500-1513`, `:1686-1700`). Ningún documento de producto lo declara y ninguna UI lo promueve.
**OPTIONS**
- **A**: sí, es una capacidad de producto declarada (autoservicio).
- **B**: no; se cierra explícitamente en backend y la capacidad queda reservada a ADMIN+.
- **C**: sí, pero gobernado por una política de organización (`allowEmployeeSelfImport`).
**RECOMMENDATION**: **A** para el MVP, **C** como evolución.
**RATIONALE**: la capacidad ya existe y es coherente con el scope `SELF`; cerrarla sería una regresión funcional no solicitada. Una política por organización es la forma correcta de darle control al administrador, pero introduce modelo de datos nuevo y no es urgente.
**IMPACT**: define el alcance de P5-M05 y la fila correspondiente de la matriz de roles.
**BLOCKS_PHASES**: **P5**.
**DEFAULT_IF_NOT_DECIDED**: A, con el comportamiento actual documentado tal cual y sin ampliarlo.

---
**DECISION_ID**: D-04
**QUESTION**: Si un EMPLOYEE importa un fichero que contiene a otras personas, ¿qué ocurre exactamente — y qué alcance temporal puede escribir?
**CURRENT_BEHAVIOR**: indefinido. `assertScopedResource` impediría escribir filas ajenas, pero no está especificado si se descartan en silencio, si se avisa, ni qué ocurre si su identidad no aparece. Tampoco está declarado si puede escribir sobre fechas pasadas o futuras.
**OPTIONS**
- **A**: descartar filas ajenas con recuento explícito y visible; identidad ausente ⇒ `blocked` con desambiguación; puede escribir pasado y presente; los futuros van a borrador y **no** puede publicarlos.
- **B**: rechazar el fichero completo si contiene a otras personas (fail-closed estricto).
- **C**: descartar en silencio (comportamiento más simple, peor para la confianza).
**RECOMMENDATION**: **A**.
**RATIONALE**: B castiga un caso frecuentísimo (el cuadrante de la empresa incluye a todo el mundo); C viola el principio "la importación nunca falla en silencio". A preserva el aislamiento y la comprensión simultáneamente. La restricción de publicación mantiene intacta la matriz de roles.
**IMPACT**: define P5-M05 completo, el motivo `SELF_IDENTITY_NOT_FOUND` y una fila de la matriz.
**BLOCKS_PHASES**: **P5** (y por dependencia, el Gate de P6).
**DEFAULT_IF_NOT_DECIDED**: **ninguno — esta decisión no admite default.** Sin decidirla, P5 se declara `BLOCKED`. Es la única decisión del programa con implicación directa de aislamiento de datos.

---
**DECISION_ID**: D-05
**QUESTION**: Un PLANNER sin `scoped_area_id`, ¿debe operar a nivel organización (comportamiento actual) o quedar bloqueado?
**CURRENT_BEHAVIOR**: `resolveAccessScope` devuelve `{ type: 'ORGANIZATION' }` para un PLANNER sin área asignada.
**OPTIONS**
- **A**: mantener el comportamiento actual y **documentarlo** como intencionado ("PLANNER global").
- **B**: exigir siempre un área; un PLANNER sin área queda bloqueado como el EMPLOYEE sin Employee (`SCOPE_UNAVAILABLE`).
- **C**: mantenerlo pero exigir confirmación explícita al asignar el rol sin área.
**RECOMMENDATION**: **A** con documentación, o **C** si se considera un riesgo operativo.
**RATIONALE**: el comportamiento es coherente con la jerarquía (PLANNER < ADMIN) y no rompe aislamiento — sigue confinado a su organización. Pero es una elevación de alcance silenciosa que ningún documento declara, y un administrador podría no esperarla.
**IMPACT**: P5-M03 y la matriz de roles.
**BLOCKS_PHASES**: **P5** (parcialmente: P5-M03 no puede cerrarse sin esta decisión).
**DEFAULT_IF_NOT_DECIDED**: A — no cambiar comportamiento, documentarlo como está y marcarlo para revisión.

---
**DECISION_ID**: D-06
**QUESTION**: ¿Debe seguir el onboarding de empresa concediendo plan `team` incondicionalmente, sin paso de pago?
**CURRENT_BEHAVIOR**: sí — `api/onboarding/company.js` persiste `team` de forma incondicional; `pricing-hypothesis.md` §2 lo llama explícitamente "grant pre-billing".
**OPTIONS**
- **A**: mantenerlo mientras no exista billing (statu quo).
- **B**: conceder un trial `team` con caducidad explícita y degradación a `personal`.
- **C**: exigir aprobación manual para conceder `team`.
**RECOMMENDATION**: **A** hasta que exista billing, con la condición de que P5-M01 use exactamente esta ruta y **no** introduzca ningún endpoint de cambio de plan.
**RATIONALE**: introducir caducidad sin billing añade complejidad de estado (¿qué pasa con los empleados por encima del límite al degradar?) sin resolver ningún problema actual.
**IMPACT**: provisión de la organización de QA (P5-M01); diferenciación Premium/Team.
**BLOCKS_PHASES**: no bloquea; condiciona P5-M01.
**DEFAULT_IF_NOT_DECIDED**: A.

---
**DECISION_ID**: D-07
**QUESTION**: ¿Se autoriza el acceso al cuaderno NotebookLM de CRC Tryp, y por qué vía?
**CURRENT_BEHAVIOR**: inaccesible (302 → `accounts.google.com/ServiceLogin`). Ningún contenido leído.
**OPTIONS**
- **A**: el propietario exporta el cuaderno (Markdown/PDF) y lo deposita en el repo o en la vault.
- **B**: ejecutar la extracción desde una sesión autenticada del propietario con el skill `notebooklm`.
- **C**: aportar las fuentes originales del cuaderno directamente.
- **D**: renunciar a la fuente y cerrar P8 como `CANCELLED`.
**RECOMMENDATION**: **A** o **C** — dejan un artefacto citable y auditable en el ecosistema, no una sesión efímera.
**RATIONALE**: sin fuente citable, cualquier patrón "derivado de CRC Tryp" sería indistinguible de una invención, lo que contamina el roadmap.
**IMPACT**: desbloquea P8 y el área candidata (L)/(14) del encargo.
**BLOCKS_PHASES**: **P8** exclusivamente.
**DEFAULT_IF_NOT_DECIDED**: P8 permanece `BLOCKED` indefinidamente. No se inventa contenido.

---

## 42. KNOWN GAPS

| # | Gap | Origen | Severidad | Absorbe |
|---|---|---|---|---|
| G-01 | ADMIN, PLANNER y EMPLOYEE nunca verificados en navegador real | Auditoría §12 `PLAN_BLOCKED` | ALTA | P5 |
| G-02 | Solo CSV verificado en navegador; PDF/XLSX/JSON/XML/imagen solo por código y fixtures | Auditoría §12 | MEDIA | Gate final (§43) |
| G-03 | Import de equipo nunca ejecutado end-to-end en navegador | Auditoría §12 | MEDIA | P5 |
| G-04 | Modo invitado explorado de forma incidental, no exhaustiva | Auditoría §12 | BAJA | Gate final |
| G-05 | Login social Google/GitHub no ejercitado (endpoints reales confirmados) | Auditoría §12 | BAJA | Gate final |
| G-06 | Recuperación de contraseña no ejercitada | Auditoría §12 | BAJA | Gate final |
| G-07 | Contenido de CRC Tryp inaccesible | `NOTEBOOKLM_BLOCKED` | MEDIA (producto) | P8 (bloqueada) |
| G-08 | `anclora-design-system` no integrado; tokens locales en `src/index.css` | `design-system-consumer-check` | BAJA | Fuera de alcance |
| G-09 | Rate limit de login no distribuido (por instancia serverless) | `docs/fase1-multitenant.md` | MEDIA (seguridad) | Fuera de alcance; documentado |
| G-10 | Sin verificación de email en el registro | Observado | MEDIA | Fuera de alcance; decisión de producto futura |
| G-11 | Sin infraestructura de correo (contraseñas iniciales fuera de banda) | `docs/fase1-multitenant.md` | MEDIA | Fuera de alcance |
| G-12 | `src/App.tsx` con 1813 líneas — contención y riesgo de regresión | Análisis de repo | MEDIA (mantenibilidad) | Se mitiga por serialización de escritura; refactor fuera de alcance |
| G-13 | Revisión de adopción AOS pendiente desde 2026-08-18 pese a cerrar R1–R5 | `.anclora/AOS_ADOPTION.md` | BAJA | P0 |
| G-14 | Backend legacy (`server.mjs`, `server-export.mjs`, `proxy-server.mjs`) en saneamiento, consumidores desconocidos | `AGENTS.md` | BAJA | Fuera de alcance |
| G-15 | `i18n-integrity-check` no soporta i18n centralizado en un módulo TS | Auditoría §11 | NULA (herramienta) | No genera trabajo |
| G-16 | Posicionamiento B2C vs B2B contradictorio entre documentos vigentes | Análisis de repo | MEDIA | D-01 |

---

## 43. FINAL ACCEPTANCE GATE

### FINAL_PRODUCT_GATE

Se ejecuta **una sola vez**, tras el cierre de P7. Absorbe además los gaps G-02, G-04, G-05 y G-06.
Solo puede ejecutarse si P0–P7 están en `PASS` o `PASS_WITH_GAPS`, con cada gap nombrado y asignado.

| # | Pregunta | Criterio de aprobación | Evidencia exigida |
|---|---|---|---|
| 1 | ¿Puede un OWNER configurar ShiftImport y empezar a trabajar sin ambigüedad? | Registro → onboarding → organización → primer import con resultado explícito, sin diálogos nativos y sin dudas sobre qué ocurrió | Grabación/capturas del recorrido completo, ES y EN |
| 2 | ¿Puede un ADMIN gestionar usuarios y empleados sabiendo de antemano qué permite su plan? | Toda capacidad bloqueada por plan es visible, deshabilitada y explicada antes de invertir esfuerzo | Capturas en `personal` y en `team`; respuesta de `/api/organizations/current`; 403 `PLAN_LIMIT` |
| 3 | ¿Puede un EMPLOYEE importar exclusivamente sus propios turnos de forma segura? | Filas ajenas descartadas con recuento visible; 0 shifts escritos con `employee_id` ajeno | Conteo SQL de `shifts` por `employee_id` antes/después; captura del recuento en UI |
| 4 | ¿Puede un PLANNER planificar únicamente dentro de su scope? | Acciones fuera de área ausentes en UI y 403 en API | Matriz rol×capacidad×HTTP; capturas de sesión PLANNER |
| 5 | ¿Puede un cuadrante multiempleado resolverse sin romper aislamiento? | Import de equipo completo en organización `team`, con matching por lote y 0 fugas cross-tenant | `role-matrix.spec.ts` + `cross-tenant-isolation.spec.ts`; capturas del desglose de 5 categorías |
| 6 | ¿Se distingue claramente Import de Schedule? | Badge + ayuda contextual en previsualización y resultado; acción directa a la publicación; landing alineado | Capturas del resumen y del resultado con futuros; landing ES/EN |
| 7 | ¿Todo resultado importante deja feedback persistente? | 0 usos de `window.alert`/`window.confirm` en journeys de negocio; resultado persistente hasta cierre explícito | `grep -rn` con 0 resultados; test E2E que falla ante cualquier diálogo nativo |
| 8 | ¿Los errores indican cómo recuperarse? | Cada `outcome_reason` tiene su acción nombrada y alcanzable (tabla §20) | Capturas de las ramas de bloqueo con su CTA |
| 9 | ¿El histórico explica qué ocurrió? | Cinco estados + actor + alcance + formato + periodo + conteos + filtros + enlaces de recuperación | Capturas de los cinco estados; reporte E2E del histórico |
| 10 | ¿Los roles reales coinciden entre código, UI, tests y docs? | La matriz publicada coincide celda a celda con `role-matrix.spec.ts` y con `resolveAccessScope` | Matriz publicada + salida del test + `grep` de `MANAGER` sin apariciones vigentes |
| 11 | ¿Personal y Team tienen límites comprensibles? | Límites visibles antes de encontrarlos; `/pricing` coherente con `plans.js` | Capturas de `/pricing` y de las 4 superficies con gate |
| 12 | ¿La aplicación funciona en desktop/tablet/mobile? | 4 viewports sin scroll horizontal de `body`; contenido ancho con affordance | Suite responsive completa + capturas |
| 13 | ¿Light y dark siguen siendo coherentes? | Contraste correcto en ambas superficies, landing y app | Capturas pareadas de cada pantalla tocada |
| 14 | ¿Los journeys principales son accesibles? | Modales conformes al contrato; nombres accesibles; estados no comunicados solo por color; navegación por teclado completa | Snapshots del árbol de accesibilidad por journey |
| 15 | ¿No se ha degradado seguridad, tenant isolation, autorización o integridad de datos? | Matriz de permisos completa; aislamiento con 4 roles; invariantes de BD sin violaciones; enforcement de plan intacto | Matriz + log de invariantes + `plan-entitlement.spec.ts` + `cross-tenant-isolation.spec.ts` |

**Cobertura adicional obligatoria en este Gate** (absorbe gaps de la auditoría):
- G-02: un recorrido de importación en navegador por cada formato soportado (PDF, XLSX, CSV, JSON, XML, imagen con fallback VLM en modo `fake`).
- G-04: recorrido deliberado y completo de modo invitado (importar, editar, persistencia local, ausencia de fuga a backend).
- G-05: flujo OAuth completo con al menos un proveedor.
- G-06: flujo de recuperación de contraseña de extremo a extremo.

**RESULTADO PERMITIDO**: `PASS` | `PASS_WITH_GAPS` | `FAIL` | `BLOCKED`.

**Reglas de veredicto**
- `PASS` exige las 15 preguntas satisfechas **y** los 4 gaps adicionales cubiertos.
- `PASS_WITH_GAPS` exige que cada gap restante esté nombrado, acotado, no bloqueante, con propietario y con fase o release de absorción.
- `FAIL` ante cualquier degradación de seguridad, aislamiento, autorización o integridad de datos — sin excepción y sin compensación por mejoras en otras áreas.
- `BLOCKED` si D-04 sigue sin decidir (P5 no puede cerrarse) o si no hay acceso a Neon development.
- El Gate **no** puede declararse `PASS` sobre la base de `npm test` y `npm run build` en verde. Verifica comportamiento observado.

**ESTADO ACTUAL DEL FINAL_PRODUCT_GATE**: **`BLOCKED`** — ninguna fase ejecutada; D-04 pendiente;
P8 bloqueada por fuente inaccesible.
