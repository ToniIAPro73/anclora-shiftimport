# UX Remediation Codex 2026-09 — Product Spec

Status: DRAFT → GATE PENDING
Author: Claude Code (spec-only agent), owner review pending
Fuente canónica: `docs/audits/anclora-shiftimport-ux-reaudit-codex-2026-09-09.json` (auditoría Codex,
`PASS_WITH_GAPS`, HEAD `42ff86995ad8a486af79d9d900ab3b069fff4a8e`, rama `development`).
Narrativa: `docs/audits/anclora-shiftimport-ux-reaudit-codex-2026-09-09.md`.
Contraste histórico: `docs/audits/anclora-shiftimport-ux-reaudit-2026-09-09.md` (Claude).
Convención SDD replicada de: `sdd/features/format-memory-v1/` (00→06).
Formato de gate replicado de: `docs/roadmap/P5.7-M09-PREMIUM-UX-A11Y-GATE.md` y
`docs/roadmap/P5.7-MASTER-GATE.md`.

**Este documento es una SPEC de remediación, no código.** El agente que lo produjo no ha modificado
`src/`, `api/`, `db/` ni configuración de despliegue. Ningún gate referenciado aquí está en `PASS`.

---

## 0 · Alcance del propio documento

Este directorio (`sdd/features/ux-remediation-codex-2026-09/`) especifica **qué** hay que corregir,
**por qué**, **con qué criterios de aceptación** y **en qué orden**, para los 10 findings y las
brechas de cobertura de la auditoría Codex del 2026-09-09. La implementación real de cada
microtarea es trabajo futuro de otro agente o humano, gateado por los ficheros en
`docs/roadmap/UXR-*-GATE.md` (todos en `GATE PENDING`).

## 1 · Problema

La auditoría Codex 2026-09-09 (segunda re-auditoría UX/UI, `PASS_WITH_GAPS`, 62 capturas, 65
journeys candidatos, cobertura de roles autenticados 2/4 — sólo ADMIN/EMPLOYEE, `OWNER_COVERED` y
`PLANNER_COVERED` en `false`) encontró 10 findings de producto (`CX-F01`…`CX-F09`, `CX-E01`) y dejó
un conjunto de brechas de cobertura de herramienta y de histórico sin cerrar. Ninguna corrección
existe todavía en el repositorio para estos 10 findings — son observaciones nuevas de esta
auditoría, no regresiones de trabajo ya remediado.

Los 10 findings, verificados contra el repo real en la fecha de esta spec (todas las rutas citadas
existen y las líneas citadas coinciden con el contenido descrito — ver `01_TECHNICAL_DESIGN.md`
§Verificación de anclajes):

| ID | Título | Categoría | Severidad/Prioridad | Quick win |
|---|---|---|---|---|
| CX-F01 | La revisión de turnos desaparece en móvil | RESPONSIVE | HIGH / P1 | No |
| CX-F02 | Calendario, métricas y tabla semanal dependen de desplazamientos horizontales poco evidentes | RESPONSIVE | MEDIUM / P2 | No |
| CX-F03 | Campos y papeleras de preview no tienen nombre accesible por fila | ACCESSIBILITY | MEDIUM / P2 | **Sí** |
| CX-F04 | El resumen temporal anuncia borradores que la opción efectiva excluye | SYSTEM_STATE | MEDIUM / P2 | No |
| CX-F05 | La preview de provisioning clasifica incorrectamente nuevos usuarios y IDs repetidos | FEEDBACK | MEDIUM / P2 | No |
| CX-F06 | El acuse de turno no tiene una entrada en el shell Employee activo | DISCOVERABILITY | MEDIUM / P2 | No |
| CX-F07 | Provisioning se descubre en un segundo workspace de gestión | INFORMATION_ARCHITECTURE | MEDIUM / P2 | No |
| CX-F08 | La interfaz EN mantiene el idioma del documento en español | ACCESSIBILITY | MEDIUM / P2 | **Sí** |
| CX-F09 | Pricing EN mezcla unidades y texto español | CONTENT_UX | LOW / P3 | **Sí** |
| CX-E01 | Fixture sintética de empleados incompatible con el header aceptado por provisioning | CONSISTENCY / ENGINEERING_SUPPORT | LOW / P3 | **Sí** |

