# Design System Wave 3 / Pilot 3 — ShiftImport Forms

Estado: piloto de consumidor en `development`. No modifica el repositorio del
Design System ni introduce una abstracción Combobox.

## Consumo y alcance

ShiftImport era un consumidor **C — local reimplementation**: no tenía una
dependencia de `@anclora/design-system` y mantenía primitivas de formulario en
`src/index.css`, además de wrappers y selectores de producto. El piloto añade la
dependencia exacta `@anclora/design-system#bd16740`, instalada como versión
`0.9.0`, e importa los entrypoints de tokens, primitives y `form-field`.

La integración está deliberadamente puenteada: los tokens canónicos de Forms se
resuelven hacia las superficies existentes de ShiftImport, sin sustituir el
theme system ni retheme global de pantallas no participantes.

## Inventario y matriz de selección

| Superficie | Control | Implementación actual | Estados/evidencia | Candidato DS | Riesgo |
| --- | --- | --- | --- | --- | --- |
| `ChangeRequestForm` | select nativo | JSX + CSS local | selected, disabled al enviar, ES/EN | `.field-select` + Field | bajo |
| `ChangeRequestForm` | time inputs | JSX + CSS local | filled, required, disabled al enviar | `.field-input` | bajo |
| `ChangeRequestForm` | textarea | JSX + CSS local | placeholder, required, validation, feedback | `.field-textarea` + Field | bajo |
| `GrantAccessModal` | email + native select | wrapper `ModalShell` + CSS Equipo | required visual, `aria-invalid`, error | candidato futuro | medio |
| `PendingInvitationsModal` | search + sort select | CSS local | label ARIA, filter, disabled actions | Search/Input + Select | medio |
| `ImportModal` | `ModalSelect` | custom portal listbox | selected, disabled, keyboard/portal positioning | product-specific | alto |
| `SearchableSelect` | searchable listbox | custom portal combobox | filter, arrows, Enter/Escape, `aria-activedescendant` | evidence only | alto |
| `BulkCsvImportModal` | file input + preview | business workflow | parse errors, async state | no migration in pilot | alto |

Se eligió `ChangeRequestForm` porque es coherente, operativo y reutilizado desde
`ShiftDetail`, `NewChangeRequestModal` y `RequestStatus`. Proporciona evidencia
real de Field/Control y de validación sin mezclar parsing de ficheros,
permisos, organización o API de administración.

## Contrato aplicado

- `Field`: `ac-form-field`, `ac-form-field__head`, `ac-form-field__label`,
  `ac-form-field__control`, `ac-form-field__message`.
- `Control`: `field-select`, `field-input`, `field-textarea`.
- Motivo: `required` real, visible `*`, `aria-invalid` solo cuando falla la
  validación local y `aria-describedby` hacia hint/feedback.
- Error: mensaje legible en el DOM, `role="alert"` para error de red o
  validación y `data-tone="danger"` para la presentación semántica.
- Disabled: select, horas, textarea y submit se bloquean durante el envío.
  No se usa readonly porque este workflow no presenta un valor contextual
  editable bloqueado; no se ha inventado ese estado.
- La lógica de validación y llamadas remotas permanece en la aplicación.

## Evidencia Combobox

### `src/components/ui/SearchableSelect.tsx`

- Propósito: selección de una opción con búsqueda local en listas de empleados,
  áreas u otros catálogos.
- Modelo: single-select; no acepta texto libre ni múltiples valores.
- Opciones: locales, filtradas por `label`/`searchText`.
- Teclado: foco automático en el input al abrir; ArrowUp/ArrowDown, Enter y
  Escape; vuelve el foco al trigger al seleccionar/cerrar.
- ARIA: trigger `aria-haspopup=listbox`, `aria-expanded`; input
  `role=combobox`, `aria-controls`, `aria-activedescendant`; lista `role=listbox`
  y opciones `role=option` con `aria-selected`.
- Mobile: menú portal anclado al trigger, calcula espacio disponible y limita
  altura; requiere verificación visual específica por contexto.
- Reutilización: compartido por varias superficies de ShiftImport, pero sigue
  acoplado a `.modal-select-*`, posicionamiento portal y option model local.

### `ImportModal.tsx::ModalSelect`

- Propósito: seleccionar periodo, año, área y otros datos de importación.
- Modelo: single-select, opciones locales, sin texto libre ni multi-select.
- Teclado: trigger abre/cierra; selección por botones `role=option`; portal y
  cálculo de espacio para modales con overflow.
- ARIA: trigger `aria-haspopup=listbox`, `aria-expanded`, menú `role=listbox`,
  opciones `role=option`/`aria-selected`; no es un Combobox porque no existe
  input de filtrado.
- Mobile: portal con flip vertical y `maxHeight`; depende del modal anfitrión.

Conclusión: **NOT_ENOUGH_EVIDENCE** para promover un Combobox canónico. Hay
evidencia de un searchable listbox/combobox de producto y un select custom, pero
la semántica, el posicionamiento, el option model y el contexto de uso todavía
son demasiado específicos. Requiere una decisión separada de diseño y evidencia
de otro consumidor materialmente distinto.

## Feedback de Design System

- `PRODUCT_SPECIFIC`: identidad, superficies, tipografía y spacing global de
  ShiftImport se conservan mediante aliases hacia el contrato Forms.
- `CONSUMER_LEGACY`: CSS local del workflow redefinía borde, altura, fondo y
  focus; se retiró solo para el piloto seleccionado.
- `COMPATIBILITY_WORKAROUND`: se importan tokens DS y se reasignan aliases
  locales para evitar rethemear pantallas fuera del piloto.
- `COMBOBOX_EVIDENCE`: los dos patrones de selección custom no deben fusionarse
  aún en el Design System.
- No hay migración de base de datos, lógica de negocio, API, permisos ni datos.

## Verificación del piloto

- Dependencia instalada: `@anclora/design-system` `0.9.0`, commit
  `bd167400ad8eb6460b57e761a19975feaa572646`.
- Visual QA real con `agent-browser`: desktop oscuro ES, mobile oscuro ES,
  mobile claro ES y mobile claro EN; se comprobó también foco, required,
  feedback y ausencia de overflow horizontal a `375px`.
- Axe sobre `.employee-change-request`: **0 violations**; el contraste del CTA
  se corrigió usando `--text-on-accent`.
- `ChangeRequestForm.test.tsx`: 4/4; lint y build: OK.
- Suite completa: 1 fallo preexistente aislado en
  `api/_lib/invitations.test.js` (`resolves the safe acceptance mode without
  exposing account details`); el piloto no modifica ese API ni sus tests.
