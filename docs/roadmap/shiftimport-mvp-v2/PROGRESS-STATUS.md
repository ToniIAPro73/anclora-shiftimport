# Progress Status — MVP v2 Roadmap Execution

Última actualización: 2026-09-04, HEAD `2a64852` en `development`.

Estado de ejecución del prompt maestro (`docs/roadmap/shiftimport-mvp-v2/00-ROADMAP-MASTER.md`). Este documento es un snapshot de progreso, no un documento de spec — para retomar el trabajo, léase junto con `00-BASELINE.md` y `00-ROADMAP-MASTER.md`.

## Hecho

### Fase de specs (completa)
- `00-BASELINE.md`, `00-ROADMAP-MASTER.md` — auditoría del repo y tabla de dependencias.
- 86 specs de microfase (R0-R5 + POST-MVP) generadas en `docs/roadmap/shiftimport-mvp-v2/{R0..R5,POST-MVP}/`.

### R0 — Product & Architecture Rebaseline: **COMPLETO (PASS)**
Las 8 microfases (R0-M00..M07) cerradas. Entregables clave:
- README.md/README.en.md reescritos: B2B/B2B2E real, no B2C/"Phase 0".
- `DOMAIN-GLOSSARY.md`, `RBAC-MODEL.md` (diseño OWNER/ADMIN/PLANNER/EMPLOYEE + scopes, regla de backfill de OWNER — **pendiente de sign-off de producto**), `STATE-MODEL.md` (Shift lifecycle/Acknowledgement/Change Request como máquinas separadas), `MODULE-BOUNDARIES.md`.
- Corrección real durante ejecución: el roadmap asumía que no existía router — se encontró `src/lib/route.ts` ya funcionando; decisión revisada a "extender, no reemplazar".
- Gate agregado: PASS. `R0-FINAL-GATE-REPORT.md`.

### R1 — Safe Import Completion: **COMPLETO (PASS)**
Las 17 microfases (R1-M00..M16) cerradas. Tres bugs reales encontrados y corregidos (no solo documentados):
- **R1-M05**: el resumen de comparación en import de equipo solo mostraba 3 de las 5 categorías exigidas (nuevos/conflictos, faltaban duplicados/ignorados/errores) — corregido.
- **R1-M08**: `upsertShifts` escribía turno a turno sin transacción — un fallo a mitad de lote dejaba escritura parcial — corregido con `sql.transaction`.
- **R1-M14**: el spinner de import no respetaba `prefers-reduced-motion` — corregido.
- Hallazgo documentado, no corregido (requiere decisión de producto): imports totalmente fallidos nunca se persisten en el historial (`status='failed'` no tiene ningún path de código) — R1-M09.
- Gate agregado: PASS. `R1-FINAL-GATE-REPORT.md`.

### R2 — Organization Foundation: **EN PROGRESO (3 de 13 microfases)**
- **R2-M00** (Existing Multi-Tenant Audit): PASS. Las 6 tablas de negocio confirmadas `organization_id NOT NULL` + scoped en cada query.
- **R2-M01** (Organization Settings): PASS. Brecha real cerrada — no existía forma de renombrar una organización. Añadido: `updateOrganizationName` (data.js), `api/organizations/current.js` (GET/PATCH), UI en `SettingsModal.tsx` (pestaña Equipo).
- **R2-M02** (Employee Lifecycle): PASS. Brecha de test cerrada (paridad individual vs bulk-link). **Brecha de datos real encontrada y corregida en el Neon de desarrollo** (con aprobación explícita del usuario): 16 empleados vinculados a un usuario pero atascados en `pending_access` (leftover del bug pre-`3d866e0`) — reconciliados con un UPDATE acotado e idempotente.

Todo commiteado en `development`, ningún push realizado.

## Por hacer

### R2 — Organization Foundation (10 microfases restantes)
- R2-M03 Areas (verificación, ya DONE por diseño)
- R2-M04 User↔Employee Linking (verificación, ya DONE por diseño)
- R2-M05 Bulk Provisioning (verificación, ya DONE por diseño)
- **R2-M06 Roles (OWNER/ADMIN/PLANNER/EMPLOYEE)** — implementación real: ejecuta la migración diseñada en `RBAC-MODEL.md`, incluyendo el backfill de OWNER (requiere el sign-off de producto pendiente desde R0-M03)
- **R2-M07 Scopes (ORGANIZATION/AREA/SELF)** — implementación real
- **R2-M08 API Authorization Enforcement** — implementación real, extiende `requireRole`/`auth.js`
- R2-M09 Organization Audit Events — implementación real (tabla/mecanismo nuevo)
- R2-M10 Onboarding Reconciliation — verificación
- R2-M11 Cross-Tenant Isolation E2E — nuevos tests E2E
- R2-M12 R2 Final Gate

### R3 — Future Scheduling (17 microfases, todo greenfield)
Schedule/ScheduleVersion/ShiftAssignment — modelo de datos nuevo, API nueva, UI de planificador semanal nueva. Depende de R2-M06/M07 (roles/scopes) y de la decisión de routing de R0-M05 (ya resuelta: extender `route.ts`).

### R4 — Employee Portal (14 microfases, todo greenfield)
Portal móvil-first (Hoy/Semana/Solicitudes/Más), Acknowledgement, Change Request. Depende de R3-M10 (Publication).

### R5 — Approval Lite (13 microfases, todo greenfield)
ApprovalPolicy, inbox de aprobador, aprobar/rechazar, aplicar cambio aprobado. Depende de R4-M06. Termina en R5-M12 (MVP Release Gate) — el gate global que valida todo el flujo end-to-end.

### POST-MVP (documentado, no se implementa salvo instrucción explícita)
R6 Workflow Engine, R7 Attendance, R8 Reconciliation & Reporting, R9 Advanced Organizational Model.

## Siguiente paso

**R2-M03 — Areas.** Es una microfase de verificación (Areas ya está DONE por diseño desde antes de este roadmap — migración 0008, `api/areas/index.js`). Después de M03/M04/M05 (verificación rápida, ya construidas), el siguiente hito real de implementación es **R2-M06 (Roles)**, que:

1. requiere confirmar antes de ejecutar el backfill de OWNER — la regla propuesta en `RBAC-MODEL.md` ("membership ADMIN con `created_at` más antiguo por organización → OWNER") sigue pendiente de aprobación explícita de producto;
2. ejecuta la migración SQL ya diseñada (constraint `role IN ('OWNER','ADMIN','PLANNER','EMPLOYEE')` + columnas de scope) contra Neon — una migración de esquema real sobre datos reales, con el mismo nivel de cuidado aplicado en R2-M02.

Comando para retomar: continuar la ejecución microfase por microfase desde R2-M03, siguiendo el mismo patrón (leer spec → task → test/build/lint → Gate → commit) usado en R0-R2.