Además, la auditoría deja 6 `TOOL_COMPATIBILITY_GAPS` que impidieron cobertura material (ver §5), 9
findings históricos F1–F9 con estado de retest heterogéneo (ver §6), y 10 flags de
`evidence_coverage` en `false` (ver §7).

## 2 · Usuarios afectados

- **EMPLOYEE**: CX-F01 (revisión móvil), CX-F06 (acuse de turno), CX-F08 (idioma EN).
- **ADMIN / OWNER**: CX-F02, CX-F05, CX-F07 (gestión y provisioning), CX-F08, CX-F09.
- **PLANNER**: CX-F02 (tabla semanal), consumidor indirecto de CX-F04/CX-F05.
- **GUEST / público**: CX-F08, CX-F09 (landing/pricing EN).
- **QA / futuros agentes**: CX-E01 (fixture de escenario).

No se introduce ningún rol nuevo. No se amplía ningún scope existente (`ORGANIZATION`/`AREA`/`SELF`).

## 3 · Modelo de producto asumido como verdadero (no se re-discute aquí)

- `Organization` → `Membership` (`OWNER`/`ADMIN`/`PLANNER`/`EMPLOYEE`) → `User ≠ Employee` (acceso
  autenticado separado de ficha operativa, vínculo opcional `user_id`). `Shift`/`Import`,
  `Schedule`/`version`/`assignment`, `FormatProfile`.
- **Safe Import**: transforma documentos en candidatos editables; **no escribe durante el parse**.
  Los futuros pueden ir a **borrador** que exige publicación explícita (`PD-2026-09-06-P5.5-future-import-draft-scheduling.md`,
  decisiones D-P5.5-01 a D-P5.5-05 — ninguna microtarea de esta spec las reabre).
- **Superficies**: `APPLICATION` (primaria, `/app` y `/app/schedule`) + `LANDING_PAGE` (secundaria,
  contextual). `PORTAL` **no es superficie activa**: `PortalShell` no está en el árbol productivo de
  `App.tsx` (verificado: `App.tsx` no importa `PortalShell` ni `ShiftDetail`; sólo importa y usa
  `ShiftModal`); el Employee usa el shell común.
- **Estado auditado**: HEAD `42ff86995ad8a486af79d9d900ab3b069fff4a8e`, rama `development`,
  `PASS_WITH_GAPS`, 62 capturas, 65 journeys candidatos, 2/4 roles autenticados cubiertos con
  navegador.
- **Roles y scopes vigentes** (`ADR-2026-09-07-P5.7-team-roles-scopes.md`, D1–D12): User≠Employee sin
  degradar autoridad de rol; Áreas y Planners opcionales; Planner con 3 modos de scope
  (`ORGANIZATION`/`AREAS`/`EMPLOYEES`); transferencia de ownership como operación dedicada;
  autorización canónica `can(actor, action, target)`; "Solicitudes" nunca "Aprobaciones";
  anti-autoaprobación server-side.

## 4 · Guardarraíles innegociables

### 4.1 Operativos

- Sin `git push`, sin despliegues, sin tocar Producción, secretos, migraciones destructivas, `sudo`,
  Docker privilegiado ni `kill`/`pkill`.
- Toda mutación de datos en validación se hace con **datos sintéticos aislados** y autorización
  específica. El servidor local bloquea escrituras operativas: un rechazo de ese transporte **no es
  un finding de producto**.
- Backup antes de editar configuración. Verificar sintaxis, rutas, permisos y estado Git al cerrar
  cada fase.

### 4.2 DO_NOT_BREAK (sección 38 de la auditoría — inviolable, transpuesto literalmente)

| Fortaleza | No romper |
|---|---|
| Preview antes de escritura | Editar/retirar y diagnóstico sin guardar directamente |
| Recuperación de código desconocido | No descartar sin avisar ni recordar formato sin decisión |
| Identidad y permisos visibles | Scope de servidor y vocabulario User/Employee separado |
| Borrador explícito | **Nunca publicar automáticamente por importar futuros** |
| Wizard de persona | Cuenta opcional, ficha separada, resumen antes de alta |
| Modal manual accesible al cerrar | Escape y restauración de foco |
| Bulk con errores por fila | Mostrar motivo y permitir volver sin escribir |
| Landing móvil y temas | CTA móvil y marca coherente en claro/oscuro |

