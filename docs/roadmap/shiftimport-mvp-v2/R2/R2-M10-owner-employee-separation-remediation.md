# R2-M10 — Remediación: separación OWNER / Employee

STATUS: DONE — PASS

## 1. Objetivo

Eliminar la creación implícita de `Employee` durante el onboarding de una organización y hacer explícita cualquier relación `OWNER → Employee`.

## 2. Root cause confirmada

`api/onboarding/onboarding.js` convertía `employeeName ?? adminName` en `employeeName`. Cualquier `adminName` no vacío disparaba el tercer `INSERT` de onboarding y creaba un Employee activo vinculado al usuario OWNER. Esto violaba el dominio `OWNER ≠ EMPLOYEE`.

## 3. Contrato resultante

- `ownerIsEmployee` es un booleano estricto y su valor por defecto es `false`.
- `false`: onboarding crea `Organization + User existente + Membership OWNER`, sin Employee.
- `true`: onboarding crea además un Employee activo vinculado al User.
- `adminName` se conserva sólo como alias de `ownerName` para actualizar `User.display_name`; nunca es una señal de creación de Employee.
- `employeeName` sin `ownerIsEmployee: true` se ignora para evitar compatibilidad peligrosa.
- El planificador sigue consumiendo Employees activos tenant-scoped; no excluye OWNER por rol.

## 4. Cambios

- `api/onboarding/onboarding.js`: desacoplamiento de identidad OWNER y Employee, manteniendo la transacción existente.
- `src/lib/session.ts`, `src/App.tsx`: envío explícito de `ownerIsEmployee` y nombre de Employee sólo en ese flujo.
- `src/components/shift-dashboard/OnboardingChoiceModal.tsx`: checkbox no seleccionado por defecto y campo de Employee visible sólo tras opt-in.
- `src/lib/i18n.ts`: copy ES/EN accesible y localizado.
- Tests nuevos en `api/onboarding/onboarding.test.js` y `OnboardingChoiceModal.test.tsx`.

## 5. Remediación de datos en Neon Development

Antes de borrar se verificó, por UUID, el Employee de Toni:

| Campo | Valor |
|---|---|
| Organization | `c88ef74e-2ff7-4e78-8e8d-bfe37c6ae95a` — Anclora Group |
| User | `aab3f60b-e83c-447b-9eb3-551b83dfdd2d` |
| Membership | `OWNER` |
| Employee | `403096ee-5444-4017-acab-900ed3f795aa` — Toni |
| Status | `active` |
| `external_employee_id` | `NULL` |
| `area_id` | `NULL` |

Referencias operativas verificadas antes de la modificación: `shifts=0`, `shift_assignments=0`, `imports=0`, `shift_acknowledgements=0`, `shift_comments=0`, `change_requests=0`, `approval_requests=0`. Las seis FKs existentes hacia `employees` no tenían filas referenciando ese UUID.

Se eliminó exclusivamente ese Employee dentro de Development. La organización pasó de 47 a 46 Employees; ninguna otra fila fue eliminada y el User/Membership OWNER permaneció intacto. La consulta posterior confirmó `employee_count=0` para ese User dentro de la organización.

No se tocó `Cadena Aurora Hoteles`: la coincidencia encontrada allí correspondía a otras personas y no era el registro de Toni.

## 6. Tests y evidencias

- API onboarding: OWNER-only, opt-in explícito, compatibilidad `adminName` y legacy `employeeName` sin opt-in — PASS.
- UI onboarding: checkbox por defecto desactivado y envío explícito `false/true` — PASS.
- Suite Vitest completa: **137 archivos, 1220 tests PASS**.
- `npm run lint` — PASS.
- `npm run build` — PASS; permanece el warning conocido de chunks grandes.
- Smoke real HTTP + Neon Development: `ownerIsEmployee=false` produjo 0 Employees; `ownerIsEmployee=true` produjo 1 Employee activo vinculado; fixtures temporales limpiados — PASS.
- Smoke browser de scheduling: 7/9 PASS. Los 2 fallos son tests preexistentes de EMPLOYEE que esperan el botón `Salir` en una pantalla ya modificada por R4; las pruebas de planner, aislamiento, drafts, edición, publicación y UI semanal pasaron. No hay cambios en autorización ni scheduling en esta remediación.

## 7. Gate

- G3 — PASS: `OWNER` y `Employee` son entidades independientes.
- G4 — PASS: onboarding valida el opt-in en backend y conserva autorización existente.
- G10 — PASS: suite unitaria/integración completa.
- G11 — PASS_WITH_WARNING: smoke browser de scheduling; warning externo y preexistente documentado arriba.
- G12 — PASS: no hay creación User→Employee implícita en los flujos revisados.
- G13 — PASS: planner mantiene la regla `Employee.status = active`.
- G15 — PASS: lint y build.

Gate final de la remediación: **PASS**.
