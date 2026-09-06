# ROADMAP — ShiftImport Post UX Audit / CRC Tryp / End-to-End

> **Naturaleza del documento**: roadmap de ejecución. Autoridad de producto y de dominio:
> [`docs/specs/SPEC-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md`](../specs/SPEC-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md).
> Este documento contiene las FASES, las MICROTAREAS y los GATES. La SPEC contiene el modelo
> de dominio, journeys objetivo, matrices de roles/planes y el Final Product Gate.
>
> **Estado**: P5 cerrado (PASS); P5.1 cerrado (PASS); P5.2 cerrado (PASS). P6/P7 no iniciadas.

---

## 0. Baseline

| Campo | Valor |
|---|---|
| Repositorio | `anclora-shiftimport` (`https://github.com/ToniIAPro73/anclora-shiftimport.git`) |
| Rama | `development` (default; excepción AOS `EX-SI-001`) |
| HEAD local | `c6b7cfc0c283f4a8ed05406c272e072534b6179c` |
| HEAD `origin/development` | `c6b7cfc0c283f4a8ed05406c272e072534b6179c` |
| Drift | Ninguno |
| Worktree al inicio | Limpio |
| Último commit | `feat(scheduling): close P5 role reality and self-import` |
| Entorno auditado | `https://shiftimport.anclora.com` |
| Auditoría UX/UI de referencia | "Auditoría ShiftImport" — `ux-product-experience-review` / `AUDIT_WITH_REPO_CONTEXT` — 9 findings, `PASS_WITH_GAPS` |

---

## 1. Decisión de numeración (relación con las fases históricas)

El roadmap histórico vivo es `docs/roadmap/shiftimport-mvp-v2/` con releases **R0–R5** (MVP) y
**R6–R9 ya reservados** para POST-MVP:

| Id histórico | Contenido | Estado real verificado |
|---|---|---|
| R0 | Product & Architecture Rebaseline | CERRADO — Gate PASS |
| R1 | Safe Import Completion | CERRADO — Gate PASS (1 gap documentado, no corregido) |
| R2 | Organization Foundation | CERRADO — Gate PASS (R2-M12 `DONE — PASS`) |
| R3 | Future Scheduling | CERRADO — Gate PASS (R3-M16 `DONE — PASS`) |
| R4 | Employee Portal | CERRADO — Gate PASS (R4-M13) |
| R5 | Approval Lite | CERRADO — Gate PASS (R5-M11) |
| R5-M12 | MVP Release Gate | **NO EJECUTADO** — único gate abierto del roadmap histórico |
| R6 | POST-MVP Workflow Engine | Especificado, no implementado |
| R7 | POST-MVP Attendance | Especificado, no implementado |
| R8 | POST-MVP Reconciliation & Reporting | Especificado, no implementado |
| R9 | POST-MVP Advanced Org Model | Especificado, no implementado |

**Decisión**: reutilizar `R6`, `R7`, `R8` para este roadmap **generaría colisión directa** con las
specs POST-MVP existentes. Por tanto este roadmap usa el espacio de nombres **`P0`–`P8`**
(microtareas `P0-M01`, `P1-M01`, …). Esto es explícitamente permitido por el encargo
("o una estructura PHASE 0 / PHASE 1 …").

Relación formal con la historia:

```
R0 → R1 → R2 → R3 → R4 → R5 → [R5-M12 abierto]
                                   │
                                   └── P0 (absorbe y ejecuta R5-M12) → P1 → P2 → P3 → P4 → P5 → P5.1 → P5.2 → P6 → P7
                                                                                                     P8 (BLOCKED)
R6–R9 POST-MVP permanecen intactos y posteriores a P7.
```

---

## 2. Principio de secuenciación

1. Ninguna fase `Pn` puede iniciarse si el Gate de `Pn-1` no está en `PASS` o `PASS_WITH_GAPS`,
   **salvo** las independencias declaradas explícitamente en §3.
2. `P0` es prerequisito duro de **todas** las demás: hasta que la documentación de referencia
   describe el producto real, ningún Gate posterior puede afirmar "documentación actualizada"
   con evidencia.
3. `P8` (CRC Tryp) está `BLOCKED` desde el origen y no bloquea ninguna otra fase.

### 3. Independencias declaradas

| Par de fases | ¿Independientes? | Justificación |
|---|---|---|
| P3 ↔ P4 | SÍ | P3 toca canal de comunicación (diálogos/copy); P4 toca atributos ARIA y contenedores de scroll. Superficies solapadas (`SettingsModal`, `MembersModal`) pero cambios disjuntos. Requieren merge secuencial, no bloqueo de inicio. |
| P2 ↔ P1 | PARCIAL | P2 puede especificarse en paralelo, pero su Gate exige el descriptor de entitlement que P1 no toca. Puede ejecutarse en paralelo a P1 si dos agentes no escriben `src/App.tsx` a la vez (regla one-writer AOS). |
| P6 ↔ P1 | NO | P6 consume el modelo de estados de importación (`completed` / `partial` / `blocked` / `failed`) que introduce P1-M03. |
| P5 ↔ P2 | NO | Verificar ADMIN/PLANNER/EMPLOYEE en navegador requiere una organización Team; el camino de provisión y su señalización se definen en P2. |
| P7 ↔ P1 | NO | El refuerzo Import↔Schedule se ancla en la superficie de resultado persistente que crea P1. |
| P5.1 ↔ P5 | NO | P5.1 consume el modelo de roles ya cerrado y cambia únicamente la shell/navegación; no puede adelantarse a la verificación de roles. |
| P6 ↔ P5.1 | NO | P6 consume el entry point y el contexto del histórico ya reubicados por P5.1. |
| P5.2 ↔ P5.1 | NO | P5.2 consolida la shell ya cerrada y sólo reabre P5.1 ante una regresión causada por esa shell. |
| P6 ↔ P5.2 | NO | P6 consume la navegación y la frontera Import/Añadir/Planificar ya reconciliadas por P5.2. |
| P8 ↔ todo | SÍ | Investigación externa; no toca código. |

---

## PHASE P0 — Baseline Truth & MVP Release Gate

**PHASE_ID**: P0
**PHASE_NAME**: Reconciliación de la verdad documental y cierre del MVP Release Gate
**GOAL**: Que la documentación de referencia (humana y de agentes) describa el producto que
realmente existe en `36e7857`, y ejecutar el único gate abierto del roadmap histórico (R5-M12).
**WHY_NOW**: Cuatro documentos de referencia contradicen el código en HEAD. Cualquier fase
posterior que declare "DOCUMENTATION: PASS" sobre esta base estaría mintiendo. Además, R5-M12
es la única puerta que puede declarar `MVP_READY`, y su ausencia deja al producto sin estado
formal declarado pese a tener R0–R5 en PASS.
**USER_VALUE**: Indirecto — evita que soporte, producto y agentes tomen decisiones sobre un
modelo de roles obsoleto (MANAGER) o crean que Scheduling/Portal/Approvals no existen.
**BUSINESS_VALUE**: Declara formalmente el estado del MVP; desbloquea la conversación de piloto.
**SOURCE_DRIVERS**: Audit F5 (MEDIUM/P2); `docs/roadmap/shiftimport-mvp-v2/R5/R5-M12-mvp-release-gate.md` sin STATUS; verificación directa de repo.

**SCOPE**
- `AGENTS.md` línea 56 (afirma que no hay UI de tipos de turno — falso: `SettingsModal` tiene pestaña completa) y el bloque "Modelo multi-tenant" (declara `Membership (rol ADMIN/MANAGER/EMPLOYEE)`).
- `docs/fase1-multitenant.md` §Permisos mínimos (tabla de 3 roles EMPLOYEE/MANAGER/ADMIN) y §Gestión B2B (whitelist `ADMIN/MANAGER/EMPLOYEE`).
- `README.md` / `README.en.md`: la frase "las etapas de planificación futura, portal de empleado y aprobaciones están en roadmap y no están implementadas todavía" es falsa en HEAD.
- `docs/roadmap/shiftimport-mvp-v2/PROGRESS-STATUS.md`: declara "R2 EN PROGRESO (3 de 13)" con HEAD `2a64852`; la realidad es R0–R5 cerrados en `36e7857`.
- `docs/pricing-hypothesis.md` §1: `Role (ADMIN/MANAGER/EMPLOYEE, per membership)`.
- Ejecución real de R5-M12 (T01–T06).

**OUT_OF_SCOPE**: cualquier cambio de código productivo, de tests o de migraciones. P0 es
documental + verificación. La única excepción son los scripts de verificación que R5-M12 T05
exige, que son de solo lectura contra Neon **development**.

**DEPENDENCIES**: ninguna.
**PREREQUISITES**: worktree limpio; `repo-preflight` PASS; acceso a Neon development (no producción).
**RISKS**: (a) ejecutar T05 contra la rama Neon equivocada — mitigado por `docs/db-environments.md`, incidente real 2026-09-03; (b) que R5-M12 resulte `MVP_NOT_READY` y arrastre bloqueadores a P1.
**DO_NOT_BREAK**: la excepción AOS `EX-SI-001` (default branch `development`) debe conservarse literal; `.anclora/AOS_ADOPTION.md` no se reescribe salvo para actualizar `Last Reviewed`.
**AFFECTED_DOMAINS**: documentación, gobernanza AOS.
**AFFECTED_ROLES**: ninguno en runtime.
**AFFECTED_PLANS**: ninguno.
**AFFECTED_ROUTES**: ninguna.
**AFFECTED_COMPONENTS**: ninguno.
**AFFECTED_API**: ninguna.
**AFFECTED_DATABASE**: solo lectura (verificación de invariantes).
**AFFECTED_I18N**: ninguna.
**AFFECTED_TESTS**: ejecución, no modificación.
**MIGRATION_IMPACT**: ninguno.
**ROLLBACK_STRATEGY**: `git revert` del commit documental; sin impacto en runtime.
**OBSERVABILITY**: log consolidado de la ejecución R5-M12 archivado en `docs/roadmap/shiftimport-mvp-v2/R5/`.
**DOCUMENTATION_UPDATES**: los cinco documentos listados en SCOPE + `PROGRESS-STATUS.md` reescrito como snapshot veraz.

### MICROTASKS — P0

---
**ID**: P0-M01
**TITLE**: Corregir el modelo de roles en `AGENTS.md`
**PURPOSE**: Que la guía primaria de agentes deje de declarar el rol `MANAGER`, inexistente en código desde la migración `0007_remove_manager_role.sql`.
**SOURCE**: Audit F5; `api/_lib/auth.js:177`; `db/migrations/0007_remove_manager_role.sql`; `db/migrations/0013_membership_roles_owner.sql`.
**PRECONDITIONS**: ninguna.
**FILES_LIKELY_AFFECTED**: `AGENTS.md`.
**DATA_MODEL_IMPACT**: ninguno. **API_IMPACT**: ninguno. **UI_IMPACT**: ninguno. **I18N_IMPACT**: ninguno. **ACCESSIBILITY_IMPACT**: ninguno. **SECURITY_IMPACT**: ninguno directo; positivo indirecto (evita que un agente futuro implemente permisos para un rol fantasma).
**TESTS_REQUIRED**: ninguno automatizable. **E2E_REQUIRED**: NO. **MANUAL_QA_REQUIRED**: revisión de diff.
**ACCEPTANCE_CRITERIA**:
- Given un agente lee `AGENTS.md`
- When busca el modelo de membership
- Then encuentra `Membership (rol OWNER/ADMIN/PLANNER/EMPLOYEE + scope ORGANIZATION/AREA/SELF)`
- And no encuentra ninguna aparición de `MANAGER` salvo como nota histórica explícitamente marcada como eliminada en la migración 0007.
**DO_NOT_BREAK**: el resto de `AGENTS.md` (comandos, convenciones, riesgos) no se reescribe.
**DEPENDENCIES**: ninguna. **RISK**: NULO. **ESTIMATED_COMPLEXITY**: XS.

---
**ID**: P0-M02
**TITLE**: Corregir la afirmación "no hay UI de gestión de tipos de turno" en `AGENTS.md:56`
**PURPOSE**: La pestaña Ajustes → Tipos de turno existe con CRUD completo (añadir, archivar, "cuenta como trabajo", color); la doc afirma lo contrario.
**SOURCE**: Audit F5 MEASURED_BROWSER + `src/components/shift-dashboard/SettingsModal.tsx`.
**PRECONDITIONS**: P0-M01 (mismo fichero, orden para evitar conflicto de escritura).
**FILES_LIKELY_AFFECTED**: `AGENTS.md`.
**ACCEPTANCE_CRITERIA**:
- Given `AGENTS.md` §"Tipos de turno configurables"
- When se lee la línea sobre disponibilidad de UI
- Then describe la pestaña real de `SettingsModal` con su ruta de acceso y sus capacidades
- And no afirma que la capacidad esté disponible "solo vía API + persistencia".
**DO_NOT_BREAK**: la nota sobre `SHIFT_TYPE_PRESET_EXAMPLE` y la prohibición de defaults heredados de GroundSync.
**DEPENDENCIES**: P0-M01. **RISK**: NULO. **ESTIMATED_COMPLEXITY**: XS.

---
**ID**: P0-M03
**TITLE**: Reescribir la tabla de permisos de `docs/fase1-multitenant.md` al modelo real de 4 roles × 3 scopes
**PURPOSE**: Es el documento que la propia auditoría consultó y que la indujo a un modelo obsoleto.
**SOURCE**: Audit F5; `api/_lib/auth.js` `requireRole` + `resolveAccessScope`; `docs/roadmap/shiftimport-mvp-v2/R0/RBAC-MODEL.md` (fuente correcta ya existente).
**PRECONDITIONS**: ninguna.
**FILES_LIKELY_AFFECTED**: `docs/fase1-multitenant.md`.
**ACCEPTANCE_CRITERIA**:
- Given un lector abre `docs/fase1-multitenant.md`
- When consulta "Permisos mínimos"
- Then ve una matriz OWNER × ADMIN × PLANNER × EMPLOYEE con la columna de scope efectivo (`ORGANIZATION` / `AREA` / `SELF`)
- And la whitelist de `api/memberships` documentada coincide literalmente con la del código
- And el documento enlaza a `RBAC-MODEL.md` como fuente canónica del diseño.
**DO_NOT_BREAK**: la sección "Contratos Anclora aplicados (Fase 1.1)" y las referencias a la vault.
**DEPENDENCIES**: ninguna. **RISK**: NULO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P0-M04
**TITLE**: Actualizar `README.md` y `README.en.md` al alcance implementado real (R3/R4/R5 incluidos)
**PURPOSE**: El README declara que planificación futura, portal de empleado y aprobaciones "no están implementadas todavía"; los tres están implementados y con Gate PASS.
**SOURCE**: `docs/roadmap/shiftimport-mvp-v2/R3/R3-M16`, `R4/R4-M13`, `R5/R5-M11`; `src/components/scheduling/`, `src/components/employee-portal/`, `api/approval-requests/`.
**PRECONDITIONS**: ninguna.
**FILES_LIKELY_AFFECTED**: `README.md`, `README.en.md`.
**I18N_IMPACT**: paridad ES/EN obligatoria entre ambos README.
**ACCEPTANCE_CRITERIA**:
- Given un lector nuevo abre el README
- When lee "Qué es" y el diagrama de flujo objetivo
- Then las etapas `planificar → publicar → consultar → confirmar → solicitar cambios → aprobar → auditar` aparecen como implementadas, no como roadmap
- And el bloque "Qué no es (todavía)" conserva intacto el alcance POST-MVP (ERP/HRIS/payroll/BPMN/fichaje/vigilancia)
- And `README.en.md` refleja exactamente los mismos hechos.
**DO_NOT_BREAK**: badges, avisos de repositorio privado, y la nota de provenance de GroundSync.
**DEPENDENCIES**: ninguna. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P0-M05
**TITLE**: Reescribir `PROGRESS-STATUS.md` como snapshot veraz en `36e7857`
**PURPOSE**: El snapshot vigente declara R2 en progreso (3 de 13) sobre HEAD `2a64852`; la realidad es R0–R5 cerrados y solo R5-M12 abierto.
**SOURCE**: `git log`; `grep '^STATUS' docs/roadmap/shiftimport-mvp-v2/`.
**PRECONDITIONS**: ninguna.
**FILES_LIKELY_AFFECTED**: `docs/roadmap/shiftimport-mvp-v2/PROGRESS-STATUS.md`.
**ACCEPTANCE_CRITERIA**:
- Given el documento de progreso
- When se lee la sección "Hecho"
- Then R0, R1, R2, R3, R4, R5 aparecen cerrados con su gate y su SHA
- And "Por hacer" contiene exactamente: R5-M12 (MVP Release Gate) y los POST-MVP R6–R9
- And el documento enlaza a este roadmap `P0–P8` como continuación post-auditoría.
**DO_NOT_BREAK**: los hallazgos históricos registrados (R1-M05/M08/M14, la brecha de datos de R2-M02) no se borran.
**DEPENDENCIES**: ninguna. **RISK**: NULO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P0-M06
**TITLE**: Corregir la referencia a roles en `docs/pricing-hypothesis.md`
**PURPOSE**: §1 declara `Role (ADMIN/MANAGER/EMPLOYEE, per membership)`.
**SOURCE**: Audit F5 (extensión verificada en este análisis).
**PRECONDITIONS**: ninguna.
**FILES_LIKELY_AFFECTED**: `docs/pricing-hypothesis.md`.
**ACCEPTANCE_CRITERIA**:
- Given §1 "Decided architecture"
- When se lee la frase sobre ortogonalidad Plan↔Role
- Then enumera OWNER/ADMIN/PLANNER/EMPLOYEE
- And la afirmación de ortogonalidad (`Neither module references the other`) se conserva y se verifica con un grep documentado de `plans.js` ↛ `auth.js`.
**DO_NOT_BREAK**: la separación explícita entre "arquitectura decidida" e "hipótesis comercial no validada". Los precios siguen marcados como no validados.
**DEPENDENCIES**: ninguna. **RISK**: NULO. **ESTIMATED_COMPLEXITY**: XS.