Cada una de estas 8 entradas aparece en los criterios de no regresión de al menos una fase — ver
tabla de trazabilidad en `03_IMPLEMENTATION_PLAN.md` §Trazabilidad DO_NOT_BREAK.

### 4.3 De alcance

- **Una mejora de presentación nunca amplía permisos.** Ningún cambio de layout, copy o
  accesibilidad puede alterar scopes, roles o autorización.
- No reinstaurar un segundo portal completo para recuperar una sola acción (aplica a CX-F06 —
  `PortalShell` permanece fuera del árbol productivo; la remediación conecta la acción en el shell
  activo, no revive el portal).
- No cambiar precios comerciales sin decisión de producto (aplica a CX-F09 — `priceHypothesis` en
  `src/lib/plans.ts` es una hipótesis comercial documentada como pendiente de validación de mercado;
  esta spec sólo corrige presentación/localización, nunca el importe).
- No hay conclusión legal ni certificado de accesibilidad: cualquier tema legal se etiqueta
  `COMPLIANCE_REVIEW` / `LEGAL_REVIEW_REQUIRED`, no se resuelve en esta spec.

### 4.4 Nota de gobernanza no bloqueante (a resolver por el propietario del repo, no por esta spec)

`docs/standards/MODAL_CONTRACT.md`, `docs/standards/LOCALIZATION_CONTRACT.md` y
`docs/standards/ANCLORA_PREMIUM_APP_CONTRACT.md` declaran cada uno una lista explícita de
"Repos a los que aplica"; `anclora-shiftimport` **no figura en ninguna de las tres listas**, pese a
que `AGENTS.md` del repo describe el producto como "Premium B2C". Esto no es una contradicción entre
instrucciones de la §5 (no bloquea la generación de esta spec): tratar estos contratos como
restricciones adicionales es compatible con `AGENTS.md` (silencioso al respecto) y con la regla de
jerarquía del workspace ("las reglas locales pueden añadir restricciones, no ampliar permisos"). Esta
spec **aplica** las reglas de `MODAL_CONTRACT.md` (regla de scroll, cierre visible, footer accionable)
y de `LOCALIZATION_CONTRACT.md` (no mezclar idiomas, no hardcodear copy) como restricciones de
diseño en las microtareas correspondientes (CX-F01/F02 y CX-F08/F09 respectivamente), pero deja
constancia de que su aplicabilidad formal a este repo está `UNKNOWN` hasta que el registro de
gobernanza (`contracts/governance/contracts-registry.json`, fuera de este repo, no auditado aquí) lo
confirme o lo desmienta. No se generó ningún bloqueo por esta causa.

También se deja constancia: `/home/toni/AGENTS.md` (citado en la jerarquía de `CLAUDE.md`) no existe
en esta máquina en esa ruta exacta; sólo se localizó `/Users/toni/.codex/AGENTS.md` (ámbito distinto,
no confirmado como equivalente) y `/Users/toni/Developer/anclora/AGENTS.md` (leído y aplicado
íntegramente). Marcado `UNKNOWN`, no bloqueante — las reglas de seguridad operativa de
`/Users/toni/Developer/anclora/AGENTS.md` (§Seguridad operativa) ya cubren el mínimo exigido y esta
spec no las contradice.

## 5 · TOOL_COMPATIBILITY_GAPS (Fase 0 — sin cambios de producto)

Los 6 gaps declarados en `evidence_coverage.TOOL_COMPATIBILITY_GAPS` del JSON, cada uno con
microtarea dedicada en Fase 0 (`03_IMPLEMENTATION_PLAN.md`):

1. Visual regression **no ejecutada** (`VISUAL_REGRESSION_COVERAGE`:
   `MANUAL_COMPARATIVE_PARTIAL / AUTOMATED_BLOCKED`) → `UXR-F0-M01`.
2. Locales TS no detectadas por `i18n-integrity-check` → `UXR-F0-M02`.
3. Rutas internas de App no detectadas (el detector vio sólo páginas convencionales) → `UXR-F0-M03`.
4. `design-system-consumer-check` no reconoce el paquete consumidor → `UXR-F0-M04`.
5. Scrollbars ocultadas por defecto en agent-browser → `UXR-F0-M05`.
6. Rutas de subida relativas ilegibles por la herramienta → `UXR-F0-M06`.

