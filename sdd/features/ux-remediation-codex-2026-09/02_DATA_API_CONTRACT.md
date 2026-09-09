# UX Remediation Codex 2026-09 — Data & API Contract

Esta remediación es mayoritariamente de presentación (layout, accesibilidad, i18n) y no introduce
tablas, migraciones ni endpoints nuevos. Los contratos existentes que se tocan (siempre en su forma
de tipos/funciones cliente, nunca en su forma server-side de autorización) se listan aquí.

## Sin cambios de esquema

Ningún finding de esta spec requiere `db/migrations/*.sql` nuevo. Ninguna microtarea toca `api/`.
Esto es una restricción explícita heredada de la misión (§0 del prompt maestro): "No modificas
`src/`, `api/`, `db/` ni configuración de despliegue" se aplica a **esta spec como documento**; las
microtareas que ella describe sí tocarán `src/` cuando se implementen (fuera del alcance de este
agente), pero ninguna de ellas toca `api/` ni `db/` porque los 10 findings son de UI/cliente.

## Contratos cliente tocados

### `src/lib/import-temporal.ts` (CX-F04 — `UXR-F2-M03`)

Estado actual (verificado, fichero completo de 22 líneas):

```ts
export type FutureImportDecision = 'draft' | 'historical-only';

export interface TemporalImportSplit<T> {
  historical: T[];
  future: T[];
}

export function splitImportByOperationalDate<T extends { date: string }>(
  records: T[],
  today = getOperationalDate(),
): TemporalImportSplit<T>
```

Adición prevista (aditiva, no rompe la firma existente):

```ts
export interface TemporalEffectiveSummary {
  detected: number;        // total de fechas futuras detectadas en el documento
  includedAsDraft: number; // futuras que sí se convertirán en borrador según rol+decisión
  excludedByRole: number;  // futuras excluidas por el rol del importador (p.ej. EMPLOYEE)
}

export function deriveEffectiveTemporalSummary(
  split: TemporalImportSplit<{ date: string }>,
  context: { identityLocked: boolean; decision: FutureImportDecision },
): TemporalEffectiveSummary
```

Pura, sin I/O, sin dependencia de red. `identityLocked` y `decision` son los mismos conceptos que
`ImportModal.tsx` ya maneja hoy (no se inventan conceptos nuevos).

### `src/lib/bulk-import-csv.ts` + `classifyUserRow` en `MembersModal.tsx` (CX-F05 — `UXR-F2-M05`)

Estado actual del tipo de resultado (inferido del uso en `MembersModal.tsx`, valores de `status`
observados en el código: `invalid_email`, `invalid_role`, `duplicate_in_file`, `employee_not_found`,
`employee_already_linked`, `user_already_linked`, `already_linked`, `existing_and_link`,
`no_employee`, `new_and_link`).

Cambio previsto: introducir un status explícito para duplicado intra-fichero de
`externalEmployeeId` nuevo (distinto de `duplicate_in_file`, que hoy sólo cubre email duplicado), con
referencia a la fila original (índice), y separar el conteo del resumen para que `no_employee` nunca
se agregue bajo la misma etiqueta que `existing_and_link`/`already_linked`. Detalle exacto de los
nuevos valores de enum se decide en implementación (`UXR-F2-M05`), no en esta spec — esta spec fija
el contrato de comportamiento (AC en `03_IMPLEMENTATION_PLAN.md`), no el nombre literal del enum.

**Sin cambio en `bulk-import-csv.ts` a nivel de parseo de fichero** — el parser de columnas
(`columnIndex`, `parseEmployeeCsv`/`parseUserCsv` equivalentes) no cambia su contrato de entrada;
sólo `CX-E01` toca el fixture, nunca el parser.

### `test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv` (CX-E01 — `UXR-F1-M04`)

Antes: `name,externalEmployeeId,area,areaCode,status` (camelCase, incompatible).
Después: `name,external_employee_id,area,areaCode,status` (snake_case en la columna que el parser
exige; el resto de columnas no están sujetas al contrato del parser de empleados y se mantienen).

### `index.html` / provider de `I18nContext` (CX-F08 — `UXR-F1-M02`)

`index.html:2` pasa de `<html lang="es">` estático a un valor inicial coherente con el locale por
defecto (sin cambiar el default actual), sincronizado en runtime por el provider de `I18nContext` en
cada cambio de locale. No se toca `src/lib/use-i18n.ts` (es sólo el hook de consumo); el punto de
escritura real (`document.documentElement.lang = ...`) se localiza y confirma durante la
implementación de `UXR-F1-M02`.

### `src/lib/plans.ts` / `src/pages/PricingPage.tsx` (CX-F09 — `UXR-F1-M03`)

`PlanDefinition.priceHypothesis: string` (campo único, mezcla importe+moneda+intervalo+prefijo) pasa
a campos estructurados, ejemplo de forma prevista (a confirmar en implementación):

```ts
export interface PlanPrice {
  amount: number | null;   // null para "Free" / gratis
  currency: 'EUR';
  interval: 'month';
  fromPrefix: boolean;     // true para "Desde 19 €/mes"
}
```

`PricingPage.tsx` renderiza `amount`/`currency`/`interval`/`fromPrefix` a través de la capa de i18n
(pluralización e interval label localizados), nunca concatenando un sufijo de intervalo sobre un
string ya compuesto. El valor numérico (`4.99`, `19`, `0`) no cambia respecto al `priceHypothesis`
actual — ver DO_NOT_BREAK de CX-F09.

## Sin cambios de permisos

Ninguno de los contratos anteriores introduce un nuevo endpoint, una nueva verificación de rol, ni
un nuevo scope. Todas las funciones descritas son puras (cálculo/derivación) o de presentación
(render), consumidas por componentes que ya operan bajo el contexto de sesión/rol existente.