---
**ID**: P0-M07
**TITLE**: Ejecutar R5-M12 T01 — flujo end-to-end de 16 pasos
**PURPOSE**: Verificar en un entorno real el flujo `signup → organization → employee → area → import → review → compare → confirm → schedule → future planning → publish → employee view → acknowledge → change request → approval → audit`.
**SOURCE**: `docs/roadmap/shiftimport-mvp-v2/R5/R5-M12-mvp-release-gate.md` §18 T01.
**PRECONDITIONS**: Neon **development**; `vercel dev`; `qa/e2e-acceptance/playwright.local.config.ts`.
**FILES_LIKELY_AFFECTED**: ninguno de producto; posible spec E2E nueva bajo `qa/e2e-acceptance/specs-local/` (permitida solo dentro de la ejecución de P0, no en este encargo de planificación).
**SECURITY_IMPACT**: prohibido ejecutar contra producción. Verificar host de la connection string contra `.env.development.local` antes de arrancar.
**TESTS_REQUIRED**: SÍ. **E2E_REQUIRED**: SÍ. **MANUAL_QA_REQUIRED**: capturas de los 16 pasos.
**ACCEPTANCE_CRITERIA**:
- Given un entorno Neon development limpio y sembrado
- When se ejecuta el recorrido de 16 pasos
- Then los 16 pasos completan sin error y sin intervención manual fuera de la propia UI
- And existe evidencia capturada de cada paso en al menos ES/light/desktop y una pasada EN/dark/mobile.
**DO_NOT_BREAK**: no se corrige nada "de paso"; los fallos se documentan como bloqueadores y se remedian en su release de origen.
**DEPENDENCIES**: P0-M01..M06 no son bloqueantes técnicos, pero el Gate P0 los exige. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: L.

**PERFIL DE EJECUCIÓN E2E ADOPTADO**: para reducir el tiempo de espera sin reducir los contratos
verificados, el smoke de P0 se ejecuta con
`qa/e2e-acceptance/playwright.p0-gate.config.ts`. Agrupa comprobaciones compatibles en cuatro
escenarios deterministas (planner UI, matriz de roles/tenant, import futuro + idempotencia y
portal/aprobación), reutiliza las fixtures de Neon development y evita navegaciones, logouts y
esperas de hidratación repetidas. El perfil histórico completo (`playwright.local.config.ts`)
permanece disponible para regresión amplia; no se sustituye ni se declara equivalente al flujo
funcional completo de 16 pasos exigido por este Gate.

---
**ID**: P0-M08
**TITLE**: Ejecutar R5-M12 T02/T03 — tenant isolation y matriz de permisos completa
**PURPOSE**: Probar que Org A ≠ Org B en cada recurso, y que la matriz OWNER×ADMIN×PLANNER×EMPLOYEE × (ORGANIZATION×AREA×SELF) se comporta como declara `resolveAccessScope`.
**SOURCE**: R5-M12 §18 T02/T03; `api/_lib/scope.test.js`; `qa/e2e-acceptance/specs-local/cross-tenant-isolation.spec.ts`.
**PRECONDITIONS**: P0-M07.
**SECURITY_IMPACT**: máximo — es la verificación de aislamiento.
**ACCEPTANCE_CRITERIA**:
- Given dos organizaciones con datos homólogos
- When un actor de Org A intenta leer o mutar cualquier recurso de Org B por id directo
- Then recibe 403/404 sin filtración de existencia, en cada endpoint de `api/`
- And la tabla resultante rol×scope×capacidad se archiva como evidencia.
**DO_NOT_BREAK**: la convención de "sin fuga de existencia" (403 en lugar de 404 discriminante donde ya está así).
**DEPENDENCIES**: P0-M07. **RISK**: ALTO si falla. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P0-M09
**TITLE**: Ejecutar R5-M12 T04/T05 — idempotencia de importación e invariantes de BD
**PURPOSE**: Confirmar que un segundo import idéntico no duplica filas y que las invariantes críticas (unicidad de `structureHash`, unicidad de `approval_request` por `change_request`, FKs) se sostienen sobre datos reales de desarrollo.
**SOURCE**: R5-M12 §18 T04/T05; `db/migrations/0011_import_idempotency.sql`, `0012`, `0028`.
**PRECONDITIONS**: P0-M07.
**ACCEPTANCE_CRITERIA**:
- Given un import ya confirmado
- When se reimporta el mismo fichero con el mismo `fileFingerprint` y el mismo contexto
- Then el conteo de `shifts` no cambia y `POST /api/imports` responde 200 con `deduplicated`
- And el script de invariantes reporta 0 violaciones contra Neon development.
**DO_NOT_BREAK**: nunca ejecutar el script contra producción.
**DEPENDENCIES**: P0-M07. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

**VERIFICADOR EJECUTABLE**: `scripts/verify-mvp-invariants.mjs` realiza únicamente consultas de
lectura, comprueba el prefijo de host de Neon development antes de conectarse y devuelve código de
salida distinto de cero ante cualquier violación.

---
**ID**: P0-M10
**TITLE**: Ejecutar R5-M12 T06 y emitir el veredicto `MVP_READY` / `MVP_NOT_READY`
**PURPOSE**: Cerrar formalmente el único gate abierto del roadmap histórico.
**SOURCE**: R5-M12 §21/§23.
**PRECONDITIONS**: P0-M07, P0-M08, P0-M09.
**ACCEPTANCE_CRITERIA**:
- Given T01–T05 ejecutados con evidencia
- When se ejecuta el checklist transversal (lint, typecheck, `npm test`, build, E2E, axe, responsive, dark/light, ES/EN)
- Then todos los ítems quedan en verde o con warning explícitamente justificado y no bloqueante
- And `R5-M12-mvp-release-gate.md` recibe una línea `STATUS:` con el veredicto y el listado de warnings vigentes
- And si el veredicto es `MVP_NOT_READY`, la lista de bloqueadores queda enumerada y asignada a su release de origen.
**DO_NOT_BREAK**: la regla "no existe MVP_READY parcial" de R5-M12 §21.
**DEPENDENCIES**: P0-M07..M09. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

### PHASE_P0_GATE

| Criterio | Exigencia |
|---|---|
| FUNCTIONAL | Flujo de 16 pasos completo (P0-M07) |
| DATA_INTEGRITY | Invariantes BD 0 violaciones (P0-M09) |
| AUTHORIZATION | Matriz rol×scope completa ejecutada (P0-M08) |
| TENANT_ISOLATION | Org A ↮ Org B en todos los endpoints (P0-M08) |
| SECURITY | Ninguna ejecución contra producción; host verificado contra `.env.development.local` |
| REGRESSION | Suite completa `npm test` sin regresión frente al baseline `36e7857` |
| ACCESSIBILITY | Snapshot axe de las pantallas del flujo de 16 pasos |
| RESPONSIVE | Pasada mobile del flujo completo |
| I18N | Pasada ES y EN del flujo completo |
| UNIT_TESTS / INTEGRATION_TESTS / E2E | `npm test` + Playwright local PASS |
| BUILD / LINT / TYPECHECK | `npm run build`, `npm run lint` (`--max-warnings 0`), `tsc` PASS |
| DOCUMENTATION | Los 6 documentos de P0-M01..M06 corregidos y sin aparición de `MANAGER` como rol vigente |
| AOS_COMPLIANCE | `.anclora/AOS_ADOPTION.md` con `Last Reviewed` actualizado; `EX-SI-001` intacta |
| WORKTREE_STATE | `git status` limpio tras commits documentales; sin push |
| MIGRATION_VALIDATION | Migración desde cero en schema efímero de Neon development: 32/32 |
| REAL_NEON_VALIDATION | SÍ (development, nunca producción) |
| IDEMPOTENCY | P0-M09 |
| ROLE_MATRIX | P0-M08 |
| BROWSER_QA | Capturas de los 16 pasos |

**EVIDENCE_REQUIRED**
- `git diff` de los 6 documentos, y `grep -rn "MANAGER" AGENTS.md docs/` devolviendo solo notas históricas marcadas.
- Salida completa de `npm test`, `npm run lint`, `npm run build`.
- Reporte HTML/JSON de Playwright de la corrida local.
- Tabla de matriz de permisos rol×scope×endpoint con el código HTTP observado por celda.
- Log del script de invariantes con el host de Neon enmascarado pero identificable como development.
- Capturas de los 16 pasos (ES/light/desktop + EN/dark/mobile).
- `git status --porcelain` vacío al cierre.

**RESULTADOS PERMITIDOS**: `PASS` | `PASS_WITH_GAPS` | `FAIL` | `BLOCKED`.
- `PASS_WITH_GAPS` admisible si y solo si el único gap es un warning ya declarado no bloqueante en su release de origen y re-listado aquí.
- `BLOCKED` si no hay acceso a Neon development.

---

## PHASE P1 — Trusted Import Completion

**PHASE_ID**: P1
**PHASE_NAME**: Importación con resultado persistente, recuperable y trazable
**GOAL**: Que ninguna importación termine sin dejar en pantalla, dentro de la superficie del
producto, qué ocurrió, por qué y cuál es la siguiente acción concreta — y que ese hecho quede
registrado en el histórico.
**WHY_NOW**: Es el finding HIGH/P1 número uno de la auditoría (F1) sobre el journey núcleo, y
tiene una causa raíz de datos verificada en este análisis: `createImport` fija
`const status = 'completed'` (`api/_lib/data.js:1486`), por lo que un intento bloqueado o
fallido **jamás** aparece en el histórico. Por eso el usuario ve "No hay importaciones
registradas" después de un intento real.
**USER_VALUE**: Elimina la ambigüedad "¿ha pasado algo?" en la acción más frecuente del producto;
reduce reintentos ciegos.
**BUSINESS_VALUE**: Menos tickets de soporte reactivo; confianza en el diferencial "Safe Import".
**SOURCE_DRIVERS**: Audit F1 (HIGH/P1); hallazgo documentado y no corregido de R1-M09 ("imports totalmente fallidos nunca se persisten en el historial; `status='failed'` no tiene ningún path de código"); `api/_lib/data.js:1486`.

**SCOPE**
- Modelo de estado de resultado de importación: `completed` | `partial` | `blocked` | `failed`.
- Persistencia del intento bloqueado/fallido en `imports` con su motivo estructurado.
- Superficie de resultado persistente que sustituye la cadena `window.confirm` + `window.alert` de `src/App.tsx:788-800` y los `window.alert` de bloqueo (`:747`, `:751`, `:764`, `:769`).
- Enlace de acción directa desde el resultado hacia "Usuarios de la organización".
- Reintento explícito ("Reintentar importación") tras completar el alta bloqueante.

**OUT_OF_SCOPE**
- La regla de negocio: **nunca** importar turnos sobre una identidad de empleado no verificada. No se relaja.
- Los `window.confirm` de otras superficies (Areas, Members, Settings, Planner, Legal, ImportHistory) → P3.
- El refuerzo de la comunicación Import↔Schedule → P7.

**DEPENDENCIES**: P0 (Gate `PASS` o `PASS_WITH_GAPS`).
**PREREQUISITES**: `ModalShell` disponible (`src/components/ui/ModalShell.tsx`); `ImportResultModal` existente como punto de extensión.
**RISKS**: (a) romper la idempotencia si un intento bloqueado consume la clave de idempotencia — debe registrarse sin reservarla; (b) regresión en el conteo del histórico (`db/backfill-import-counters.mjs` asume solo `completed`); (c) `src/App.tsx` es un fichero de 1813 líneas con alta contención de escritura.
**DO_NOT_BREAK**
- Invariante: ningún `Shift` sin `organization_id` + `employee_id`.
- Invariante: la importación nunca escribe en almacenamiento antes de la previsualización editable.
- `EMPLOYEE_NOT_ACTIVE` sigue rechazando en backend, independientemente de lo que muestre la UI.
- Idempotencia por `(organization, employee, fileFingerprint, contexto)`.
- Deduplicación semántica: conflicto = organization + employee + fingerprint, nunca solo fecha.
**AFFECTED_DOMAINS**: Import, Employee, History.
**AFFECTED_ROLES**: OWNER, ADMIN (import individual con alta inline); EMPLOYEE (self-import) por herencia.
**AFFECTED_PLANS**: todos.
**AFFECTED_ROUTES**: `/app`.
**AFFECTED_COMPONENTS**: `src/App.tsx`, `ImportModal.tsx`, `ImportResultModal.tsx`, `ImportHistoryModal.tsx`, `import-state-copy.ts`.
**AFFECTED_API**: `POST /api/imports`, `GET /api/imports`.
**AFFECTED_DATABASE**: `imports` — nueva migración para `status` extendido + motivo estructurado.
**AFFECTED_I18N**: `src/lib/i18n.ts` — nuevas claves ES/EN para el resultado persistente; retirada de las claves usadas solo por `alert`.
**AFFECTED_TESTS**: `api/_lib/data.test.js`, `ImportResultModal.test.tsx`, `ImportHistoryModal.test.tsx`, `qa/e2e-acceptance/specs-local/import-integrity.spec.ts`.
**MIGRATION_IMPACT**: una migración forward-only, aditiva, con `CHECK` ampliado; rows existentes conservan `completed`.
**ROLLBACK_STRATEGY**: la migración es aditiva y el `CHECK` se amplía, nunca se estrecha; revertir el código deja filas con estados nuevos que la UI antigua mostraría como desconocidos — por eso el rollback de P1 exige revertir código **y** mapear estados nuevos a `completed` en la vista, no borrar filas.
**OBSERVABILITY**: cada intento bloqueado/fallido genera una fila de `imports` y un `organization_audit_event`.
**DOCUMENTATION_UPDATES**: `AGENTS.md` §"Reglas para cambios" (la importación nunca falla en silencio → ahora tampoco desaparece en silencio); `docs/roadmap/shiftimport-mvp-v2/R1/R1-M09-import-history.md` (cierra el hallazgo abierto).

### MICROTASKS — P1

