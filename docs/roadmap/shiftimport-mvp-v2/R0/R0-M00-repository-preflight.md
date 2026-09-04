# R0-M00 — Repository Preflight

STATUS: DONE (completed 2026-09-04, this session)

## 1. Objetivo

Establecer el estado real del repositorio (HEAD, rama, working tree, arquitectura, modelo de datos, inventario de features, deuda, contradicciones documentales) antes de escribir cualquier spec de microfase, para que R0–R5 partan de hechos verificados y no de suposiciones del roadmap teórico.

## 2. Problema que resuelve

Sin un preflight verificado, las specs posteriores podrían reimplementar funcionalidad ya existente (alto riesgo dado que R1 Safe Import ya está mayormente DONE) o asumir contratos de datos que no coinciden con las migraciones reales.

## 3. Estado actual del repositorio

HEAD `3d866e0` en `development`, working tree limpio. Auditoría completa realizada: arquitectura (Vite+React / Vercel functions / Postgres-Neon sin ORM), 12 migraciones leídas íntegramente, inventario de features clasificado DONE/PARTIAL/MISSING, 95 archivos de test enumerados, contradicción README vs código identificada. Ver evidencia completa en `../00-BASELINE.md`.

## 4. Alcance IN

- Captura de `git status`, `git branch --show-current`, `git rev-parse HEAD`, `git log -10 --oneline`.
- Lectura de arquitectura frontend/backend/DB.
- Lectura íntegra de las 12 migraciones en `db/migrations/`.
- Clasificación de features (auth, orgs, memberships, employees, areas, import individual/equipo, format memory, recovery, history, safe delete, idempotency, bulk provisioning, linking, i18n, tema).
- Enumeración de tests existentes.
- Lectura de README.md, README.en.md, AGENTS.md (si presente en repo), SETUP.md, backend-setup.md, implementation_plan.md, docs/, sdd/.
- Identificación de contradicciones documentales y deuda técnica.

## 5. Alcance OUT

- N/A — motivo: microfase de solo lectura/documentación, no hay alcance de implementación que excluir.

## 6. Dependencias

Ninguna — es la primera microfase.

## 7. Decisiones arquitectónicas

N/A — motivo: microfase de auditoría, no toma decisiones de arquitectura (esas empiezan en R0-M05).

## 8. Modelo de datos afectado

N/A — motivo: solo lectura, ninguna migración ni escritura.

## 9. API / Backend

N/A — motivo: solo lectura.

## 10. Frontend / UX

N/A — motivo: solo lectura.

## 11. Seguridad y autorización

N/A — motivo: no hay cambios de superficie de ataque; es auditoría de solo lectura sobre un repo ya clonado localmente.

## 12. i18n

N/A — motivo: no aplica a un preflight de auditoría.

## 13. Accesibilidad

N/A — motivo: no aplica, no hay UI producida por esta microfase.

## 14. Responsive / temas

N/A — motivo: no aplica.

## 15. Observabilidad / errores

N/A — motivo: no aplica.

## 16. Migraciones

N/A — motivo: no se crean ni modifican migraciones.

## 17. Compatibilidad y datos existentes

N/A — motivo: no se toca ningún dato.

## 18. Tasks

### T01 — Repository preflight audit

Objetivo:
Producir `00-BASELINE.md` y `00-ROADMAP-MASTER.md` con estado real verificado del repositorio.

Archivos / módulos probables:
`docs/roadmap/shiftimport-mvp-v2/00-BASELINE.md`, `docs/roadmap/shiftimport-mvp-v2/00-ROADMAP-MASTER.md`.

Cambios:
Ninguno en código. Solo creación de los dos documentos de baseline.

No hacer:
No modificar código de producto, no hacer commits de código, no reset destructivo.

Criterios de aceptación:
- [x] `git status`, branch, HEAD y log capturados.
- [x] Arquitectura documentada (frontend, backend, DB, ingestion engine, i18n, tema).
- [x] Modelo de datos de las 12 migraciones documentado en tabla.
- [x] Features clasificadas DONE/PARTIAL/MISSING con evidencia file:line.
- [x] Tests existentes enumerados.
- [x] Contradicciones documentales identificadas (README B2C/"Phase 0" vs código B2B/B2B2E).
- [x] Deuda y riesgos documentados.

Tests:
N/A — microfase documental, no produce código testeable.

Evidencia esperada:
`../00-BASELINE.md`, `../00-ROADMAP-MASTER.md` (ambos ya escritos).

## 19. Tests obligatorios

N/A — motivo: microfase documental sin código ejecutable.

## 20. Evidencias

- `../00-BASELINE.md` — auditoría completa.
- `../00-ROADMAP-MASTER.md` — tabla de microfases R0–R5 + POST-MVP.
- Salida de `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git log -10 --oneline` (capturada en esta sesión, working tree limpio, HEAD `3d866e0`).

## 21. Gate

Gates requeridos: **G0 (Repository/baseline integrity)**.

G0: PASS si `00-BASELINE.md` y `00-ROADMAP-MASTER.md` existen, están basados en lectura real del repo (no inventados), y el working tree quedó limpio (sin cambios de código colaterales).

Resultado: **PASS**.

## 22. Rollback / remediación

N/A — motivo: no hay cambios reversibles que remediar; si el baseline resultase incorrecto, se corrige editando los documentos, no hay rollback de código.

## 23. Criterio de DONE

`00-BASELINE.md` y `00-ROADMAP-MASTER.md` existen, commiteados o listos para commit, y ninguna spec posterior depende de suposiciones no verificadas contra el repo real.

STATUS: DONE.