Más provisión de cuentas sintéticas `OWNER`/`PLANNER` (hoy `OWNER_COVERED=false`,
`PLANNER_COVERED=false`) y congelación de la matriz base (8 viewports × 2 temas × 2 locales) →
`UXR-F0-M07`/`UXR-F0-M08`.

## 6 · Históricos F1–F9 — destino explícito

| ID histórico | Estado en auditoría Codex | Destino en esta spec |
|---|---|---|
| F1 | `PARTIALLY_FIXED` (persistencia postcommit no probada) | Fase 4 — `UXR-F4-M03` |
| F2 | `NOT_RETESTED` (gate Personal exige cuenta Personal) | Fase 4 — `UXR-F4-M01` |
| F3 | `FIXED` | Sin acción (ya cerrado, no requiere microtarea) |
| F4 | `FIXED` | Sin acción (ya cerrado, no requiere microtarea) |
| F5 | `PARTIALLY_FIXED` (README B2B vs. resumen B2C/local-first en AGENTS) | Fase 4 — `UXR-F4-M04` |
| F6 | `PARTIALLY_FIXED` (tabla semanal aún desborda, E023) → mapea a CX-F02 | Fase 3 (`UXR-F3-M02`) + verificación Fase 4 — `UXR-F4-M05` |
| F7 | `FIXED` | Sin acción (ya cerrado, no requiere microtarea) |
| F8 | `PARTIALLY_FIXED` (destino efectivo impreciso) → converge con CX-F04 | Fase 2 (`UXR-F2-M03`/`M04`) + verificación Fase 4 — `UXR-F4-M06` |
| F9 | `NOT_RETESTED` (validación de nombre exige cuenta sin org) | Fase 4 — `UXR-F4-M02` |

Ningún histórico queda sin destino. `F3`, `F4`, `F7` están `FIXED` según la propia auditoría — no se
reabren ni se les asigna microtarea (reabrirlos sin evidencia de regresión iría contra la regla de
integridad).

## 7 · Flags de cobertura en `false` — destino explícito

Los 10 flags de `evidence_coverage` con valor `false` en el JSON, cada uno con destino en Fase 4:

| Flag | Destino |
|---|---|
| `STAGING_BROWSER_COVERED` | `UXR-F4-M12` |
| `PREVIEW_BROWSER_COVERED` | `UXR-F4-M12` |
| `OWNER_COVERED` | `UXR-F0-M07` (provisión) + `UXR-F4-M07` (ejecución) |
| `PLANNER_COVERED` | `UXR-F0-M07` (provisión) + `UXR-F4-M07` (ejecución) |
| `TEAM_IMPORT_COVERED` | `UXR-F4-M10` |
| `IDEMPOTENCY_COVERED` | `UXR-F4-M09` |
| `SAFE_DELETE_COVERED` | `UXR-F4-M09` |
| `PUBLISH_COVERED` | `UXR-F4-M08` |
| `APPROVAL_COVERED` | `UXR-F4-M08` |
| `CREDENTIAL_EXPORT_COVERED` | `UXR-F4-M11` |

## 8 · Acceptance criteria de esta spec (nivel documento, no nivel producto)

1. Los 10 findings tienen microtareas asignadas — ver `03_IMPLEMENTATION_PLAN.md` y trazabilidad en
   `06_FINAL_REPORT.md`.
2. Ninguna microtarea amplía permisos, scopes o roles.
3. Ningún gate en `docs/roadmap/UXR-*-GATE.md` está en `PASS` en el momento de entrega.
4. Todas las rutas de fichero citadas en findings y microtareas fueron verificadas existentes contra
   el HEAD actual del repo en el momento de escribir esta spec.

## 9 · Fuera de alcance (de esta spec, y de la implementación que la siga sin nueva decisión)

- Billing/Stripe, cambios de precio comercial, integración de calendarios externos, VLM/OCR nuevos,
  app móvil nativa, rediseño global, eliminación masiva de código legacy — ninguno de los 10 findings
  lo requiere.
- Certificación legal o de accesibilidad — cualquier hallazgo con matiz legal se etiqueta
  `COMPLIANCE_REVIEW` y queda fuera.
- Reinstauración de `PortalShell` como segunda superficie productiva (ver §4.3).
- Resolución del registro de gobernanza de contratos (§4.4) — corresponde al propietario del
  ecosistema, no a esta spec de un solo repo.