---
**ID**: P1-M01
**TITLE**: Definir el contrato de dominio `ImportOutcome`
**PURPOSE**: Fijar, antes de tocar datos o UI, los cuatro estados terminales de un intento de importación y qué información acompaña a cada uno.
**SOURCE**: Audit F1; R1-M09 hallazgo abierto; `src/ingestion/diagnostics.ts` (modelo canónico ya existente de estados de análisis READY/NEEDS_USER_INPUT/PARTIAL/BLOCKED/UNSUPPORTED/FAILED).
**PRECONDITIONS**: P0 Gate.
**FILES_LIKELY_AFFECTED**: `docs/product/` (nuevo `IMPORT_OUTCOME_CONTRACT.md`), `src/lib/types.ts` (solo tipos).
**DATA_MODEL_IMPACT**: define el vocabulario que P1-M02 migra. **API_IMPACT**: define el payload de P1-M03. **UI_IMPACT**: define lo que P1-M05 renderiza.
**SECURITY_IMPACT**: el motivo estructurado **no** debe contener PII más allá del nombre de empleado ya visible para el actor.
**TESTS_REQUIRED**: tipos verificados por `tsc`. **E2E_REQUIRED**: NO. **MANUAL_QA_REQUIRED**: revisión de contrato.
**ACCEPTANCE_CRITERIA**:
- Given el contrato publicado
- When se consulta el estado `blocked`
- Then define exactamente: motivo (`EMPLOYEE_PENDING_ACCESS` | `EMPLOYEE_INACTIVE` | `EMPLOYEE_AMBIGUOUS` | `EMPLOYEE_UNKNOWN` | `PLAN_LIMIT` | `AREA_MISMATCH_DECLINED`), entidad bloqueante (nombre + id de empleado o área), turnos no importados, y la acción de desbloqueo asociada
- And `partial` define qué subconjunto se persistió y cuál no
- And `failed` distingue error de sistema de error de documento
- And el contrato declara explícitamente que un intento `blocked` **no** consume la clave de idempotencia.
**DO_NOT_BREAK**: la taxonomía de `src/ingestion/diagnostics.ts` no se renombra; `ImportOutcome` es un nivel superior (resultado de la escritura), no un reemplazo del diagnóstico de análisis.
**DEPENDENCIES**: ninguna dentro de P1. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P1-M02
**TITLE**: Migración — ampliar `imports.status` y añadir motivo estructurado
**PURPOSE**: Permitir persistir intentos que hoy desaparecen.
**SOURCE**: `api/_lib/data.js:1486` (`const status = 'completed'`); `db/migrations/0010_import_history.sql`.
**PRECONDITIONS**: P1-M01.
**FILES_LIKELY_AFFECTED**: `db/migrations/0033_import_outcome.sql` (nueva), `db/migrations.test.mjs`.
**DATA_MODEL_IMPACT**: `imports.status` con `CHECK` ampliado a `('completed','partial','blocked','failed')`; nuevas columnas `outcome_reason TEXT NULL`, `outcome_detail JSONB NULL`, `blocking_employee_id UUID NULL REFERENCES employees(id) ON DELETE SET NULL`.
**API_IMPACT**: ninguno todavía. **UI_IMPACT**: ninguno todavía.
**SECURITY_IMPACT**: `outcome_detail` acotado a datos ya visibles en el scope del actor; nunca contenido del fichero.
**TESTS_REQUIRED**: `db/migrations.test.mjs` — aplicación desde cero e idempotencia. **E2E_REQUIRED**: NO. **MANUAL_QA_REQUIRED**: aplicación en Neon development.
**ACCEPTANCE_CRITERIA**:
- Given la base con 32 migraciones aplicadas
- When se aplica `0033`
- Then todas las filas existentes conservan `status='completed'` y `outcome_reason IS NULL`
- And insertar `status='blocked'` es aceptado y `status='bogus'` es rechazado por el `CHECK`
- And reaplicar la migración es idempotente (`IF NOT EXISTS`)
- And la migración es forward-only y no destruye ninguna columna.
**DO_NOT_BREAK**: `imports_org_created_idx`, `imports_file_fingerprint_idx`, la política de soft-delete (`deleted_at`) y su semántica "Eliminada".
**DEPENDENCIES**: P1-M01. **RISK**: MEDIO (migración sobre datos reales). **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P1-M03
**TITLE**: `createImport` — aceptar y persistir outcomes no `completed`
**PURPOSE**: Sustituir el `status` hardcodeado por el outcome real, sin abrir un vector para que el cliente falsee un `completed`.
**SOURCE**: `api/_lib/data.js:1469-1500`.
**PRECONDITIONS**: P1-M02.
**FILES_LIKELY_AFFECTED**: `api/_lib/data.js`, `api/imports/index.js`, `api/_lib/data.test.js`.
**API_IMPACT**: `POST /api/imports` acepta `outcome: { status, reason, detail, blockingEmployeeId }`. El servidor valida el enum y **re-deriva** cuanto puede (p. ej. si `createdShiftCount === 0` y `status === 'completed'`, es un error de contrato → 400).
**SECURITY_IMPACT**: alto — el cliente no puede declarar `completed` sin turnos creados; `blockingEmployeeId` se valida con `assertEmployeeInScope`.
**TESTS_REQUIRED**: SÍ (sql fake). **E2E_REQUIRED**: NO (cubierto en P1-M09). **MANUAL_QA_REQUIRED**: NO.
**ACCEPTANCE_CRITERIA**:
- Given un actor ADMIN con un intento bloqueado por empleado `pending_access`
- When el cliente registra el intento con `status='blocked'`, `reason='EMPLOYEE_PENDING_ACCESS'`
- Then se crea una fila de `imports` con `created_shift_count=0` y el `blocking_employee_id` correcto
- And no se reserva ninguna clave de idempotencia, de modo que el reintento posterior con el mismo fingerprint sí puede completarse
- And un `blockingEmployeeId` de otra organización devuelve 403 sin filtrar existencia
- And declarar `status='completed'` con `createdShiftCount=0` y `existingShiftCount=0` devuelve 400.
**DO_NOT_BREAK**: la idempotencia de los imports `completed` (`0011`, `0012`); `deleteImport` sigue hard-borrando solo shifts por `import_id`.
**DEPENDENCIES**: P1-M02. **RISK**: ALTO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P1-M04
**TITLE**: Registrar un `organization_audit_event` por intento bloqueado/fallido
**PURPOSE**: Trazabilidad operativa: quién intentó importar qué y por qué se detuvo.
**SOURCE**: `db/migrations/0016_organization_audit_events.sql`; R2-M09.
**PRECONDITIONS**: P1-M03.
**FILES_LIKELY_AFFECTED**: `api/_lib/data.js`, `api/organizations/audit-events.js`, `api/_lib/audit.test.js`.
**SECURITY_IMPACT**: el evento se escribe con el actor de sesión, nunca con un actor enviado por el cliente.
**ACCEPTANCE_CRITERIA**:
- Given un intento bloqueado registrado
- When un ADMIN consulta los eventos de auditoría de su organización
- Then existe un evento `IMPORT_BLOCKED` con actor, motivo, empleado bloqueante y timestamp
- And ese evento no es visible desde otra organización.
**DO_NOT_BREAK**: los tipos de evento existentes y sus consumidores.
**DEPENDENCIES**: P1-M03. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P1-M05
**TITLE**: Superficie de resultado persistente — extender `ImportResultModal` sobre `ModalShell`
**PURPOSE**: Sustituir el canal de comunicación (diálogos del sistema) por el sistema de modales propio, con un resultado que **permanece** hasta que el usuario lo cierra explícitamente.
**SOURCE**: Audit F1 (cambio recomendado literal); `src/components/shift-dashboard/ImportResultModal.tsx` (existe, pero cubre solo el confirm en modo sesión con `ReconciliationReport`, usa `div role="dialog"` crudo y no `ModalShell`).
**PRECONDITIONS**: P1-M01.
**FILES_LIKELY_AFFECTED**: `src/components/shift-dashboard/ImportResultModal.tsx`, `src/components/ui/ModalShell.tsx` (solo consumo), `src/App.tsx`.
**UI_IMPACT**: alto. **I18N_IMPACT**: claves nuevas ES/EN para título, contadores, motivo y CTA.
**ACCESSIBILITY_IMPACT**: al migrar a `ModalShell` se gana focus trap, ESC, click-outside, foco inicial/retorno y `role="dialog" aria-modal` conforme a `docs/standards/MODAL_CONTRACT.md`; el listado de motivos conserva `role="alert"`.
**SECURITY_IMPACT**: ninguno.
**TESTS_REQUIRED**: SÍ (`ImportResultModal.test.tsx`). **E2E_REQUIRED**: SÍ (en P1-M09). **MANUAL_QA_REQUIRED**: SÍ (dark/light, 390px).
**ACCEPTANCE_CRITERIA**:
- Given un administrador importa un cuadrante individual con un empleado no reconocido
- When confirma la importación y acepta darlo de alta parcialmente
- Then ve, dentro de la propia superficie de importación y **no** en un diálogo del navegador, cuántos turnos quedaron pendientes, el nombre del empleado bloqueante y un enlace directo para completar su alta
- And ese resumen permanece visible hasta que el usuario lo cierra explícitamente
- And el modal cumple el `MODAL_CONTRACT` (ESC, focus trap, retorno de foco, footer secundaria-izquierda/primaria-derecha).
**DO_NOT_BREAK**: el caso `PASS` existente ("N de N guardados") sigue mostrándose igual de explícito; `ReconciliationReport` sigue siendo el input del caso de éxito.
**DEPENDENCIES**: P1-M01. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P1-M06
**TITLE**: Sustituir la cadena `confirm`+`alert` del alta parcial en `src/App.tsx:788-800`
**PURPOSE**: El punto exacto que la auditoría midió en navegador.
**SOURCE**: Audit F1 MEASURED_CODE (`src/App.tsx:787-798`).
**PRECONDITIONS**: P1-M05.
**FILES_LIKELY_AFFECTED**: `src/App.tsx`.
**UI_IMPACT**: la decisión "¿darlo de alta parcialmente?" pasa a ser un paso del modal propio con dos acciones nombradas ("Dar de alta y detener importación" / "Cancelar importación"), no un `confirm` binario del SO.
**ACCEPTANCE_CRITERIA**:
- Given el flujo de import individual con `match.kind === 'new'` y `adminIndividualImport`
- When el usuario llega al punto de decisión
- Then no se invoca `window.confirm` ni `window.alert` en ninguna rama de este camino
- And la regla se conserva: tras el alta parcial, `resolveImportEmployee` sigue devolviendo `null` y el intento se detiene
- And el intento queda registrado vía P1-M03 con `status='blocked'`, `reason='EMPLOYEE_UNKNOWN'`.
**DO_NOT_BREAK**: el comentario de invariante del equipo se conserva y se actualiza; la regla "solo empleados ACTIVE reciben turnos importados" y el rechazo backend `EMPLOYEE_NOT_ACTIVE` se mantienen intactos.
**DEPENDENCIES**: P1-M05. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P1-M07
**TITLE**: Sustituir los `window.alert` de bloqueo por identidad (`:747`, `:751`, `:764`, `:769`)
**PURPOSE**: Los cuatro caminos de bloqueo por identidad (inactivo sin permiso, inactivo mantenido, `pending_access`, ambiguo) comunican hoy con `alert` y desaparecen.
**SOURCE**: `src/App.tsx:747,751,764,769`; Audit F1 (patrón).
**PRECONDITIONS**: P1-M05, P1-M06.
**FILES_LIKELY_AFFECTED**: `src/App.tsx`, `src/lib/i18n.ts`.
**ACCEPTANCE_CRITERIA**:
- Given cualquiera de los cuatro motivos de bloqueo por identidad
- When el intento se detiene
- Then el usuario ve el resultado persistente con el motivo específico y la acción de desbloqueo correspondiente (reactivar / completar alta / desambiguar)
- And para el caso `ambiguous` la acción propuesta es abrir la resolución de identidad, no simplemente "reintentar".
**DO_NOT_BREAK**: `recognized_inactive` sigue exigiendo decisión explícita de ADMIN y nunca reactiva ni duplica en silencio.
**DEPENDENCIES**: P1-M06. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P1-M08
**TITLE**: Recuperación contextual — enlace directo y reintento explícito
**PURPOSE**: Convertir el resultado en una acción, no en un aviso.
**SOURCE**: Audit F1 cambio recomendado (b) y (c).
**PRECONDITIONS**: P1-M05, P1-M07.
**FILES_LIKELY_AFFECTED**: `src/App.tsx`, `ImportResultModal.tsx`, `MembersModal.tsx` (solo apertura dirigida, sin cambio de lógica).
**UI_IMPACT**: el resultado ofrece "Completar alta de {empleado}" (abre `MembersModal` con el empleado preseleccionado) y, al volver, "Reintentar importación" con el mismo fichero.
**ACCEPTANCE_CRITERIA**:
- Given un resultado bloqueado por `EMPLOYEE_PENDING_ACCESS`
- When el usuario pulsa "Completar alta"
- Then se abre "Usuarios de la organización" con el empleado bloqueante ya localizado
- And al volver, "Reintentar importación" reejecuta el mismo intento sin volver a seleccionar el fichero
- And si el bloqueo persiste, el resultado se actualiza en lugar de duplicarse.
**DO_NOT_BREAK**: la previsualización editable previa a cualquier escritura; el reintento no puede saltarse review/compare/confirm.
**DEPENDENCIES**: P1-M07. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P1-M09
**TITLE**: E2E — importación bloqueada, recuperación y reintento exitoso
**PURPOSE**: Probar el journey completo de bloqueo→desbloqueo→éxito en navegador real.
**SOURCE**: Audit F1 criterio de aceptación; `qa/e2e-acceptance/specs-local/import-integrity.spec.ts`.
**PRECONDITIONS**: P1-M08.
**FILES_LIKELY_AFFECTED**: `qa/e2e-acceptance/specs-local/import-integrity.spec.ts` o nuevo `import-recovery.spec.ts`.
**E2E_REQUIRED**: SÍ. **MANUAL_QA_REQUIRED**: capturas dark/light y 390px.
**ACCEPTANCE_CRITERIA**:
- Given un CSV con un empleado desconocido
- When se ejecuta el flujo hasta el bloqueo
- Then no aparece ningún diálogo nativo (el test falla si `page.on('dialog')` se dispara)
- And el histórico muestra una entrada `Bloqueada` con el motivo
- And tras completar el alta y reintentar, el histórico muestra una segunda entrada `Completada` y los turnos aparecen en el calendario
- And el número total de `shifts` coincide exactamente con las filas del fichero.
**DO_NOT_BREAK**: los escenarios E2E existentes de import.
**DEPENDENCIES**: P1-M08. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P1-M10
**TITLE**: Cerrar el hallazgo abierto de R1-M09 y actualizar `AGENTS.md`
**PURPOSE**: El hallazgo "imports totalmente fallidos nunca se persisten en el historial" queda resuelto y debe dejar de figurar como pendiente.
**SOURCE**: `docs/roadmap/shiftimport-mvp-v2/R1/R1-M09-import-history.md`.
**PRECONDITIONS**: P1-M09.
**FILES_LIKELY_AFFECTED**: `R1-M09-import-history.md`, `AGENTS.md`.
**ACCEPTANCE_CRITERIA**:
- Given R1-M09
- When se lee su hallazgo T02
- Then queda marcado como resuelto con referencia a P1-M02/M03 y a su commit
- And `AGENTS.md` §"Reglas para cambios" declara que un intento de importación nunca desaparece sin dejar registro.
**DEPENDENCIES**: P1-M09. **RISK**: NULO. **ESTIMATED_COMPLEXITY**: XS.

### PHASE_P1_GATE

| Criterio | Exigencia |
|---|---|
| FUNCTIONAL | Bloqueo→recuperación→reintento exitoso completo en navegador |
| DATA_INTEGRITY | Ningún `Shift` sin `organization_id`+`employee_id`; conteos del histórico correctos tras estados nuevos |
| AUTHORIZATION | `blockingEmployeeId` fuera de scope → 403 sin filtración |
| TENANT_ISOLATION | Las filas `blocked`/`failed` de Org A no son visibles desde Org B |
| SECURITY | El cliente no puede declarar `completed` sin turnos creados |
| REGRESSION | Suite de import R1 completa sin regresión |
| ACCESSIBILITY | `ImportResultModal` conforme a `MODAL_CONTRACT` + snapshot axe |
| RESPONSIVE | Resultado legible y accionable a 390px |
| I18N | Claves nuevas presentes en ES y EN; `i18n-coverage.test.ts` PASS |
| UNIT/INTEGRATION/E2E | `npm test` + Playwright PASS |
| BUILD/LINT/TYPECHECK | PASS |
| DOCUMENTATION | `IMPORT_OUTCOME_CONTRACT.md` publicado; R1-M09 cerrado |
| AOS_COMPLIANCE | Contrato de modales aplicado; sin dependencias nuevas |
| WORKTREE_STATE | Limpio, sin push |
| MIGRATION_VALIDATION | `0033` aplica desde cero e incremental; idempotente |
| REAL_NEON_VALIDATION | SÍ (development) |
| IDEMPOTENCY | Un intento `blocked` no consume la clave; el reintento sí deduplica |
| DUPLICATE_HANDLING | Reimportar el mismo fichero tras el éxito no duplica |
| ERROR_RECOVERY | Toda rama de bloqueo ofrece una acción de desbloqueo nombrada |
| ROLLBACK | Plan de reversión documentado (código + mapeo de estados) |
| BROWSER_QA | Capturas de las 4 ramas de bloqueo |

**EVIDENCE_REQUIRED**
- Test E2E que **falla** si se dispara cualquier diálogo nativo en el journey de importación (`page.on('dialog')`).
- `grep -n "window.confirm\|window.alert" src/App.tsx` con 0 apariciones en las rutas de resolución de empleado e importación.
- Filas de `imports` antes/después con `status`, `outcome_reason`, `blocking_employee_id`.
- Capturas del resultado persistente en las 4 ramas de bloqueo, ES/EN, dark/light, 1440px y 390px.
- Salida de `db/migrations.test.mjs`.
- Snapshot de árbol de accesibilidad del modal de resultado.

**RESULTADOS**: `PASS` | `PASS_WITH_GAPS` (admisible si el reintento automático queda fuera y el usuario debe reseleccionar el fichero, documentado como gap) | `FAIL` | `BLOCKED`.

---

## PHASE P2 — Plan Entitlement UX

**PHASE_ID**: P2
**PHASE_NAME**: Gating de plan visible antes del esfuerzo, nunca después
**GOAL**: Que ninguna superficie muestre como activa una acción que el backend va a denegar por
plan, sin debilitar el control server-side.
**WHY_NOW**: Finding HIGH/P1 (F2). Además es el gap que impidió a la propia auditoría verificar
ADMIN/PLANNER/EMPLOYEE en navegador, por lo que bloquea P5.
**USER_VALUE**: Evita rellenar un formulario completo —incluida una contraseña inicial real— en balde.
**BUSINESS_VALUE**: Convierte una fricción percibida como "función rota" en una señal de upgrade.
**SOURCE_DRIVERS**: Audit F2 (HIGH/P1); `api/_lib/plans.js`; `docs/pricing-hypothesis.md` §2; `UpgradePrompt.tsx` ya existente.

**SCOPE**
- Descriptor de entitlement legible por la UI: qué features y límites tiene la organización activa.
- Señalización previa en "Usuarios de la organización" → pestaña Usuarios (`teamManagement`).
- Señalización previa en import multi-empleado (`multiEmployeeImport`) y en creación de empleados cuando `maxEmployees` está agotado.
- Estado deshabilitado con explicación, no oculto (la capacidad debe ser descubrible como función de pago).

**OUT_OF_SCOPE**
- Cualquier integración de facturación/Stripe. No existe y no se introduce.
- Cambiar precios o límites (hipótesis comercial no validada).
- Convertir el gate en client-side.

**DEPENDENCIES**: P0. Puede ejecutarse en paralelo a P1 si no se escribe `src/App.tsx` simultáneamente (regla one-writer).
**PREREQUISITES**: `src/lib/plans.ts` (espejo de display) y `UpgradePrompt.tsx`.
**RISKS**: (a) que el espejo de frontend se convierta de facto en autoridad — mitigado exigiendo que el backend siga rechazando aunque la UI permita; (b) ocultar en lugar de deshabilitar reduce descubribilidad comercial.
**DO_NOT_BREAK**: `requireFeature` / `requireWithinLimit` en backend; el 403 `PLAN_LIMIT` sigue existiendo y sigue probado; la ortogonalidad Plan↔Role (`plans.js` no referencia `auth.js`).
**AFFECTED_DOMAINS**: Entitlement, Team.
**AFFECTED_ROLES**: OWNER, ADMIN.
**AFFECTED_PLANS**: `free`, `personal`, `team`.
**AFFECTED_ROUTES**: `/app`, `/pricing`.
**AFFECTED_COMPONENTS**: `MembersModal.tsx`, `TeamImportModal.tsx`, `UpgradePrompt.tsx`, `SettingsModal.tsx`.
**AFFECTED_API**: `GET /api/organizations/current` (extender con entitlement derivado del plan, nunca con el plan enviado por el cliente).
**AFFECTED_DATABASE**: ninguno.
**AFFECTED_I18N**: claves de aviso previo ES/EN.
**AFFECTED_TESTS**: `MembersModal.test.tsx`, `UpgradePrompt.test.tsx`, `api/_lib/plans.test.js`.
**MIGRATION_IMPACT**: ninguno.
**ROLLBACK_STRATEGY**: revertir la UI deja el comportamiento actual (gate al submit), que sigue siendo seguro.
**OBSERVABILITY**: registrar en audit events los intentos rechazados por `PLAN_LIMIT` para medir demanda de upgrade.
**DOCUMENTATION_UPDATES**: `docs/pricing-hypothesis.md` §2 (UX de bloqueo actualizada).

### MICROTASKS — P2

