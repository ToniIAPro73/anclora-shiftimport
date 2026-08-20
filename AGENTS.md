# AGENTS.md — Anclora ShiftImport

## Resumen del repositorio
- Producto Premium B2C: importador inteligente de cuadrantes para trabajadores por turnos.
- App Vite + React + TypeScript. Persistencia local-first en `localStorage`.
- Flujo vinculante: importar cuadrante → previsualizar/editar → calendario.
- Derivado comercial de `anclora-groundsync` (historia Git preservada). GroundSync sigue operativo y NO se modifica desde este repo.
- Adopción AOS: `.anclora/AOS_ADOPTION.md` (fuente canónica del estado de adopción local).

## Estructura relevante
- `src/App.tsx`: estado principal, navegación por mes, modales y persistencia.
- `src/components/shift-dashboard/`: UI del calendario, métricas e importación.
- `src/lib/types.ts`: tipos `Shift` y derivados.
- `src/lib/profile.ts`: `UserProfile` configurable (identidad del usuario, sin PII por defecto).
- `src/lib/shift-types.ts`: registro `ShiftTypeDefinition` neutro + overrides de usuario (localStorage `anclora_shiftimport_shift_types_v1`) + resolver de alias del parser.
- `src/lib/storage.ts`: persistencia en `localStorage` (sync remoto opt-in vía `VITE_ENABLE_REMOTE_STORAGE`).
- `src/lib/week.ts`, `src/lib/time.ts`: cálculos de calendario, fechas y horas.
- `src/lib/shifts.ts`: lógica de negocio de turnos y métricas.
- `src/ingestion/`: ingesta de cuadrantes PDF — `core/` (primitivas puras: items de texto, normalización, tokens, clustering, detección de fila, construcción de turnos), `profiles/` (perfiles declarativos TYPE_A/TYPE_B con umbrales y tokens), `parsers/` (pipeline puro sobre items + API de fichero con PDF.js), `analysis.ts` + `assistant.ts` (análisis de calidad y asistente de formato posicional, Phase 1A), `tabular-assistant.ts` (fallback del asistente para CSV roster/grid sin layout posicional), `diagnostics.ts` (Phase 1B: modelo canónico de estados de importación READY/NEEDS_USER_INPUT/PARTIAL/BLOCKED/UNSUPPORTED/FAILED + diagnósticos estructurados con recuperación guiada; la UI consume esto, nunca excepciones crudas).
- `sdd/`: especificaciones de producto.
- `db/migrations/` + `db/migrate.mjs`: esquema PostgreSQL versionado (Fase 1). Aplicar con `node --env-file=.env.development.local db/migrate.mjs`.
- `api/`: Vercel Functions multi-tenant sobre Neon (Fase 1). `_lib/auth.js` (sesiones cookie + contexto de seguridad), `_lib/data.js` (data-access org-scoped, tests con sql fake), `auth/`, `session/`, `employees/`, `imports/`, `shifts/`. Aislamiento por `organization_id` forzado en backend, nunca en frontend.
- Backend legacy en saneamiento: `server.mjs`, `server-export.mjs`, `proxy-server.mjs`. El antiguo `/api/shifts` global sin auth fue reemplazado por la API autenticada.
- Modelo multi-tenant: Organization (personal=B2C / company=B2B), User (acceso), Membership (rol ADMIN/MANAGER/EMPLOYEE), Employee (persona del cuadrante, user_id opcional), Import (documento), Shift (siempre con organization_id + employee_id). Ver `docs/fase1-multitenant.md`.
- Modo invitado local-first intacto: sin sesión, todo sigue en `localStorage`. Con sesión, persistencia remota por empleado; migración one-shot local→remoto (sin borrar la copia local).

## Comandos útiles
- `npm run dev`: desarrollo local.
- `npm run build`: validación principal (tsc + vite build).
- `npm run lint`: linting estricto (`--max-warnings 0`).
- `npm test`: Vitest (src + api).
- `node --env-file=.env.development.local db/migrate.mjs`: aplicar migraciones Neon.
- `node --env-file=.env.development.local scripts/smoke-api.mjs`: smoke test E2E de la API (crea y limpia datos de prueba).

## Convenciones del proyecto
- Fechas ISO `YYYY-MM-DD`; horas `HH:mm`.
- La app muestra meses 0-indexados internamente y días ISO en la UI/datos.
- La importación nunca escribe directamente en almacenamiento: preview editable primero.
- Ramas: `development` (default, trabajo diario), `staging`, `production`, `main`. No promocionar sin aprobación humana.
- Commits semánticos pequeños; staging explícito (nunca `git add .`).

## Reglas para cambios
- Mantener el flujo: detectar, previsualizar, editar y confirmar.
- Multi-tenant: toda operación de datos pasa por `api/_lib/data.js` con contexto de sesión; prohibido confiar en IDs de organización/empleado enviados por el cliente sin validar pertenencia. Ningún Shift sin `organization_id` + `employee_id`. Conflicto de re-importación = organization + employee + fingerprint, nunca solo fecha.
- Nada de PII hardcodeada: identidad de usuario vive en `UserProfile` configurable (Phase 0).
- Tipos de turno configurables vía `ShiftTypeDefinition`; JT no es feature especial.
- La importación nunca falla en silencio: estados canónicos + diagnósticos estructurados en `src/ingestion/diagnostics.ts` (Phase 1B). Cero turnos nunca es "Correcto"; un código de turno desconocido nunca se descarta sin avisar; el mes/año seleccionado por el usuario es autoritativo (conflicto = `MONTH_MISMATCH` bloqueante con elección explícita).

## Tipos de turno configurables
- El registro efectivo es `DEFAULT_SHIFT_TYPES` (neutro: Regular, Libre, Vacaciones, Extras) + overrides del usuario en localStorage (`anclora_shiftimport_shift_types_v1`).
- API en `src/lib/shift-types.ts`: `getShiftTypes()` (registro efectivo), `loadShiftTypeOverrides`/`saveShiftTypeOverrides`, `mergeShiftTypeOverrides`, `upsertShiftType`, `setShiftTypeAlias`, `resolveShiftTypeId` (alias personalizados → alias por defecto → match por id/label).
- Los tipos/alias específicos de empresa heredados de GroundSync (JT, `dl`, `aj`, `td`) NO son defaults del producto: viven en `SHIFT_TYPE_PRESET_EXAMPLE`. Para restaurar el comportamiento heredado: `mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE)`.
- No hay UI de gestión de tipos todavía (no existe lugar natural en los modales actuales); la capacidad está disponible vía API + persistencia. Además, el asistente de importación (Phase 1B) aprende alias/tipos al clasificar códigos desconocidos: `codeTimes` en el `UserFormatProfile` + `applyTokenAliasesToShiftTypes`.
- Fixtures de tests siempre sintéticos; nunca cuadrantes reales.
- Evitar dependencias nuevas sin razón clara; el repo es ligero y mayormente frontend.
- No renombrar ni referenciar GroundSync salvo como provenance histórica.

## Riesgos conocidos
- El parser PDF es la parte más frágil; heurísticas acopladas a formatos concretos (en extracción a perfiles, Phase 0).
- Riesgo de duplicados al importar repetidamente: deduplicación semántica en Phase 0.
- Mensajes de commit heredados en la historia contienen PII del origen; por eso el repo es privado.

## Pistas para futuros agentes
- Antes de tocar el parser, revisar `sdd/` y los perfiles de ingesta.
- Validar siempre con `npm run lint && npm run build` (y tests cuando existan).
- Si cambias `ImportModal`, verifica que siga permitiendo editar y borrar filas antes de confirmar.