---
**ID**: P2-M01
**TITLE**: Exponer un descriptor de entitlement en `GET /api/organizations/current`
**PURPOSE**: Que la UI sepa, antes de renderizar, qué puede la organización.
**SOURCE**: `api/_lib/plans.js`; Audit F2 causa raíz.
**PRECONDITIONS**: P0.
**FILES_LIKELY_AFFECTED**: `api/organizations/current.js`, `api/_lib/plans.js` (solo lectura), `src/lib/plans.ts`.
**API_IMPACT**: respuesta ampliada con `entitlement: { planId, features: {...}, limits: {...}, usage: { activeEmployees } }`.
**SECURITY_IMPACT**: el `planId` se lee de la fila de la organización resuelta por sesión, jamás de un header o body. El descriptor es informativo: no sustituye ninguna comprobación.
**TESTS_REQUIRED**: SÍ. **E2E_REQUIRED**: NO. **MANUAL_QA_REQUIRED**: NO.
**ACCEPTANCE_CRITERIA**:
- Given una organización en plan `personal`
- When se consulta `/api/organizations/current`
- Then `entitlement.features.teamManagement === false` y `entitlement.limits.maxEmployees === 1`
- And enviar `x-plan: team` o `{ plan: 'team' }` no altera la respuesta
- And un usuario sin membership en esa organización recibe 403.
**DO_NOT_BREAK**: el contrato existente de `GET/PATCH /api/organizations/current` (R2-M01).
**DEPENDENCIES**: ninguna. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P2-M02
**TITLE**: Aviso previo de plan Team en la pestaña Usuarios de `MembersModal`
**PURPOSE**: El finding F2 literal.
**SOURCE**: Audit F2 criterio de aceptación.
**PRECONDITIONS**: P2-M01.
**FILES_LIKELY_AFFECTED**: `src/components/shift-dashboard/MembersModal.tsx`, `src/lib/i18n.ts`.
**UI_IMPACT**: banner de plan en la cabecera de la pestaña + formulario deshabilitado con CTA "Actualizar a Team".
**ACCESSIBILITY_IMPACT**: el motivo del deshabilitado se asocia por `aria-describedby`, no solo por color; el banner no es `role="alert"` (no es un error, es un estado).
**ACCEPTANCE_CRITERIA**:
- Given una organización en plan Personal
- When un Propietario/Admin abre "Usuarios de la organización"
- Then ve inmediatamente que añadir un segundo usuario requiere plan Team, **antes** de escribir ningún dato
- And los campos de email, nombre, rol y contraseña inicial están deshabilitados con motivo accesible
- And la capacidad sigue siendo visible (deshabilitada, no oculta).
**DO_NOT_BREAK**: el control de plan server-side no se elimina ni se debilita; `addMember` sigue devolviendo 403 `PLAN_LIMIT` si se llama directamente.
**DEPENDENCIES**: P2-M01. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P2-M03
**TITLE**: Aviso previo de plan en import multi-empleado y en creación de empleado sobre el límite
**PURPOSE**: El mismo patrón en las otras dos superficies donde el backend deniega por plan.
**SOURCE**: `docs/pricing-hypothesis.md` §2 (cap de 1 empleado activo en `free`/`personal`); `TeamImportModal.tsx`.
**PRECONDITIONS**: P2-M01.
**FILES_LIKELY_AFFECTED**: `TeamImportModal.tsx`, `MembersModal.tsx`, `src/lib/i18n.ts`.
**ACCEPTANCE_CRITERIA**:
- Given una organización en plan Personal con 1 empleado activo
- When el usuario abre la importación de equipo
- Then ve antes de seleccionar fichero que la importación multiempleado requiere plan Team
- And en la lista de empleados detectados, las filas que exigirían crear un empleado nuevo aparecen marcadas con el motivo de plan y no como error genérico
- And la creación inline sigue rechazándose en backend con `PLAN_LIMIT`.
**DO_NOT_BREAK**: el flujo de import de equipo para organizaciones `team` no cambia.
**DEPENDENCIES**: P2-M01. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P2-M04
**TITLE**: Registrar los rechazos `PLAN_LIMIT` como eventos de auditoría de organización
**PURPOSE**: Medir demanda real de upgrade y dar contexto a soporte.
**SOURCE**: `db/migrations/0016_organization_audit_events.sql`.
**PRECONDITIONS**: P2-M01.
**FILES_LIKELY_AFFECTED**: `api/_lib/data.js`, `api/_lib/plans.js` (sin acoplar: el evento se emite en el caller, no dentro de `plans.js`).
**SECURITY_IMPACT**: el evento no registra la contraseña inicial ni ningún credential del formulario.
**ACCEPTANCE_CRITERIA**:
- Given un intento de `addMember` en plan Personal
- When el backend lanza `PlanLimitError`
- Then se registra un evento `PLAN_LIMIT_REJECTED` con feature, actor y timestamp
- And el payload del evento no contiene la contraseña ni el email introducidos.
**DO_NOT_BREAK**: la ortogonalidad Plan↔Role: `plans.js` sigue sin importar `auth.js` ni `data.js`.
**DEPENDENCIES**: P2-M01. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P2-M05
**TITLE**: E2E — el paywall se anuncia antes del formulario y el backend sigue rechazando
**PURPOSE**: Probar simultáneamente la mejora de UX y la no-degradación de seguridad.
**PRECONDITIONS**: P2-M02, P2-M03.
**FILES_LIKELY_AFFECTED**: nuevo `qa/e2e-acceptance/specs-local/plan-entitlement.spec.ts`.
**ACCEPTANCE_CRITERIA**:
- Given una organización Personal
- When se abre la pestaña Usuarios
- Then el aviso de Team es visible sin scroll y los inputs están `disabled`
- And una llamada directa a `POST /api/memberships` desde el mismo contexto devuelve 403 `PLAN_LIMIT`
- And en una organización `team` la misma pantalla no muestra aviso y el alta funciona.
**DEPENDENCIES**: P2-M02, P2-M03. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

### PHASE_P2_GATE

| Criterio | Exigencia |
|---|---|
| FUNCTIONAL | Aviso previo visible en las 3 superficies |
| DATA_INTEGRITY | N/A |
| AUTHORIZATION | Membership requerido para leer el entitlement |
| TENANT_ISOLATION | El entitlement se deriva de la organización de sesión, nunca de un id de cliente |
| SECURITY | **Obligatorio**: prueba explícita de que el backend sigue rechazando con 403 `PLAN_LIMIT` aunque la UI cambie |
| REGRESSION | Flujos de organización `team` sin cambio |
| ACCESSIBILITY | Motivo del estado deshabilitado expuesto por `aria-describedby`; contraste del banner en ambos temas |
| RESPONSIVE | Aviso visible sin scroll a 390px |
| I18N | ES/EN |
| UNIT/INTEGRATION/E2E | PASS |
| BUILD/LINT/TYPECHECK | PASS |
| DOCUMENTATION | `pricing-hypothesis.md` §2 actualizado |
| PLAN_ENTITLEMENT | Matriz plan × feature × superficie verificada |
| AOS_COMPLIANCE / WORKTREE_STATE | PASS / limpio |

**EVIDENCE_REQUIRED**: capturas de la pestaña Usuarios en `personal` y en `team`; respuesta cruda de `GET /api/organizations/current`; salida 403 de `POST /api/memberships` en `personal`; reporte Playwright; snapshot de accesibilidad del formulario deshabilitado.

**RESULTADOS**: `PASS` | `PASS_WITH_GAPS` | `FAIL` | `BLOCKED`.

---

## PHASE P3 — Business-Journey Dialog Replacement & Copy Correctness

**PHASE_ID**: P3
**PHASE_NAME**: Erradicación de diálogos nativos en journeys de negocio y corrección de copy
**GOAL**: Que ninguna decisión o resultado de negocio se comunique mediante `window.confirm` /
`window.alert`, y que ningún estado vacío mienta sobre lo que el usuario está mirando.
**WHY_NOW**: F1 resolvió el journey núcleo; quedan **18 usos** de diálogos nativos en 7 superficies
de negocio (verificado en HEAD), que rompen tema visual, contrato de modales y consistencia de copy.
F3 es un quick win de riesgo nulo que corrige un mensaje semánticamente falso.
**USER_VALUE**: Coherencia visual y de idioma; decisiones destructivas (desactivar área, eliminar
empleado, borrar importación) presentadas con el peso que merecen.
**BUSINESS_VALUE**: Cumplimiento del `MODAL_CONTRACT` propio; menos desconfianza en la copy.
**SOURCE_DRIVERS**: Audit F1 (patrón repetido, 8+ usos citados), Audit F3 (MEDIUM/P2 quick win).

**SCOPE** — inventario verificado en `36e7857`:

| Fichero | Líneas | Naturaleza |
|---|---|---|
| `LegalPage.tsx` | 710 | reset de datos (destructiva) |
| `scheduling/WeeklyPlanner.tsx` | 393 | borrar asignación (destructiva) |
| `TeamImportModal.tsx` | 490, 527 | crear/reactivar empleado |
| `AreasModal.tsx` | 112, 124 | desactivar área / quitar responsable |
| `SettingsModal.tsx` | 642 | eliminar tipo de turno |
| `MembersModal.tsx` | 429, 462, 476 | desactivar/eliminar empleado, oferta de desactivación |
| `ImportHistoryModal.tsx` | 167 | eliminar importación (destructiva, borra shifts) |
| `src/App.tsx` | 401, 620, 633, 636, 656, 843, 915, 1007, 1038, 1040, 1071, 1074 | onboarding, conflictos, guardado, área, ya importado, futuros |
| `MembersModal.tsx` | 1100, 1365, 1465 | copy `orgSelector.noResults` reutilizada indebidamente |

**OUT_OF_SCOPE**: los diálogos del journey de importación individual ya resueltos en P1;
rediseño de los modales afectados más allá de sustituir el canal.

**DEPENDENCIES**: P1 (para reutilizar el patrón de confirmación establecido). Independiente de P2 y P4.
**PREREQUISITES**: `ModalShell` con modo `blocking`.
**RISKS**: (a) alto número de superficies → riesgo de regresión difusa; (b) una confirmación asíncrona cambia el control de flujo de funciones hoy síncronas (`if (!window.confirm(...)) return;` → promesa/estado), lo que puede introducir condiciones de carrera de doble envío.
**DO_NOT_BREAK**: toda acción destructiva sigue exigiendo confirmación explícita; ninguna se
vuelve de un clic. La protección "último ADMIN no se degrada ni se elimina" y
`EMPLOYEE_HAS_HISTORY` se conservan. El soft-delete de importaciones y el hard-delete de sus
shifts por `import_id` no cambian.
**AFFECTED_DOMAINS**: Employee, Area, Settings, Scheduling, History, Legal.
**AFFECTED_ROLES**: OWNER, ADMIN, PLANNER.
**AFFECTED_PLANS**: todos.
**AFFECTED_ROUTES**: `/app`, `/app/schedule`, legal.
**AFFECTED_COMPONENTS**: los 8 ficheros del inventario.
**AFFECTED_API**: ninguna.
**AFFECTED_DATABASE**: ninguno.
**AFFECTED_I18N**: nuevas claves `members.noUsersFound`, `members.noEmployeesFound` y equivalentes; claves de confirmación reetiquetadas con acciones nombradas.
**AFFECTED_TESTS**: los `.test.tsx` de cada componente.
**MIGRATION_IMPACT**: ninguno.
**ROLLBACK_STRATEGY**: por microtarea (una superficie por commit), reversible individualmente.
**OBSERVABILITY**: ninguna nueva.
**DOCUMENTATION_UPDATES**: `docs/standards/MODAL_CONTRACT.md` — nota de aplicación al patrón de confirmación destructiva.

### MICROTASKS — P3

---
**ID**: P3-M01
**TITLE**: Corregir la copy de estados vacíos en `MembersModal` (quick win F3)
**PURPOSE**: Tres estados vacíos que listan usuarios/empleados muestran "No se encontraron organizaciones".
**SOURCE**: Audit F3 MEASURED_CODE (`src/lib/i18n.ts:484`; `MembersModal.tsx:1100,:1365,:1465`).
**PRECONDITIONS**: ninguna (puede adelantarse a P1 si se ejecuta como quick win aislado).
**FILES_LIKELY_AFFECTED**: `src/lib/i18n.ts`, `src/components/shift-dashboard/MembersModal.tsx`.
**I18N_IMPACT**: claves nuevas en ES y EN (`members.noUsersFound`, `members.noEmployeesFound`, `members.noLinkCandidates` o equivalentes según el punto exacto).
**ACCEPTANCE_CRITERIA**:
- Given la pestaña Usuarios sin resultados de búsqueda
- When el usuario mira el estado vacío
- Then lee un mensaje sobre usuarios/empleados, nunca sobre organizaciones
- And `grep -n "orgSelector.noResults" src/components/shift-dashboard/MembersModal.tsx` devuelve 0 resultados
- And `orgSelector.noResults` sigue existiendo y sigue usándose en `OrgSelectorModal`.
**DO_NOT_BREAK**: `OrgSelectorModal` y su copy.
**DEPENDENCIES**: ninguna. **RISK**: NULO. **ESTIMATED_COMPLEXITY**: XS.

---
**ID**: P3-M02
**TITLE**: Primitiva de confirmación destructiva sobre `ModalShell`
**PURPOSE**: Un único componente reutilizable evita 18 implementaciones divergentes.
**SOURCE**: Audit F1 (patrón); `docs/standards/MODAL_CONTRACT.md`.
**PRECONDITIONS**: P1-M05 (patrón establecido).
**FILES_LIKELY_AFFECTED**: nuevo `src/components/ui/ConfirmDialog.tsx` + test.
**UI_IMPACT**: acciones nombradas por su efecto ("Desactivar área", "Eliminar importación"), nunca "Aceptar/Cancelar".
**ACCESSIBILITY_IMPACT**: `role="alertdialog"` para destructivas, foco inicial en la acción segura, ESC = cancelar, retorno de foco al disparador.
**SECURITY_IMPACT**: la confirmación es UX; la autorización sigue en backend.
**ACCEPTANCE_CRITERIA**:
- Given una acción destructiva
- When se solicita confirmación
- Then se renderiza un `alertdialog` con título, consecuencia explícita, acción destructiva nombrada y cancelación
- And ESC y click-outside cancelan, nunca confirman
- And el foco inicial recae sobre la acción no destructiva
- And una segunda pulsación durante la operación no dispara una segunda llamada.
**DO_NOT_BREAK**: `ModalShell` no se modifica en su contrato; `ConfirmDialog` lo consume.
**DEPENDENCIES**: P1-M05. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P3-M03
**TITLE**: Migrar `ImportHistoryModal:167` (eliminar importación)
**PURPOSE**: Es la confirmación más destructiva del producto: borra físicamente los shifts creados por esa importación.
**PRECONDITIONS**: P3-M02.
**FILES_LIKELY_AFFECTED**: `ImportHistoryModal.tsx`, `ImportHistoryModal.test.tsx`.
**ACCEPTANCE_CRITERIA**:
- Given una importación con N turnos creados
- When el usuario pulsa eliminar
- Then el `alertdialog` indica explícitamente que se eliminarán N turnos del calendario y que la entrada del histórico quedará como "Eliminada"
- And cancelar no realiza ninguna llamada
- And confirmar realiza exactamente una llamada `DELETE /api/imports`.
**DO_NOT_BREAK**: los turnos manuales (`import_id IS NULL`) nunca se tocan; el soft-delete de la fila del histórico se conserva.
**DEPENDENCIES**: P3-M02. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P3-M04
**TITLE**: Migrar `MembersModal:429,:462,:476` (desactivar/eliminar empleado)
**PURPOSE**: Incluye la oferta condicional "tiene historial, ¿desactivar en su lugar?", hoy un `confirm` anidado dentro de otro.
**PRECONDITIONS**: P3-M02.
**FILES_LIKELY_AFFECTED**: `MembersModal.tsx`, `MembersModal.test.tsx`.
**ACCEPTANCE_CRITERIA**:
- Given un empleado con historial de turnos
- When se intenta eliminar
- Then un único diálogo explica que no puede eliminarse y ofrece desactivar como alternativa nombrada
- And nunca se encadenan dos diálogos
- And el backend sigue devolviendo `EMPLOYEE_HAS_HISTORY` si se llama directamente
- And la protección `LAST_ADMIN` sigue impidiendo eliminar el empleado vinculado al último ADMIN.
**DO_NOT_BREAK**: `LAST_ADMIN`, `EMPLOYEE_HAS_HISTORY`, y el desvinculado a `user_id NULL` al remover membership.
**DEPENDENCIES**: P3-M02. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P3-M05
**TITLE**: Migrar `AreasModal:112,:124` y `SettingsModal:642`
**PURPOSE**: Desactivar área, quitar responsable, eliminar tipo de turno.
**PRECONDITIONS**: P3-M02.
**FILES_LIKELY_AFFECTED**: `AreasModal.tsx`, `SettingsModal.tsx` + tests.
**ACCEPTANCE_CRITERIA**:
- Given un área con empleados asignados
- When se intenta desactivar
- Then el diálogo indica cuántos empleados quedan afectados antes de confirmar
- And eliminar un tipo de turno en uso indica cuántos turnos lo referencian
- And ninguna de las tres acciones usa diálogos nativos.
**DO_NOT_BREAK**: `APPLICATION_STRUCTURE_AREAS_OPTIONAL.md` — las áreas siguen siendo opcionales; una organización sin áreas no ve fricción nueva.
**DEPENDENCIES**: P3-M02. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P3-M06
**TITLE**: Migrar `WeeklyPlanner:393` (borrar asignación) y `LegalPage:710` (reset de datos)
**PURPOSE**: Dos superficies destructivas fuera del dashboard.
**PRECONDITIONS**: P3-M02.
**FILES_LIKELY_AFFECTED**: `WeeklyPlanner.tsx`, `LegalPage.tsx` + tests.
**ACCEPTANCE_CRITERIA**:
- Given un borrador editable de planificación
- When se borra una asignación
- Then la confirmación identifica empleado, fecha y horario concretos
- And en `LegalPage` el reset de datos exige una confirmación cuya consecuencia se describe explícitamente
- And una versión publicada sigue siendo inmutable: la acción de borrado no aparece.
**DO_NOT_BREAK**: el bloqueo de versiones publicadas (R3-M11); el modo invitado local-first sigue reseteando solo `localStorage`.
**DEPENDENCIES**: P3-M02. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P3-M07
**TITLE**: Migrar `TeamImportModal:490,:527` conservando el patrón de decisión por lote
**PURPOSE**: El propio código anota que la intención es decidir por lote, no un `confirm` por fila.
**SOURCE**: comentario en `TeamImportModal.tsx:542`.
**PRECONDITIONS**: P3-M02.
**FILES_LIKELY_AFFECTED**: `TeamImportModal.tsx`, `TeamImportModal.test.tsx`.
**ACCEPTANCE_CRITERIA**:
- Given un roster con varias filas que requieren alta o reactivación
- When el usuario decide
- Then existe un único punto de confirmación por lote con el desglose por categoría (reconocidos / ambiguos / nuevos / inactivos)
- And no se abre un diálogo por fila.
**DO_NOT_BREAK**: el modelo de matching recognized/ambiguous/new; el desglose de 5 categorías de la etapa Compare (R1-M05).
**DEPENDENCIES**: P3-M02. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P3-M08
**TITLE**: Migrar los `window.alert` restantes de `src/App.tsx` a feedback no modal persistente
**PURPOSE**: Conflictos de guardado, "ya importado", confirmación de futuros, fallos de guardado y onboarding fallido.
**SOURCE**: `src/App.tsx:401,620,633,636,656,843,915,1007,1038,1040,1071,1074`.
**PRECONDITIONS**: P1 completo, P3-M02.
**FILES_LIKELY_AFFECTED**: `src/App.tsx`, `src/lib/i18n.ts`.
**UI_IMPACT**: los **resultados** (éxito/fracaso de guardado, "ya importado") pasan a una región de estado persistente con `role="status"` / `role="alert"` según severidad; las **decisiones** (`:843` área mismatch) pasan a `ConfirmDialog`.
**ACCEPTANCE_CRITERIA**:
- Given cualquiera de los 12 puntos listados
- When se produce el evento
- Then el usuario recibe feedback dentro del producto, anunciado a lectores de pantalla, que no desaparece automáticamente en el caso de error
- And `grep -n "window.alert\|window.confirm" src/App.tsx` devuelve 0 resultados
- And el mismatch de área sigue exigiendo decisión explícita "importar igualmente" o cancelar.
**DO_NOT_BREAK**: el mes/año seleccionado por el usuario sigue siendo autoritativo y `MONTH_MISMATCH` sigue siendo bloqueante con elección explícita.
**DEPENDENCIES**: P1, P3-M02. **RISK**: ALTO (fichero grande, muchos caminos). **ESTIMATED_COMPLEXITY**: XL.

---
**ID**: P3-M09
**TITLE**: Guardia de regresión — prohibir diálogos nativos en journeys de negocio
**PURPOSE**: Evitar que el patrón vuelva a introducirse.
**PRECONDITIONS**: P3-M03..M08.
**FILES_LIKELY_AFFECTED**: `eslint.config.js` (regla `no-restricted-globals`/`no-restricted-properties` acotada a `src/`), o test de repositorio.
**ACCEPTANCE_CRITERIA**:
- Given un desarrollador introduce `window.confirm` en `src/components/` o `src/App.tsx`
- When ejecuta `npm run lint`
- Then el lint falla con un mensaje que apunta a `ConfirmDialog`
- And existe un mecanismo de excepción documentado y explícito para casos legítimos fuera de journeys de negocio, si los hubiera.
**DO_NOT_BREAK**: `--max-warnings 0` sigue vigente; la regla no debe generar warnings en código existente ya migrado.
**DEPENDENCIES**: P3-M03..M08. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

### PHASE_P3_GATE

| Criterio | Exigencia |
|---|---|
| FUNCTIONAL | Las 18 superficies migradas conservan su decisión y su efecto |
| DATA_INTEGRITY | Ninguna acción destructiva cambia de alcance |
| AUTHORIZATION | Sin cambios; re-verificada por regresión |
| TENANT_ISOLATION | Sin cambios |
| SECURITY | Ninguna acción destructiva se vuelve de un clic; doble envío imposible |
| REGRESSION | Suites de los 8 componentes PASS |
| ACCESSIBILITY | `alertdialog` con foco inicial seguro, ESC=cancelar, retorno de foco; snapshot axe por superficie |
| RESPONSIVE | Diálogos usables a 390px sin recorte de acciones |
| I18N | Claves nuevas ES/EN; 0 usos de `orgSelector.noResults` fuera del selector de organizaciones |
| UNIT/INTEGRATION/E2E | PASS |
| BUILD/LINT/TYPECHECK | PASS, incluyendo la nueva regla de lint |
| DOCUMENTATION | `MODAL_CONTRACT.md` con la nota de confirmación destructiva |
| ERROR_RECOVERY | Cancelar nunca ejecuta; confirmar ejecuta exactamente una vez |
| BROWSER_QA | Captura de cada diálogo migrado, dark/light |
| AOS_COMPLIANCE / WORKTREE_STATE | PASS / limpio |

**EVIDENCE_REQUIRED**: `grep -rn "window.confirm\|window.alert" src/` con 0 resultados en journeys de negocio; salida de lint con la regla activa; capturas por superficie; snapshots de accesibilidad; reporte de tests por componente.

**RESULTADOS**: `PASS` | `PASS_WITH_GAPS` (admisible si una superficie de bajo tráfico —p. ej. `LegalPage`— queda pendiente y se documenta) | `FAIL` | `BLOCKED`.

---

## PHASE P4 — Accessibility & Responsive Hardening

**PHASE_ID**: P4
**PHASE_NAME**: Accesibilidad de controles confirmados y responsive real
**GOAL**: Cerrar los defectos de accesibilidad y responsive **confirmados por evidencia**, sin
perseguir falsos positivos de escáner.
**WHY_NOW**: F4 y F6 son MEDIUM/P2 con evidencia de navegador y de código; F7 y F9 son LOW pero
de coste casi nulo. La auditoría dejó constancia de que ~30 candidatos de "input sin label" eran
falsos positivos: esta fase debe **no** reintroducirlos como trabajo.
**USER_VALUE**: Un usuario de lector de pantalla puede distinguir qué color pertenece a qué tipo
de turno; un usuario móvil descubre que la tabla y las métricas continúan fuera del viewport.
**BUSINESS_VALUE**: Cumplimiento del contrato premium Anclora; reducción de riesgo de accesibilidad.
**SOURCE_DRIVERS**: Audit F4 (MEDIUM/P2), F6 (MEDIUM/P2), F7 (LOW/P3), F9 (LOW/P4, confianza baja).

**SCOPE**
- `SettingsModal.tsx:696` y `:743` — `<input type="color">` sin nombre accesible (verificado en HEAD).
- Tabla accesible del planificador y `StatsBar` en 390×844 — contenedor `overflow-x:auto` explícito con affordance visual.
- Solapamiento del panel inline "Añadir turno" con el borde inferior de la tabla en móvil.
- Navegación del landing por debajo de ~480px.
- Validación inline del campo "Nombre del empleado" en el onboarding.

**OUT_OF_SCOPE**
- Los ~30 candidatos de "input sin label" descartados manualmente por la auditoría. Reabrirlos exige nueva evidencia de navegador, no un regex.
- Rediseño del planificador o del dashboard.

**DEPENDENCIES**: P0. Independiente de P1, P2 y P3 (cambios disjuntos aunque compartan ficheros con P3 — exige merge secuencial).
**PREREQUISITES**: acceso a navegador real para verificar; `qa/e2e-acceptance/specs-responsive/`.
**RISKS**: (a) un `overflow-x:auto` mal colocado rompe el sticky header o la primera columna; (b) el menú hamburguesa del landing puede degradar el CTA principal si se implementa sin medir.
**DO_NOT_BREAK**: la tabla accesible del planificador conserva su `aria-label` descriptivo y su
alternancia con la cuadrícula (confirmado como fortaleza por la auditoría); el contraste
correcto en light/dark; el patrón `aria-label={row.name}` ya correcto de `TeamImportModal:1032`.
**AFFECTED_DOMAINS**: Settings, Scheduling, Dashboard, Landing, Onboarding.
**AFFECTED_ROLES**: todos.
**AFFECTED_PLANS**: todos.
**AFFECTED_ROUTES**: `/`, `/app`, `/app/schedule`.
**AFFECTED_COMPONENTS**: `SettingsModal.tsx`, `AccessibleScheduleTable.tsx`, `WeeklyPlanner.tsx`, `StatsBar.tsx`, `LandingPage.tsx`, `OnboardingModal.tsx`/`OnboardingChoiceModal.tsx`.
**AFFECTED_API**: ninguna. **AFFECTED_DATABASE**: ninguno.
**AFFECTED_I18N**: `settings.typeColorLabel`, mensajes de validación del onboarding, etiqueta del menú móvil.
**AFFECTED_TESTS**: `SettingsModal.test.tsx`, `WeeklyPlanner.test.tsx`, `LandingPage.test.tsx`, `OnboardingChoiceModal.test.tsx`, specs responsive.
**MIGRATION_IMPACT**: ninguno.
**ROLLBACK_STRATEGY**: por microtarea; todos los cambios son locales a un componente.
**OBSERVABILITY**: ninguna nueva.
**DOCUMENTATION_UPDATES**: nota en `docs/standards/` sobre el patrón de contenedor con affordance de scroll.

### MICROTASKS — P4

---
**ID**: P4-M01
**TITLE**: Nombre accesible para los selectores de color de tipos de turno
**SOURCE**: Audit F4 MEASURED_CODE (`SettingsModal.tsx:696`, `:743`).
**PRECONDITIONS**: ninguna.
**FILES_LIKELY_AFFECTED**: `SettingsModal.tsx`, `src/lib/i18n.ts`.
**ACCESSIBILITY_IMPACT**: es el objeto de la microtarea.
**ACCEPTANCE_CRITERIA**:
- Given cuatro filas de tipo de turno visibles
- When un lector de pantalla recorre los selectores de color
- Then anuncia el nombre del tipo al que pertenece cada uno (p. ej. "Color de Regular")
- And el árbol de accesibilidad del navegador confirma un nombre accesible único por control
- And el patrón usado es análogo al ya correcto de `TeamImportModal.tsx:1032`.
**DO_NOT_BREAK**: el valor y el comportamiento del control de color no cambian.
**DEPENDENCIES**: ninguna. **RISK**: NULO. **ESTIMATED_COMPLEXITY**: XS.

---
**ID**: P4-M02
**TITLE**: Contenedor de scroll explícito con affordance para la tabla accesible del planificador
**SOURCE**: Audit F6 (MEASURED_BROWSER, figura F6-A).
**PRECONDITIONS**: ninguna.
**FILES_LIKELY_AFFECTED**: `AccessibleScheduleTable.tsx`, `src/index.css`.
**ACCEPTANCE_CRITERIA**:
- Given el planificador semanal a 390×844
- When la columna "Horario" no cabe
- Then la tabla vive en un contenedor con `overflow-x:auto` y una señal visual (sombra/gradiente) de contenido adicional
- And el body de la página **no** hace scroll horizontal
- And el `aria-label` descriptivo de la tabla se conserva
- And el contenedor es alcanzable por teclado (`tabindex="0"` con nombre accesible) para que un usuario de teclado pueda desplazarlo.
**DO_NOT_BREAK**: la alternancia tabla/cuadrícula; el sticky header si existe.
**DEPENDENCIES**: ninguna. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P4-M03
**TITLE**: Contenedor de scroll con affordance para la barra de estadísticas
**SOURCE**: Audit F6 (figura F6-B — se corta tras "Regular"/"Libre").
**PRECONDITIONS**: ninguna.
**FILES_LIKELY_AFFECTED**: `StatsBar.tsx`, `src/index.css`.
**ACCEPTANCE_CRITERIA**:
- Given el dashboard a 390×844
- When la barra Propios/Empresa · Mes/Año · Regular/Libre/Vacaciones/Extras no cabe
- Then todas las métricas son alcanzables por scroll horizontal con affordance visible
- And ninguna métrica queda inaccesible por recorte silencioso.
**DEPENDENCIES**: ninguna. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P4-M04
**TITLE**: Resolver el solapamiento del panel inline "Añadir turno" en móvil
**SOURCE**: Audit F6 (2.ª parte del comportamiento observado).
**PRECONDITIONS**: P4-M02.
**FILES_LIKELY_AFFECTED**: `WeeklyPlanner.tsx`, `ScheduleAssignmentEditor.tsx`.
**ACCEPTANCE_CRITERIA**:
- Given el planificador a 390×844 con el panel "Añadir turno" abierto
- When el usuario lo usa
- Then el panel no oculta la última fila de la tabla
- And al cerrarlo, el foco vuelve al control que lo abrió.
**DEPENDENCIES**: P4-M02. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P4-M05
**TITLE**: Navegación colapsable del landing por debajo de ~480px
**SOURCE**: Audit F7 (LOW/P3).
**PRECONDITIONS**: ninguna.
**FILES_LIKELY_AFFECTED**: `src/pages/LandingPage.tsx`, `LandingPage.test.tsx`.
**ACCESSIBILITY_IMPACT**: el disparador necesita nombre accesible, `aria-expanded` y `aria-controls`; el menú abierto atrapa foco o cierra con ESC.
**ACCEPTANCE_CRITERIA**:
- Given el landing a 390px
- When se carga la página
- Then el titular y "Empezar gratis" son visibles sin scroll
- And los enlaces secundarios, tema, idioma e "Iniciar sesión" están accesibles tras un disparador con `aria-expanded`
- And en ≥480px la navegación se comporta exactamente como hoy.
**DO_NOT_BREAK**: la jerarquía del landing en desktop, confirmada como fortaleza.
**DEPENDENCIES**: ninguna. **RISK**: MEDIO (superficie comercial). **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P4-M06
**TITLE**: Validación inline del campo "Nombre del empleado" en el onboarding
**SOURCE**: Audit F9 (LOW/P4, confianza baja deliberada).
**PRECONDITIONS**: ninguna.
**FILES_LIKELY_AFFECTED**: `OnboardingChoiceModal.tsx`, `OnboardingModal.tsx`, `src/lib/i18n.ts`.
**ACCEPTANCE_CRITERIA**:
- Given el paso "¿Cómo vas a usar ShiftImport?" con "También trabajaré como empleado" marcado
- When se intenta crear la organización sin rellenar el nombre del empleado
- Then aparece un mensaje de validación junto al campo, asociado por `aria-describedby`, y el foco se mueve al campo
- And el envío no se produce
- And **antes** de implementar, la microtarea debe reproducir el fallo una vez para descartar la condición de carrera del entorno de automatización que la auditoría no descartó; si el fallo no se reproduce, la microtarea se cierra como `NOT_REPRODUCIBLE` con evidencia y no se introduce cambio.
**DO_NOT_BREAK**: la separación OWNER↔Employee introducida en `3ff90b2` — marcar el checkbox sigue siendo la **única** vía de crear un Employee para el propietario; nunca implícita.
**DEPENDENCIES**: ninguna. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P4-M07
**TITLE**: Ampliar la suite responsive con los breakpoints y estados de la auditoría
**PURPOSE**: Convertir las capturas de la auditoría en regresión automatizada.
**PRECONDITIONS**: P4-M02..M05.
**FILES_LIKELY_AFFECTED**: `qa/e2e-acceptance/specs-responsive/`.
**ACCEPTANCE_CRITERIA**:
- Given los viewports 1440, 834, 390 portrait y 844×390 landscape
- When se ejecuta la suite responsive
- Then ninguna página produce scroll horizontal en `body`
- And la tabla del planificador y la barra de estadísticas exponen su contenedor de scroll
- And el landing a 390px muestra el CTA principal por encima del pliegue.
**DEPENDENCIES**: P4-M02..M05. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

### PHASE_P4_GATE

| Criterio | Exigencia |
|---|---|
| FUNCTIONAL | Ninguna funcionalidad alterada |
| ACCESSIBILITY | **Obligatorio**: árbol de accesibilidad del navegador (no regex) confirma nombre único por selector de color; `alertdialog`/`aria-expanded` correctos; contenedores de scroll alcanzables por teclado |
| RESPONSIVE | **Obligatorio**: 4 viewports sin scroll horizontal de `body` |
| I18N | Claves nuevas ES/EN |
| REGRESSION | Suites de los componentes tocados |
| UNIT/INTEGRATION/E2E | PASS + suite responsive ampliada |
| BUILD/LINT/TYPECHECK | PASS |
| DOCUMENTATION | Patrón de affordance de scroll documentado |
| BROWSER_QA | Capturas antes/después de F4, F6-A, F6-B, F7 |
| AOS_COMPLIANCE / WORKTREE_STATE | PASS / limpio |
| TENANT_ISOLATION / AUTHORIZATION / SECURITY / DATA_INTEGRITY | N/A, declarado explícitamente y verificado por ausencia de cambios en `api/` y `db/` |

**EVIDENCE_REQUIRED**: snapshot del árbol de accesibilidad con los 4 selectores de color nombrados; capturas antes/después a 390px de tabla y `StatsBar`; reporte de la suite responsive; `git diff --stat` mostrando 0 cambios en `api/` y `db/`.

**RESULTADOS**: `PASS` | `PASS_WITH_GAPS` (admisible si F9 resulta `NOT_REPRODUCIBLE`) | `FAIL` | `BLOCKED`.

---

## PHASE P5 — Role Reality Verification & Employee Self-Service

**PHASE_ID**: P5
**PHASE_NAME**: Verificación real de ADMIN/PLANNER/EMPLOYEE y contrato de autoservicio del empleado
**GOAL**: Cerrar el gap más material de la auditoría —tres de los cuatro roles nunca se
verificaron en navegador— y definir con precisión qué puede hacer un EMPLOYEE con una importación.
**WHY_NOW**: La auditoría se declaró `PASS_WITH_GAPS` principalmente por esto. Además, este
análisis ha verificado que `createImport` **sí** permite a un EMPLOYEE registrar un import bajo
scope `SELF` (`api/_lib/data.js:1502`); D-03 y D-04 ya fijan el contrato que debe verificarse.
**USER_VALUE**: Un empleado puede gestionar sus propios turnos con garantías; un planner opera sin
temor a salirse de su área.
**BUSINESS_VALUE**: Habilita el discurso B2B2E; reduce carga de trabajo del administrador.
**SOURCE_DRIVERS**: Audit §12 `PLAN_BLOCKED`; Audit §03 (3 de 4 roles solo `MEASURED_CODE`); `api/_lib/auth.js` `resolveAccessScope`; decisiones D-03/D-04/D-05 de la SPEC.

**SCOPE**
- Provisión de una organización de prueba en plan `team` para QA (sin compra real; vía onboarding de empresa, que ya persiste `team` incondicionalmente como grant pre-billing).
- Verificación en navegador real de ADMIN, PLANNER y EMPLOYEE.
- Contrato explícito de autoservicio del EMPLOYEE en importación.
- Matriz de roles publicada y verificada contra código, UI, tests y docs.

**OUT_OF_SCOPE**
- Cambiar el modelo de roles. Los 4 roles y 3 scopes están cerrados en R2 con Gate PASS.
- Implementar facturación para conseguir un plan Team.

**DEPENDENCIES**: P0, P2 (la señalización de plan define cómo se llega a una org Team).
**PREREQUISITES**: decisiones D-03, D-04 y D-05 aprobadas y registradas en `sdd/decisions/`.
**RISKS**: (a) esta fase puede **descubrir** defectos de autorización no conocidos, lo que la convertiría en generadora de trabajo no planificado; (b) el grant `team` sin pago es una decisión comercial que no debe normalizarse.
**DO_NOT_BREAK**: `resolveAccessScope` y su regla de que el cliente no puede ensanchar el scope;
el bloqueo "Cuenta no vinculada" para EMPLOYEE sin employee vinculado; la separación
OWNER↔Employee de `3ff90b2`; la elegibilidad "solo empleados ACTIVE" de `36e7857`.
**AFFECTED_DOMAINS**: Auth, Role, Employee, Import, Scheduling.
**AFFECTED_ROLES**: ADMIN, PLANNER, EMPLOYEE (OWNER como control).
**AFFECTED_PLANS**: `team` (para poder tener 2+ usuarios).
**AFFECTED_ROUTES**: `/app`, `/app/schedule`, portal de empleado.
**AFFECTED_COMPONENTS**: `PortalShell.tsx`, `WeeklyPlanner.tsx`, `MembersModal.tsx`, `ImportModal.tsx`.
**AFFECTED_API**: verificación de todos los endpoints; posibles correcciones puntuales.
**AFFECTED_DATABASE**: ninguno previsto.
**AFFECTED_I18N**: mensajes de bloqueo por rol, si se descubren huecos.
**AFFECTED_TESTS**: `api/_lib/scope.test.js`, `qa/e2e-acceptance/specs-local/scheduling-authz.spec.ts`, `cross-tenant-isolation.spec.ts`, nuevo `role-matrix.spec.ts`.
**MIGRATION_IMPACT**: ninguno previsto.
**ROLLBACK_STRATEGY**: la fase es mayoritariamente verificación; las correcciones que genere se revierten individualmente.
**OBSERVABILITY**: la matriz de roles verificada se archiva como artefacto de release.
**DOCUMENTATION_UPDATES**: `docs/fase1-multitenant.md` (ya corregido en P0) recibe la matriz **verificada**, no solo la diseñada.

### MICROTASKS — P5

---
**ID**: P5-M01
**TITLE**: Provisionar una organización de QA en plan `team` sin compra real
**PURPOSE**: Desbloquear la verificación de tres roles, usando la ruta Team de QA ya aprobada.
**SOURCE**: Audit §12 `PLAN_BLOCKED`; `docs/pricing-hypothesis.md` §2 (onboarding de empresa persiste `team` incondicionalmente — grant pre-billing).
**PRECONDITIONS**: P2 Gate.
**FILES_LIKELY_AFFECTED**: `qa/e2e-acceptance/local-setup.ts`, `db/seed-dev.mjs`.
**SECURITY_IMPACT**: la ruta de provisión debe ser la de onboarding de empresa existente, **no** un endpoint nuevo que permita elevar el plan de una organización arbitraria.
**ACCEPTANCE_CRITERIA**:
- Given un entorno de desarrollo
- When se ejecuta el setup de QA
- Then existe una organización `team` con OWNER + ADMIN + PLANNER (con `scoped_area_id`) + EMPLOYEE (con employee vinculado y activo)
- And no se ha introducido ningún endpoint capaz de cambiar el plan de una organización desde el cliente
- And la organización de QA está claramente identificada como tal y aislada de cualquier dato real.
**DO_NOT_BREAK**: la ausencia de billing sigue siendo el estado declarado; no se simula un pago.
**DEPENDENCIES**: P2. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5-M02
**TITLE**: Verificar ADMIN en navegador real
**PURPOSE**: Convertir `MEASURED_CODE` en `MEASURED_BROWSER` para ADMIN.
**PRECONDITIONS**: P5-M01.
**ACCEPTANCE_CRITERIA**:
- Given una sesión ADMIN en la organización de QA
- When recorre gestión de usuarios, empleados, áreas, tipos de turno, importación y reset operativo
- Then cada capacidad declarada en la matriz se comporta como la matriz dice
- And cada capacidad **no** declarada está ausente o deshabilitada con motivo, y su llamada directa a la API devuelve 403
- And se documenta cualquier divergencia como bloqueador de este Gate.
**DO_NOT_BREAK**: `LAST_ADMIN`; la prohibición de auto-eliminarse.
**DEPENDENCIES**: P5-M01. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P5-M03
**TITLE**: Verificar PLANNER en navegador real, con y sin `scoped_area_id`
**PURPOSE**: PLANNER es el rol con la regla de scope más sutil: su alcance depende server-side de
la existencia de áreas activas (D-05).
**SOURCE**: `api/_lib/auth.js` `resolveAccessScope` (rama PLANNER).
**PRECONDITIONS**: P5-M01.
**ACCEPTANCE_CRITERIA**:
- Given un PLANNER con `scoped_area_id` asignado
- When intenta crear o editar un borrador fuera de su área
- Then recibe 403 y la UI no ofrece la acción
- And un PLANNER **sin** área asignada opera a nivel organización sólo si no hay áreas activas; con
  áreas activas queda bloqueado con `SCOPE_UNAVAILABLE`, conforme a D-05
- And un PLANNER nunca puede gestionar usuarios ni roles.
**DO_NOT_BREAK**: R3-M13 (authorization scope) y sus tests.
**DEPENDENCIES**: P5-M01, decisión D-05. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P5-M04
**TITLE**: Verificar EMPLOYEE en navegador real, incluido el estado "Cuenta no vinculada"
**PURPOSE**: EMPLOYEE es el rol con más superficie propia (portal) y el que más riesgo de fuga tendría.
**PRECONDITIONS**: P5-M01.
**ACCEPTANCE_CRITERIA**:
- Given una sesión EMPLOYEE con employee vinculado y activo
- When recorre Hoy / Mi semana / Solicitudes / Más
- Then solo ve sus propios turnos publicados
- And no puede alcanzar `/app/schedule` (redirige al portal, comportamiento ya cubierto en `867858d`)
- And un EMPLOYEE **sin** employee vinculado ve el estado bloqueante "Cuenta no vinculada" sin datos
- And un EMPLOYEE cuyo employee está `inactive` no puede recibir turnos.
**DO_NOT_BREAK**: la elegibilidad de empleado activo verificada en `36e7857`.
**DEPENDENCIES**: P5-M01. **RISK**: ALTO (superficie de fuga). **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P5-M05
**TITLE**: Definir e implementar el contrato de importación del EMPLOYEE
**PURPOSE**: Verificar el contrato aprobado de self-import bajo scope `SELF`: filas propias,
filas ajenas, identidad ausente/ambigua y exclusión de fechas futuras.
**SOURCE**: `api/_lib/data.js:1500-1513` (createImport con `SELF`), `:1686-1700` (listShifts SELF); decisión D-04 de la SPEC.
**PRECONDITIONS**: D-03 y D-04 aprobadas; P5-M04.
**FILES_LIKELY_AFFECTED**: `src/App.tsx` (resolución de empleado), `ImportModal.tsx`, `api/_lib/data.js`, `docs/product/` (nuevo `EMPLOYEE_SELF_SERVICE_CONTRACT.md`).
**SECURITY_IMPACT**: máximo — es el punto donde un fichero multiempleado podría filtrar o escribir datos ajenos.
**ACCEPTANCE_CRITERIA**:
- Given un EMPLOYEE importa un fichero que contiene turnos de varias personas
- When confirma la importación
- Then **solo** se persisten los turnos cuya identidad resuelve a su propio employee
- And las filas ajenas se descartan con un recuento explícito y visible ("12 filas de otras personas ignoradas"), nunca en silencio
- And si su identidad no aparece en el fichero, el resultado es `blocked` con motivo `SELF_IDENTITY_NOT_FOUND` y una acción de desambiguación
- And un EMPLOYEE nunca puede crear un employee nuevo desde el flujo de importación
- And las fechas futuras se excluyen con recuento y no crean `Shift`, `Schedule` ni `ScheduleVersion`.
**DO_NOT_BREAK**: `assertScopedResource` con scope `SELF`; ningún `Shift` sin `organization_id`+`employee_id`.
**DEPENDENCIES**: D-04, P5-M04, P1 (para el resultado persistente). **RISK**: ALTO. **ESTIMATED_COMPLEXITY**: XL.

---
**ID**: P5-M06
**TITLE**: E2E de matriz de roles y publicación del artefacto verificado
**PURPOSE**: Que la matriz deje de ser un documento de diseño y pase a ser un test.
**PRECONDITIONS**: P5-M02..M05.
**FILES_LIKELY_AFFECTED**: nuevo `qa/e2e-acceptance/specs-local/role-matrix.spec.ts`; `docs/fase1-multitenant.md`.
**ACCEPTANCE_CRITERIA**:
- Given los 4 roles provisionados
- When se ejecuta la spec de matriz
- Then cada celda rol×capacidad se verifica con el código HTTP y el estado de UI esperados
- And la matriz publicada en `docs/fase1-multitenant.md` coincide celda a celda con la salida del test
- And la spec falla si un rol gana una capacidad no declarada.
**DEPENDENCIES**: P5-M02..M05. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: L.

### PHASE_P5_GATE

| Criterio | Exigencia |
|---|---|
| FUNCTIONAL | Los 4 roles operan sus journeys declarados en navegador real |
| DATA_INTEGRITY | Un import de EMPLOYEE nunca escribe un `Shift` de otro empleado |
| AUTHORIZATION | **Obligatorio**: matriz completa rol×scope×capacidad con evidencia HTTP por celda |
| TENANT_ISOLATION | Verificada de nuevo con 4 roles, no solo con OWNER |
| SECURITY | Ningún endpoint nuevo permite elevar plan ni ensanchar scope |
| ROLE_MATRIX | Documento y test coinciden celda a celda |
| REGRESSION | R2/R3/R4/R5 sin regresión |
| ACCESSIBILITY / RESPONSIVE / I18N | Portal de empleado y planificador verificados en ambos temas, ES/EN, 390px |
| UNIT/INTEGRATION/E2E | PASS incluyendo `role-matrix.spec.ts` |
| BUILD/LINT/TYPECHECK | PASS |
| DOCUMENTATION | `EMPLOYEE_SELF_SERVICE_CONTRACT.md` publicado; matriz verificada en `fase1-multitenant.md` |
| PLAN_ENTITLEMENT | La organización de QA `team` no introduce un bypass reutilizable |
| BROWSER_QA | Capturas por rol |
| AOS_COMPLIANCE / WORKTREE_STATE | PASS / limpio |

**EVIDENCE_REQUIRED**: tabla rol×capacidad×endpoint×HTTP; capturas de sesión por rol; salida de `role-matrix.spec.ts`; prueba de que un EMPLOYEE importando un roster multiempleado persiste exclusivamente sus filas (conteo de `shifts` por `employee_id` antes/después).

**RESULTADOS**: `PASS` | `PASS_WITH_GAPS` | `FAIL` | `BLOCKED` (sólo ante un nuevo bloqueo real).

---

## PHASE P5.1 — Premium Application Shell & Collapsible Sidebar

**PHASE_ID**: P5.1
**PHASE_NAME**: Premium Application Shell & Collapsible Sidebar
**STATUS**: PASS
**GOAL**: Recuperar espacio útil para el calendario con sidebar role-aware, topbar global compacta
y workspace calendar-first.
**WHY_NOW**: El finding post-P5 `DASHBOARD NAVIGATION DENSITY` reproduce una saturación real del
header: branding, mes, contexto, preferencias y acciones competían por la misma franja.
**USER_VALUE**: El usuario encuentra cada capacidad sin perder de vista el calendario y conserva
su contexto en desktop, tablet y móvil.
**BUSINESS_VALUE**: Añadir capacidades futuras no exige seguir ampliando el header.
**SOURCE_DRIVERS**: Finding post-P5 de densidad; contratos de accesibilidad, responsive, i18n y
motion; principio de navegación diferenciada de CRC Tryp sin copiar su UI.
**SCOPE**: Inventario de acciones, `AppShell`, sidebar expandido/contraído, drawer móvil, topbar
con preferencias y menú de cuenta, migración de contexto y navegación mensual, visibilidad por rol
y validación visual.
**OUT_OF_SCOPE**: API, base de datos, autorización de dominio, Approval Lite, Portal EMPLOYEE,
nuevas rutas de negocio y rediseño de P6.
**DEPENDENCIES**: P5 PASS.
**PREREQUISITES**: matriz de roles y portal EMPLOYEE cerrados; sin cambios pendientes en DB/API.
**RISKS**: pérdida de una acción o del estado de calendario; drawer inaccesible; capacidades
administrativas visibles a PLANNER.
**DO_NOT_BREAK**: P5, SELF import, R3, R4, R5, P1/P2/P3/P4, mes/contexto, logout, dark/light e
i18n.
**AFFECTED_DOMAINS**: UI, navegación, responsive, accesibilidad.
**AFFECTED_ROLES**: OWNER, ADMIN, PLANNER; EMPLOYEE solo como regresión de portal.
**AFFECTED_ROUTES**: `/app`, `/app/schedule`; Portal EMPLOYEE preservado.
**MIGRATION_IMPACT**: N/A — no hay cambios API/DB/migraciones; verificado por diff sin ficheros
bajo `api/` o `db/`.
**ROLLBACK_STRATEGY**: revertir los commits P5.1 en orden inverso; no hay rollback de datos.
**OBSERVABILITY**: métricas de posición/altura del calendario, capturas por rol/tema/viewport y
smoke E2E compacto.
**DOCUMENTATION_UPDATES**: SPEC, roadmap, inventario de navegación, manual y Gate P5.1.

### MICROTASKS — P5.1

---
**ID**: P5.1-M01
**TITLE**: Inventario de navegación y contrato de shell
**PURPOSE**: Enumerar todas las acciones de `/app`, clasificación y visibilidad por rol sin perder capacidades.
**ACCEPTANCE_CRITERIA**: Given el dashboard actual, When se contrastan controles y handlers, Then
existe un inventario completo y un árbol objetivo sin rutas inventadas.
**DO_NOT_BREAK**: ninguna acción ni permiso. **DEPENDENCIES**: P5. **RISK**: BAJO.
**ESTIMATED_COMPLEXITY**: S.

---
**ID**: P5.1-M02
**TITLE**: Fundaciones de AppShell, Sidebar, TopBar y MainWorkspace
**PURPOSE**: Aislar layout/navegación de la orquestación de estado de `App.tsx`.
**ACCEPTANCE_CRITERIA**: Given `/app`, When se renderiza la shell, Then existen `aside`, `nav`,
`header` y `main`, el calendario conserva su estado y no se toca API/DB.
**DO_NOT_BREAK**: modales y handlers existentes. **DEPENDENCIES**: M01. **RISK**: MEDIO.
**ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.1-M03
**TITLE**: Migrar operaciones al sidebar role-aware
**PURPOSE**: Mover Importar, Añadir, Histórico, Planificar, Usuarios, Áreas, Formatos y Ajustes
fuera del header global respetando permisos y modales existentes.
**ACCEPTANCE_CRITERIA**: Given OWNER/ADMIN/PLANNER, When inspeccionan el sidebar, Then cada acción
autorizada sigue disponible, las administrativas no aparecen a PLANNER y no hay duplicados en header.
**DO_NOT_BREAK**: entitlement, import, scheduling y MembersModal. **DEPENDENCIES**: M02.
**RISK**: ALTO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P5.1-M04
**TITLE**: Migrar contexto y toolbar de calendario
**PURPOSE**: Reubicar Organización/Área/Empleado al contexto lateral y mes al workspace.
**ACCEPTANCE_CRITERIA**: Given empleado, área y mes seleccionados, When se navega o recarga, Then
contexto y mes se conservan y los handlers actuales siguen gobernando los cambios.
**DO_NOT_BREAK**: aislamiento por organización y filtro de empleados activos. **DEPENDENCIES**: M03.
**RISK**: ALTO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P5.1-M05
**TITLE**: Estado colapsado y preferencias persistentes
**PURPOSE**: Añadir expand/collapse, persistencia local, tooltips, active state y reduced motion.
**ACCEPTANCE_CRITERIA**: Given desktop, When se contrae y recarga, Then se conserva el estado,
se libera ancho real y todos los iconos tienen nombre accesible y foco visible.
**DO_NOT_BREAK**: mes, empleado, área ni modales. **DEPENDENCIES**: M04. **RISK**: MEDIO.
**ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.1-M06
**TITLE**: Simplificar topbar y crear menú de cuenta
**PURPOSE**: Dejar en topbar tema, idioma y usuario; mover logout sin reimplementar auth.
**ACCEPTANCE_CRITERIA**: Given una sesión, When se abre el menú, Then Salir conserva logout,
anuncia `aria-expanded` y cierra con Escape/click-outside.
**DO_NOT_BREAK**: limpieza de sesión y redirect. **DEPENDENCIES**: M05. **RISK**: MEDIO.
**ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.1-M07
**TITLE**: Drawer responsive y visibilidad por rol
**PURPOSE**: Convertir el sidebar en drawer en tablet/móvil y proteger OWNER/ADMIN/PLANNER y
el Portal EMPLOYEE.
**ACCEPTANCE_CRITERIA**: Given 390/768/1024 px, When se abre navegación, Then el drawer atrapa
foco, se cierra con Escape, no deja scroll horizontal en body y EMPLOYEE conserva R4.
**DO_NOT_BREAK**: role matrix y portal móvil-first. **DEPENDENCIES**: M06. **RISK**: ALTO.
**ESTIMATED_COMPLEXITY**: L.

---
**ID**: P5.1-M08
**TITLE**: Accesibilidad, visual y browser QA
**PURPOSE**: Validar landmarks, keyboard, focus, tooltips, zoom, dark/light, ES/EN y densidad.
**ACCEPTANCE_CRITERIA**: Given viewports requeridos, When se ejecuta smoke e inspección visual,
Then se observan shell expanded/collapsed, drawer y portal sin regresiones y el calendario gana
superficie útil.
**DO_NOT_BREAK**: contratos P4. **DEPENDENCIES**: M07. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P5.1-M09
**TITLE**: Documentación y cierre de regresión
**PURPOSE**: Reconciliar documentos, manual, estado y matriz de pruebas con la shell implementada.
**ACCEPTANCE_CRITERIA**: Given el código final, When se comparan documentos y tests, Then no se
declaran P6 iniciadas, los conteos son correctos y la ausencia API/DB queda probada.
**DO_NOT_BREAK**: trazabilidad histórica. **DEPENDENCIES**: M08. **RISK**: BAJO.
**ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.1-M10
**TITLE**: Gate final P5.1
**PURPOSE**: Emitir veredicto formal con evidencia reproducible.
**ACCEPTANCE_CRITERIA**: Given M01–M09 PASS, When se ejecutan tests, lint, typecheck, build y
browser QA, Then todos los criterios del Gate pasan y el worktree queda limpio tras commit.
**DO_NOT_BREAK**: no introducir cambios funcionales nuevos en el Gate. **DEPENDENCIES**: M01–M09.
**RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

### PHASE_P5_1_GATE

| Criterio | Exigencia | Evidencia |
|---|---|---|
| FUNCTIONAL | Toda acción migrada sigue funcionando | smoke E2E + tests de componente |
| DATA_INTEGRITY | N/A: no hay cambios de datos | diff sin `api/` ni `db/` |
| AUTHORIZATION | Ningún rol gana capacidades | AppShell role-aware + matriz P5 |
| TENANT_ISOLATION | N/A: backend/scope sin cambios | diff y smoke P5 reutilizado |
| SECURITY | Logout/auth sin regresión | menú de cuenta + logout existente |
| REGRESSION | P1–P5 y R3/R4/R5 preservados | suite dirigida + smoke |
| ACCESSIBILITY | landmarks, keyboard, focus, drawer y menu | AppShell.test + árbol E2E |
| RESPONSIVE | 390, 768, 1024, 1366, 1440 | capturas y smoke |
| I18N | ES/EN en claves nuevas | i18n-coverage |
| UNIT_TESTS / INTEGRATION_TESTS | PASS | Vitest dirigido y suite |
| E2E | OWNER shell + planner + EMPLOYEE protegido | test:p5-1-shell + smoke P5 |
| BUILD / LINT / TYPECHECK | PASS | comandos reproducibles |
| DOCUMENTATION | SPEC, roadmap, inventario y Gate coherentes | docs auditados |
| AOS_COMPLIANCE | PASS | AOS adoption y un solo escritor |
| WORKTREE_STATE | limpio tras commit | git status |
| ROLE_MATRIX | OWNER/ADMIN/PLANNER/EMPLOYEE | P5 artifact + shell test |
| BROWSER_QA | capturas expanded/collapsed, temas, drawer, planner, portal | artefactos E2E |
| VISUAL_DENSITY | calendario empieza antes y crece en altura | métricas 1366/1440 |
| NAVIGATION_COMPLETENESS | 100% de acciones inventariadas | inventario P5.1 |
| STATE_PRESERVATION | mes, contexto, scroll y modales estables | smoke + tests |

**EVIDENCE_REQUIRED**: inventario completo; tests de shell; smoke E2E compacto; capturas OWNER
expanded/collapsed dark/light, drawer móvil, PLANNER y Portal EMPLOYEE; métricas antes/después a
1366×768 y 1440×900; diff sin `api/` ni `db/`.

**RESULTADOS**: `PASS` | `PASS_WITH_GAPS` | `FAIL` | `BLOCKED`.

---

## PHASE P5.2 — Operational Navigation & Time-Scope Consolidation

**PHASE_ID**: P5.2
**PHASE_NAME**: Operational Navigation & Time-Scope Consolidation
**STATUS**: PASS
**GOAL**: Consolidar la shell de P5.1, separar Importar/Añadir turno/Planificar, integrar Approval Lite
en la navegación y hacer cumplir la frontera temporal `PASADO → Importar/Añadir` y `HOY/FUTURO → Planificar`.
**SOURCE_DRIVERS**: decisión de producto P5.2; `docs/product/OPERATIONAL_NAVIGATION_TIME_SCOPE_CONTRACT.md`;
P5/P5.1 y R3/R4/R5 ya cerrados.
**DEPENDENCIES**: P5.1 Gate PASS.
**OUT_OF_SCOPE**: CRC Tryp adicional, migraciones, billing, cambios del modelo semanal, rediseño de
Approval Lite o reescritura global de `App.tsx`.
**DO_NOT_BREAK**: P1 outcomes, P2 entitlements, P3 dialogs, P4 accessibility, P5 role/self scope,
P5.1 shell, R3 scheduling, R4 portal EMPLOYEE, R5 approval, tenant isolation e idempotencia.
**AFFECTED_DOMAINS**: navegación, calendario, histórico manual, scheduling y presentación de approvals.
**MIGRATION_IMPACT**: ninguno previsto; si aparece una necesidad de esquema, la fase se detiene.
**ROLLBACK_STRATEGY**: revertir microtareas/commits individualmente; no se modifican datos ni migraciones.
**DOCUMENTATION_UPDATES**: SPEC, este roadmap, contrato temporal, matriz P5.2 y Gate.

### MICROTASKS — P5.2

---
**ID**: P5.2-M01
**TITLE**: Contrato de producto y matriz rol × capacidad × tiempo
**PURPOSE**: Fijar la semántica inequívoca de Importar turnos, Añadir turno y Planificar.
**PRECONDITIONS**: P5.1 Gate PASS.
**FILES_LIKELY_AFFECTED**: `docs/product/OPERATIONAL_NAVIGATION_TIME_SCOPE_CONTRACT.md`, `docs/fase1-multitenant.md`.
**ACCEPTANCE_CRITERIA**: Given los cuatro roles, When se consulta la matriz, Then cada capacidad tiene scope y frontera temporal explícitos y coincide con P5.
**DEPENDENCIES**: P5.1. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P5.2-M02
**TITLE**: Reconciliar la arquitectura de navegación operativa
**PURPOSE**: Auditar la IA de P5.1 y garantizar que no se pierda ninguna acción ni capacidad.
**PRECONDITIONS**: P5.2-M01.
**FILES_LIKELY_AFFECTED**: `AppShell.tsx`, `App.tsx`, inventario P5.1.
**ACCEPTANCE_CRITERIA**: Given el inventario actual, When se compara con Sidebar/TopBar/toolbar, Then toda acción tiene un único entry point y el contexto queda separado de la navegación global.
**DEPENDENCIES**: P5.2-M01. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.2-M03
**TITLE**: Entry point de Aprobaciones y modal Approval Lite
**PURPOSE**: Retirar el bloque permanente del calendario y conservar el workflow R5 bajo demanda.
**PRECONDITIONS**: P5.2-M02.
**FILES_LIKELY_AFFECTED**: `ApprovalInbox.tsx`, `App.tsx`, `AppShell.tsx`.
**ACCEPTANCE_CRITERIA**: Given un actor autorizado, When pulsa Aprobaciones, Then se abre un `ModalShell` con lista, approve/reject y motivo obligatorio; And el calendario no muestra el card permanente.
**DO_NOT_BREAK**: API, policy, routing, idempotencia y auditoría R5.
**DEPENDENCIES**: P5.2-M02. **RISK**: ALTO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.2-M04
**TITLE**: Densidad del calendario y contador mensual
**PURPOSE**: Eliminar el estado vacío grande y mostrar el conteo del Employee visualizado junto al mes.
**PRECONDITIONS**: P5.2-M02.
**FILES_LIKELY_AFFECTED**: `CalendarToolbar.tsx`, `App.tsx`, `i18n.ts`.
**ACCEPTANCE_CRITERIA**: Given mes y Employee actuales, When cambia cualquiera, Then el contador se actualiza sin fetch duplicado y el calendario gana espacio visible.
**DEPENDENCIES**: P5.2-M02. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P5.2-M05
**TITLE**: Contexto de identidad compacto en TopBar
**PURPOSE**: Distinguir User conectado, rol y Employee visualizado sin recuperar la densidad del header anterior.
**PRECONDITIONS**: P5.2-M02.
**FILES_LIKELY_AFFECTED**: `AppShell.tsx`, `App.tsx`, `AppShell.css`.
**ACCEPTANCE_CRITERIA**: Given una sesión con o sin Employee vinculado, When se observa TopBar, Then User, rol y Employee context se distinguen; And los selectores siguen accesibles desde un popover.
**DO_NOT_BREAK**: User ≠ Employee y aislamiento de organización.
**DEPENDENCIES**: P5.2-M02. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.2-M06
**TITLE**: Cierre de comportamiento colapsable de Sidebar
**PURPOSE**: Asegurar expanded/collapsed persistente, nombrado y sin pérdida de contexto.
**PRECONDITIONS**: P5.1 Gate PASS.
**FILES_LIKELY_AFFECTED**: `AppShell.tsx`, `AppShell.css`, tests de shell.
**ACCEPTANCE_CRITERIA**: Given desktop, tablet y móvil, When se contrae/abre, Then labels, tooltips, focus, active state y drawer funcionan y el workspace recupera el ancho disponible.
**DEPENDENCIES**: P5.2-M05. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P5.2-M07
**TITLE**: Contrato de Añadir turno histórico
**PURPOSE**: Hacer explícito que la alta manual sólo registra `date < today`.
**PRECONDITIONS**: P5.2-M01.
**FILES_LIKELY_AFFECTED**: `ShiftModal.tsx`, `operational-date.ts`, `i18n.ts`.
**ACCEPTANCE_CRITERIA**: Given today en `Europe/Madrid`, When se abre Añadir turno, Then el selector limita fechas anteriores y today/futuro se explica como Planificar.
**DEPENDENCIES**: P5.2-M01. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P5.2-M08
**TITLE**: Enforcement server-side de alta histórica
**PURPOSE**: Impedir que una llamada directa use el flujo manual para crear today/futuro.
**PRECONDITIONS**: P5.2-M07.
**FILES_LIKELY_AFFECTED**: `api/_lib/data.js`, `api/_lib/operational-date.js`, tests de shifts.
**SECURITY_IMPACT**: backend valida auth, tenant, scope, Employee ACTIVE y fecha; el cliente no decide.
**ACCEPTANCE_CRITERIA**: Given `origin=MAN`, When `date >= today`, Then la API responde error de dominio controlado antes de mutar; And fechas históricas dentro del scope se guardan.
**DO_NOT_BREAK**: importación, publicación, cambios aprobados y reconciliación.
**DEPENDENCIES**: P5.2-M07. **RISK**: ALTO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.2-M09
**TITLE**: Routing del botón + por ámbito temporal
**PURPOSE**: Evitar que today/futuro abran el flujo histórico.
**PRECONDITIONS**: P5.2-M04, P5.2-M07.
**FILES_LIKELY_AFFECTED**: `MonthGrid.tsx`, `App.tsx`, `WeeklyPlanner.tsx`.
**ACCEPTANCE_CRITERIA**: Given una celda pasada, today o futura, When se pulsa +, Then abre Añadir, Planificar o Planificar respectivamente con la fecha conservada.
**DEPENDENCIES**: P5.2-M04. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.2-M10
**TITLE**: Reconciliar Planificar como modal
**PURPOSE**: Mantener el planificador dentro de la shell sin ruta de navegación paralela visible.
**PRECONDITIONS**: P5.2-M02.
**FILES_LIKELY_AFFECTED**: `WeeklyPlanner.tsx`, `App.tsx`, CSS de scheduling.
**ACCEPTANCE_CRITERIA**: Given `/app`, When se elige Planificar, Then se abre un `ModalShell` grande con X, ESC, focus trap, toolbar, grid y editor; And no aparece “Volver al calendario”.
**DO_NOT_BREAK**: deep link `/app/schedule` y versionado semanal.
**DEPENDENCIES**: P5.2-M02. **RISK**: ALTO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P5.2-M11
**TITLE**: Guard temporal del planificador
**PURPOSE**: Hacer no accionables días pasados y semanas completamente pasadas.
**PRECONDITIONS**: P5.2-M10.
**FILES_LIKELY_AFFECTED**: `WeeklyPlanner.tsx`, `AccessibleScheduleTable.tsx`, `api/_lib/scheduling.js` si la defensa server-side existente necesita ajuste.
**ACCEPTANCE_CRITERIA**: Given hoy y una semana operativa, When se muestra el planner, Then past days no tienen +/edit alcanzables, previous se deshabilita para una semana completamente pasada y today/futuro siguen editables dentro del scope.
**DO_NOT_BREAK**: modelo semanal, week-start Monday/Sunday y publicación.
**DEPENDENCIES**: P5.2-M10. **RISK**: ALTO. **ESTIMATED_COMPLEXITY**: L.

---
**ID**: P5.2-M12
**TITLE**: Matriz E2E compacta de roles y operaciones
**PURPOSE**: Cubrir fronteras reales con una fixture y un worker, dejando combinaciones puramente contractuales a Vitest/integration.
**PRECONDITIONS**: P5.2-M03..M11.
**FILES_LIKELY_AFFECTED**: nuevo smoke P5.2 y artefacto de matriz.
**ACCEPTANCE_CRITERIA**: Given la fixture Team, When se ejecuta un único smoke focalizado, Then verifica OWNER/ADMIN/PLANNER/EMPLOYEE sólo en journeys UI materiales y las fronteras API sin duplicar baterías lentas.
**DEPENDENCIES**: P5.2-M03..M11. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.2-M13
**TITLE**: Accessibility, responsive y browser QA
**PURPOSE**: Verificar shell, modal, temporalidad y densidad en los viewports obligatorios.
**PRECONDITIONS**: P5.2-M12.
**MANUAL_QA_REQUIRED**: capturas y medidas antes/después en 1366×768 y 1440×900; dark/light; mobile drawer; Planner; Employee portal.
**ACCEPTANCE_CRITERIA**: Given 1440, 1366×768, 1024×768, 834, 390×844 y 844×390, When se recorren los journeys, Then no hay overflow horizontal de body, focus/ESC/zoom/contraste funcionan y calendarTop/height mejoran.
**DEPENDENCIES**: P5.2-M12. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P5.2-M14
**TITLE**: Reconciliación documental y evidencia
**PURPOSE**: Alinear SPEC, roadmap, contrato, matriz, manual y metadatos AOS con el estado real.
**PRECONDITIONS**: P5.2-M01..M13.
**ACCEPTANCE_CRITERIA**: Given los resultados de implementación, When se revisan los documentos, Then no contradicen el código, P6 sigue bloqueada hasta este Gate y no se declara un cambio de DB/API inexistente.
**DEPENDENCIES**: P5.2-M13. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P5.2-M15
**TITLE**: Gate final P5.2
**PURPOSE**: Cerrar la fase sólo con evidencia funcional, de seguridad y de navegador.
**PRECONDITIONS**: P5.2-M01..M14.
**ACCEPTANCE_CRITERIA**: Given todos los criterios del Gate, When se ejecutan tests, lint, typecheck, build y smoke browser, Then el resultado es PASS o PASS_WITH_GAPS no bloqueante; And no se inicia P6 en este commit.
**DEPENDENCIES**: P5.2-M14. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

### PHASE_P5.2_GATE

Consultar `docs/roadmap/P5.2-OPERATIONAL-NAVIGATION-TIME-SCOPE-GATE.md` para los criterios completos.
`PHASE_P5.2_GATE = PASS`; P6 queda planificada y no se inicia en este commit.

---

## PHASE P6 — Import History & Operational Traceability

**PHASE_ID**: P6
**PHASE_NAME**: Histórico de importaciones que explica qué ocurrió
**GOAL**: Que el histórico responda, sin abrir la base de datos: qué se importó, quién lo hizo,
sobre qué alcance, con qué formato, con qué resultado, y cómo recuperar un intento fallido.
**WHY_NOW**: P1 introduce los estados `partial`/`blocked`/`failed`; sin P6 esas filas existen pero
no son legibles ni accionables. La auditoría constató que el histórico decía "No hay
importaciones registradas" tras un intento real.
**USER_VALUE**: Un administrador entiende su propio pasado operativo y puede recuperar.
**BUSINESS_VALUE**: Auditabilidad; requisito implícito de cualquier conversación B2B.
**SOURCE_DRIVERS**: Audit F1 (histórico vacío tras intento); área candidata F del encargo; R1-M09.

**SCOPE**
- Renderizado de los cuatro estados + `deleted` con vocabulario consistente.
- Actor (quién), alcance (global/área), empleados, número de turnos, formato de origen, periodo.
- Filtros ya soportados por la API (`userId`, `importMode`, `scopeType`, `sourceFormat`, `status`) expuestos en UI.
- Enlaces de recuperación desde una entrada bloqueada/fallida.
- Semántica de reintento coherente con la idempotencia.

**OUT_OF_SCOPE**: exportación del histórico; reporting agregado (es R8 POST-MVP).
**DEPENDENCIES**: P1 (estados), P5 (visibilidad por rol del histórico), P5.1 (shell), P5.2 (entry point,
contexto de identidad y frontera operativa).
**PREREQUISITES**: `GET /api/imports` ya soporta los filtros (verificado en HEAD).
**RISKS**: exponer en el histórico datos de empleados fuera del scope del lector.
**DO_NOT_BREAK**: la política de borrado (soft-delete de la fila, hard-delete de sus shifts por
`import_id`); los turnos manuales (`import_id IS NULL`) nunca se tocan; el histórico es lectura
para EMPLOYEE (misma convención broad-read/ADMIN-write que `/api/areas`).
**AFFECTED_DOMAINS**: History, Import.
**AFFECTED_ROLES**: todos (lectura), ADMIN+ (borrado).
**AFFECTED_PLANS**: `fullHistory` distingue `free` de `personal`/`team` — la UI debe señalizarlo antes, no después (patrón de P2).
**AFFECTED_ROUTES**: `/app`.
**AFFECTED_COMPONENTS**: `ImportHistoryModal.tsx`, `import-state-copy.ts`.
**AFFECTED_API**: `GET /api/imports` (proyección de los campos de outcome).
**AFFECTED_DATABASE**: ninguno adicional a P1-M02.
**AFFECTED_I18N**: vocabulario de estados ES/EN.
**AFFECTED_TESTS**: `ImportHistoryModal.test.tsx`, `api/_lib/data.test.js`.
**MIGRATION_IMPACT**: ninguno.
**ROLLBACK_STRATEGY**: revertir la UI deja las filas nuevas invisibles pero no corrompe datos.
**OBSERVABILITY**: el histórico se convierte de facto en la superficie de observabilidad del dominio Import.
**DOCUMENTATION_UPDATES**: `docs/manual/manual-usuario.md` — sección de histórico.

### MICROTASKS — P6

---
**ID**: P6-M01
**TITLE**: Vocabulario y renderizado de los cinco estados del histórico
**SOURCE**: P1-M01 contrato; Audit F1.
**PRECONDITIONS**: P1 Gate.
**FILES_LIKELY_AFFECTED**: `ImportHistoryModal.tsx`, `import-state-copy.ts`, `src/lib/i18n.ts`.
**ACCEPTANCE_CRITERIA**:
- Given entradas con estados `completed`, `partial`, `blocked`, `failed`, `deleted`
- When se listan
- Then cada una muestra un chip con vocabulario propio y consistente, distinguible sin depender solo del color
- And una entrada `blocked` muestra el motivo y el empleado bloqueante
- And una entrada `partial` muestra cuántos turnos entraron y cuántos no.
**DO_NOT_BREAK**: la etiqueta "Eliminada" y su semántica de soft-delete.
**DEPENDENCIES**: P1. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P6-M02
**TITLE**: Exponer actor, alcance, formato de origen y periodo en cada entrada
**SOURCE**: área candidata F; `db/migrations/0010_import_history.sql` (`scope_type`, `area_name_snapshot`, `period_label`, `employee_count`, `shift_count`).
**PRECONDITIONS**: P6-M01.
**FILES_LIKELY_AFFECTED**: `ImportHistoryModal.tsx`, `api/_lib/data.js` (proyección).
**SECURITY_IMPACT**: el actor se muestra solo a quien tiene scope para verlo; un EMPLOYEE no ve el actor de imports ajenos.
**ACCEPTANCE_CRITERIA**:
- Given una entrada del histórico
- When se consulta
- Then muestra actor, alcance (global o área con su snapshot de nombre), formato, periodo, nº de empleados y nº de turnos
- And el nombre de área mostrado es el snapshot del momento del import, no el actual
- And un EMPLOYEE solo ve entradas dentro de su scope.
**DO_NOT_BREAK**: la razón de ser del snapshot de nombre de área.
**DEPENDENCIES**: P6-M01. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P6-M03
**TITLE**: Filtros del histórico en UI
**SOURCE**: `api/imports/index.js` (filtros ya soportados: `areaId`, `userId`, `importMode`, `scopeType`, `sourceFormat`, `status`).
**PRECONDITIONS**: P6-M02.
**ACCEPTANCE_CRITERIA**:
- Given el modal de histórico
- When el usuario filtra por estado, formato, alcance o actor
- Then la lista se actualiza y la paginación se reinicia
- And los filtros son operables por teclado y anunciados
- And filtrar por un `userId` fuera de scope no devuelve resultados ni revela existencia.
**DEPENDENCIES**: P6-M02. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P6-M04
**TITLE**: Enlaces de recuperación desde entradas bloqueadas/fallidas
**SOURCE**: Audit F1 (recuperación contextual); P1-M08.
**PRECONDITIONS**: P6-M02, P1-M08.
**ACCEPTANCE_CRITERIA**:
- Given una entrada `blocked` por `EMPLOYEE_PENDING_ACCESS`
- When el usuario la abre
- Then dispone de la misma acción de desbloqueo que ofreció el resultado en su momento
- And tras desbloquear, la entrada refleja el nuevo intento en lugar de quedar huérfana
- And la semántica de reintento no rompe la idempotencia (P1-M03).
**DEPENDENCIES**: P1-M08, P6-M02. **RISK**: MEDIO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P6-M05
**TITLE**: Señalización previa del límite `fullHistory` en plan `free`
**SOURCE**: `api/_lib/plans.js` (`fullHistory: false` en `free`); patrón de P2.
**PRECONDITIONS**: P2, P6-M01.
**ACCEPTANCE_CRITERIA**:
- Given una organización en plan `free`
- When abre el histórico
- Then se indica antes de explorar qué parte del histórico está disponible en su plan
- And el recorte real lo sigue aplicando el backend.
**DEPENDENCIES**: P2, P6-M01. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P6-M06
**TITLE**: E2E del histórico con los cinco estados
**PRECONDITIONS**: P6-M01..M05.
**ACCEPTANCE_CRITERIA**:
- Given una organización con un import completado, uno parcial, uno bloqueado, uno fallido y uno eliminado
- When se abre el histórico
- Then las cinco entradas aparecen con su vocabulario, sus datos y sus acciones
- And filtrar por `status=blocked` devuelve exactamente una
- And eliminar una entrada completada borra sus turnos y deja la fila como "Eliminada".
**DEPENDENCIES**: P6-M01..M05. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: L.

### PHASE_P6_GATE

| Criterio | Exigencia |
|---|---|
| FUNCTIONAL | Los cinco estados legibles y accionables |
| DATA_INTEGRITY | Borrar una importación borra exclusivamente sus shifts por `import_id` |
| AUTHORIZATION | EMPLOYEE lee solo su scope; borrado solo ADMIN+ |
| TENANT_ISOLATION | Ninguna entrada cruza organización |
| SECURITY | Filtrar por actor fuera de scope no revela existencia |
| REGRESSION | Import R1 y P1 sin regresión |
| ACCESSIBILITY | Estados distinguibles sin depender del color; filtros operables por teclado |
| RESPONSIVE | Histórico usable a 390px |
| I18N | Vocabulario de estados ES/EN |
| UNIT/INTEGRATION/E2E | PASS |
| BUILD/LINT/TYPECHECK | PASS |
| DOCUMENTATION | Manual de usuario actualizado |
| ERROR_RECOVERY | Toda entrada bloqueada ofrece su acción de desbloqueo |
| IDEMPOTENCY | El reintento desde el histórico respeta la deduplicación |
| PLAN_ENTITLEMENT | `fullHistory` señalizado antes |
| BROWSER_QA | Captura de los cinco estados |

**EVIDENCE_REQUIRED**: capturas de los cinco estados; consultas SQL antes/después de un borrado mostrando shifts eliminados solo por `import_id` y la fila con `deleted_at`; reporte E2E; snapshot de accesibilidad de los chips de estado.

**RESULTADOS**: `PASS` | `PASS_WITH_GAPS` | `FAIL` | `BLOCKED`.

---

## PHASE P7 — Product Communication: Import vs Schedule

**PHASE_ID**: P7
**PHASE_NAME**: Distinción explícita entre turno confirmado y borrador de planificación
**GOAL**: Que ningún usuario descubra por accidente que sus turnos futuros importados no son
turnos todavía.
**WHY_NOW**: `OPPORTUNITY/P3` (F8), pero con impacto directo en la promesa comercial: el landing
vende "calendario listo para usar" y el modelo de datos enruta fechas futuras a un borrador que
requiere publicación explícita. Es la última pieza de coherencia del journey núcleo.
**USER_VALUE**: Expectativa correcta desde el primer import.
**BUSINESS_VALUE**: Alinea marketing, producto y modelo de datos; evita la sensación de "faltan turnos".
**SOURCE_DRIVERS**: Audit F8 (OPPORTUNITY/P3); `docs/product/SCHEDULING_DOMAIN.md`; `api/_lib/future-import.js`.

**SCOPE**
- Refuerzo visual en el resumen de previsualización de importación (badge + ayuda contextual, no una línea pequeña).
- Confirmación posterior en el resultado persistente de P1 con la acción "Ir a Planificar y publicar".
- Revisión del copy del landing y de `/pricing` para que la promesa contemple el paso de publicación sin perder claridad comercial.
- Nomenclatura consistente Import / Planificar / Publicado / Borrador en toda la UI e i18n.

**OUT_OF_SCOPE**: cambiar el modelo de datos. La decisión de enrutar futuros a borrador es
correcta y está fundamentada; solo cambia su comunicación.
**DEPENDENCIES**: P1 (superficie de resultado), P6 (vocabulario del histórico).
**PREREQUISITES**: `SCHEDULING_DOMAIN.md` como fuente.
**RISKS**: sobrecargar el resumen de importación con texto y aumentar la carga cognitiva que se
pretende reducir; debilitar el copy comercial del landing.
**DO_NOT_BREAK**: el enrutado real de fechas futuras a `ScheduleVersion` en borrador; el bloqueo
de versiones publicadas; el feedback ya ejemplar al crear un borrador ("Borrador semanal creado."
+ chip + contador), señalado por la auditoría como fortaleza a preservar.
**AFFECTED_DOMAINS**: Import, Scheduling, Marketing.
**AFFECTED_ROLES**: OWNER, ADMIN, PLANNER.
**AFFECTED_PLANS**: todos.
**AFFECTED_ROUTES**: `/`, `/pricing`, `/app`, `/app/schedule`.
**AFFECTED_COMPONENTS**: `ImportModal.tsx`, `ImportResultModal.tsx`, `LandingPage.tsx`, `PricingPage.tsx`.
**AFFECTED_API**: ninguna. **AFFECTED_DATABASE**: ninguno.
**AFFECTED_I18N**: glosario ES/EN de Import/Planificar/Borrador/Publicado.
**AFFECTED_TESTS**: `ImportModal.test.tsx`, `LandingPage.test.tsx`, `future-import.spec.ts`.
**MIGRATION_IMPACT**: ninguno.
**ROLLBACK_STRATEGY**: cambios de copy y presentación; reversibles individualmente.
**OBSERVABILITY**: ninguna nueva.
**DOCUMENTATION_UPDATES**: `docs/manual/manual-usuario.md`; glosario en `docs/roadmap/shiftimport-mvp-v2/R0/DOMAIN-GLOSSARY.md` (verificar coherencia, no reescribir).

### MICROTASKS — P7

---
**ID**: P7-M01
**TITLE**: Glosario de UI unificado Import / Planificar / Borrador / Publicado
**PURPOSE**: Antes de cambiar textos, fijar el vocabulario, porque hoy conviven matices en i18n, histórico y planificador.
**SOURCE**: `DOMAIN-GLOSSARY.md`; `SCHEDULING_DOMAIN.md`; Audit F8.
**PRECONDITIONS**: P6.
**FILES_LIKELY_AFFECTED**: `docs/roadmap/shiftimport-mvp-v2/R0/DOMAIN-GLOSSARY.md` (anexo de UI), `src/lib/i18n.ts`.
**ACCEPTANCE_CRITERIA**:
- Given el glosario publicado
- When se revisa cualquier superficie
- Then cada concepto usa un único término en ES y un único término en EN
- And el glosario declara explícitamente qué **no** significa cada término (p. ej. "importado ≠ publicado").
**DO_NOT_BREAK**: el glosario de dominio de R0 no se reescribe; se le añade un anexo de UI.
**DEPENDENCIES**: P6. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: S.

---
**ID**: P7-M02
**TITLE**: Refuerzo visual de la ruta a borrador en el resumen de previsualización
**SOURCE**: Audit F8 cambio recomendado.
**PRECONDITIONS**: P7-M01.
**FILES_LIKELY_AFFECTED**: `ImportModal.tsx`, `src/lib/i18n.ts`.
**ACCEPTANCE_CRITERIA**:
- Given un cuadrante con fechas futuras
- When el usuario ve el resumen de previsualización
- Then la ruta a borrador se comunica con un badge y una línea de ayuda ("Estos turnos quedarán en un borrador que debes publicar desde Planificar"), no con una única línea pequeña
- And el énfasis es mayor la primera vez que un usuario importa futuros (no repetitivo después)
- And el resumen no crece hasta ocultar los contadores principales.
**DO_NOT_BREAK**: los contadores de nuevos/conflictos/duplicados/ignorados/errores (R1-M05).
**DEPENDENCIES**: P7-M01. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P7-M03
**TITLE**: Acción "Ir a Planificar y publicar" en el resultado persistente
**SOURCE**: P1-M05; Audit F8.
**PRECONDITIONS**: P7-M02, P1.
**ACCEPTANCE_CRITERIA**:
- Given una importación completada que generó un borrador con N turnos futuros
- When el usuario ve el resultado
- Then dispone de una acción directa a la versión de borrador creada
- And el resultado indica cuántos turnos quedaron confirmados y cuántos en borrador
- And si el actor no tiene permiso de publicación, la acción se explica en lugar de ofrecerse.
**DO_NOT_BREAK**: el permiso de publicación (PLANNER dentro de scope, ADMIN/OWNER).
**DEPENDENCIES**: P1, P7-M02. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P7-M04
**TITLE**: Alinear la promesa del landing y `/pricing` con el modelo real
**SOURCE**: Audit §02 "Divergencia detectada".
**PRECONDITIONS**: P7-M01.
**FILES_LIKELY_AFFECTED**: `LandingPage.tsx`, `PricingPage.tsx`, `src/lib/i18n.ts`.
**ACCEPTANCE_CRITERIA**:
- Given un visitante del landing
- When lee la promesa
- Then entiende que los turnos pasados/presentes quedan confirmados y los futuros pasan por una publicación explícita
- And el mensaje sigue siendo comercialmente claro y no se convierte en un descargo legal
- And ES y EN son equivalentes.
**DO_NOT_BREAK**: la animación de tres pasos y el CTA único, señalados como fortalezas.
**DEPENDENCIES**: P7-M01. **RISK**: MEDIO (superficie comercial). **ESTIMATED_COMPLEXITY**: M.

---
**ID**: P7-M05
**TITLE**: E2E — primer import con futuros comunica y conduce a la publicación
**PRECONDITIONS**: P7-M02..M04.
**ACCEPTANCE_CRITERIA**:
- Given un usuario nuevo importa un cuadrante con fechas futuras
- When completa el flujo
- Then ve el aviso reforzado en la previsualización y en el resultado
- And sigue la acción hasta la versión de borrador
- And tras publicar, los turnos aparecen como confirmados en el calendario del empleado.
**DEPENDENCIES**: P7-M02..M04. **RISK**: BAJO. **ESTIMATED_COMPLEXITY**: L.

### PHASE_P7_GATE

| Criterio | Exigencia |
|---|---|
| FUNCTIONAL | Import con futuros → borrador → publicación, guiado |
| DATA_INTEGRITY | El enrutado a borrador no cambia |
| AUTHORIZATION | La acción de publicar solo se ofrece a quien puede |
| REGRESSION | `future-import.spec.ts` y R3 sin regresión |
| ACCESSIBILITY | El badge no comunica solo por color; el aviso es anunciado |
| RESPONSIVE | Resumen legible a 390px sin ocultar contadores |
| I18N | Glosario aplicado, ES/EN equivalentes |
| UNIT/INTEGRATION/E2E | PASS |
| BUILD/LINT/TYPECHECK | PASS |
| DOCUMENTATION | Anexo de glosario UI + manual actualizado |
| BROWSER_QA | Capturas del resumen y del resultado con futuros |
| TENANT_ISOLATION / SECURITY | N/A declarado, verificado por ausencia de cambios en `api/` y `db/` |

**EVIDENCE_REQUIRED**: capturas antes/después del resumen de previsualización; capturas del landing ES/EN; reporte E2E del recorrido import→borrador→publicación; `git diff --stat` sin cambios en `api/`/`db/`.

**RESULTADOS**: `PASS` | `PASS_WITH_GAPS` | `FAIL` | `BLOCKED`.

---

## PHASE P8 — CRC Tryp Competitive Research (BLOCKED)

**PHASE_ID**: P8
**PHASE_NAME**: Investigación competitiva/operacional CRC Tryp
**GOAL**: Extraer del cuaderno NotebookLM patrones operativos reales de CRC Tryp y clasificarlos
como transferibles o no a ShiftImport.
**WHY_NOW**: No ahora. **Esta fase está `BLOCKED` desde su creación.**

**ESTADO**: `NOTEBOOKLM_BLOCKED`.
`https://notebook.google.com/notebook/82e11632-e632-421b-915d-bab88976b3b4` responde `302` hacia
`accounts.google.com/ServiceLogin`. El contenido requiere una sesión Google autenticada que este
proceso no tiene y no debe suplantar.

**Consecuencia formal**: no se ha derivado **ninguna** idea, patrón, feature ni prioridad de CRC
Tryp. Cualquier afirmación sobre CRC Tryp en este roadmap o en la SPEC sería inventada, y por
tanto no existe ninguna. El área candidata "L. CRC TRYP TRANSFERABLE PATTERNS" del encargo queda
explícitamente vacía.

**DESBLOQUEO REQUERIDO** (una de estas vías, decisión del propietario):
1. Exportar el contenido del cuaderno a un formato accesible (Markdown/PDF) y depositarlo en el repo o en la vault.
2. Ejecutar la extracción desde una sesión autenticada del propietario mediante el skill `notebooklm`.
3. Proporcionar las fuentes originales del cuaderno (documentos, capturas, notas) directamente.

**MICROTASKS**: no se especifican. Especificar microtareas sobre contenido no leído sería fabricar
requisitos. Cuando la fase se desbloquee, su primera microtarea será `P8-M01 — Extracción y
clasificación de fuentes`, seguida de la clasificación obligatoria por idea:
`CRC_TRYP_OBSERVED` / `SHIFTIMPORT_CURRENT` / `TRANSFERABLE_PATTERN` / `NOT_TRANSFERABLE` /
`PRODUCT_OPPORTUNITY` / `REQUIRES_PRODUCT_DECISION`, con problema resuelto en CRC Tryp,
equivalencia en ShiftImport, adaptación necesaria, impacto, dependencia y asignación a
MVP / Premium / Team / evolución futura.

### PHASE_P8_GATE

**RESULTADO ACTUAL**: `BLOCKED`.
**EVIDENCE_REQUIRED para salir de BLOCKED**: contenido real del cuaderno accesible y citable.
**Regla**: `P8` no bloquea ninguna otra fase y no puede declararse `PASS` ni `PASS_WITH_GAPS`
mientras la fuente no sea legible.

---

## Resumen de fases

| Fase | Nombre | Microtareas | Depende de | Gate esperado |
|---|---|---|---|---|
| P0 | Baseline Truth & MVP Release Gate | 10 | — | PASS / PASS_WITH_GAPS |
| P1 | Trusted Import Completion | 10 | P0 | PASS |
| P2 | Plan Entitlement UX | 5 | P0 (paralelizable con P1) | PASS |
| P3 | Dialog Replacement & Copy | 9 | P1 | PASS / PASS_WITH_GAPS |
| P4 | Accessibility & Responsive | 7 | P0 (independiente de P1–P3) | PASS / PASS_WITH_GAPS |
| P5 | Role Reality & Employee Self-Service | 6 | P0, P2 | PASS / PASS_WITH_GAPS / BLOCKED ante nuevo bloqueo |
| P5.1 | Premium Application Shell & Collapsible Sidebar | 10 | P5 | PASS |
| P5.2 | Operational Navigation & Time-Scope Consolidation | 15 | P5.1 | PASS |
| P6 | Import History & Traceability | 6 | P1, P5.2 | PLANNED |
| P7 | Import vs Schedule Communication | 5 | P1, P6 | PLANNED |
| P8 | CRC Tryp Research | — | fuente accesible | **BLOCKED** |
| **Total** | | **83** | | |
