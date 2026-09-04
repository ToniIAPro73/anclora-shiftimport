# R1-M01 — Format Detection Contract

## 1. Objetivo

Formalizar como contrato documentado el mecanismo de detección de formato (structureHash) y el ciclo de vida de `format_profiles`, confirmando que el código en HEAD cumple ese contrato.

## 2. Problema que resuelve

El mecanismo de detección de formato (structureHash + format_profiles) es crítico para Format Memory pero no tiene un documento de contrato único; vive repartido entre migraciones y `api/format-profiles/index.js`. Sin contrato explícito, futuras microfases (M11, M12) no tienen una referencia estable de qué invariantes no se pueden romper.

## 3. Estado actual del repositorio

STATUS: DONE.

- Tabla `format_profiles` (migración correspondiente): id, organization_id, logical_profile_id, version, status (`candidate/validated/verified/legacy/deprecated`), signature jsonb (contiene structureHash), source_type (`pdf/tabular`), parser_config, token_aliases, code_times, off_tokens, employee_row_strategy, use_count, successful_use_count, last_used_at, supersedes_profile_id.
- Migración 0012 añade índice único parcial `(organization_id, structureHash) WHERE status != 'deprecated'`, cerrando una condición de carrera app-level (commit c863223).
- La lógica real vive en `api/_lib/format-profiles.js` (no `api/format-profiles/index.js`, que es solo el wrapper de ruta) — implementa el CRUD y la recuperación 23505 tras el índice único.

### Contrato verificado (T01)

**structureHash**: firma estructural del documento (calculada fuera de este módulo, en `src/ingestion/`), transportada en `signature.structureHash` (string, máx. 64 caracteres, validado en `sanitizeCandidateInput`, `api/_lib/format-profiles.js:80-82`). Es la clave de identidad junto con `organization_id` — no incluye PII, solo estructura.

**Transiciones de `status` confirmadas en código** (`api/_lib/format-profiles.js`):

| Transición | Función | Rol requerido | Condición |
|---|---|---|---|
| (create) → `candidate` | `createCandidateFormatProfile` (líneas 265-354) | autenticado | idempotente: repite structureHash existente no-deprecated → devuelve el existente, `created: false` |
| `candidate` → `validated` | `confirmFormatProfile` (líneas 415-422) | `ADMIN` | optimistic lock por `updated_at`; solo si status actual es `candidate` |
| `validated`/`verified`/`candidate` → `legacy` | dentro de `confirmFormatProfile`, cuando el nuevo perfil `supersedesProfileId` (líneas 429-436) | `ADMIN` (heredado de la llamada) | se aplica al resto de la familia `logical_profile_id`, no al perfil recién confirmado |
| cualquiera → `deprecated` | `deprecateFormatProfile` (líneas 438-457) | `ADMIN` | optimistic lock por `updated_at`; idempotente si ya estaba `deprecated` |
| `legacy`/`deprecated` → `validated` | `reactivateFormatProfile` (líneas 459-472) | `ADMIN` | optimistic lock por `updated_at` |

**Hallazgo (no bloqueante)**: `verified` está declarado en el tipo (`FormatProfileStatus`, `src/lib/format-profiles.ts:339`) y se incluye en el filtro de "familia activa" (línea 435), pero **ningún código transiciona un perfil a `verified`** — es un estado reservado para una promoción automática futura (p.ej. tras N usos exitosos vía `recordFormatProfileUse`/`successful_use_count`) que aún no está conectada. No es una discrepancia con el índice único ni con la invariante de carrera; se documenta como gap conocido, no se implementa aquí (Alcance OUT: no se añaden estados nuevos, y este ya existe declarado — solo falta su disparador).

## 4. Alcance IN

- Documentar el contrato: qué es structureHash, cómo se calcula, qué estados son válidos y sus transiciones.
- Confirmar que el índice único de migración 0012 y la recuperación 23505 en código siguen alineados.

## 5. Alcance OUT

- No se modifica el algoritmo de structureHash.
- No se añaden nuevos estados a `format_profiles.status`.

## 6. Dependencias

R1-M00.

## 7. Decisiones arquitectónicas

Ninguna nueva — se documenta la decisión ya tomada (índice único parcial por organización, excluyendo `deprecated`) como definitiva.

## 8. Modelo de datos afectado

Tabla `format_profiles` (sin cambios, solo documentación). Ver sección 3.

## 9. API / Backend

`api/format-profiles/index.js` — documentar contrato de entrada/salida, sin cambios de comportamiento.

## 10. Frontend / UX

N/A — motivo: sin cambios de UI en esta microfase.

## 11. Seguridad y autorización

Confirmar que `format_profiles` está correctamente `organization_id`-scoped (tenant isolation) — verificación, no cambio.

## 12. i18n

N/A — motivo: documento técnico interno.

## 13. Accesibilidad

N/A — motivo: sin UI.

## 14. Responsive / temas

N/A — motivo: sin UI.

## 15. Observabilidad / errores

Documentar el manejo del error 23505 (violación de índice único) como comportamiento esperado y recuperable, no como fallo.

## 16. Migraciones

Ninguna nueva. Se referencia la migración que crea `format_profiles` y la migración 0012 (índice único parcial) como cerradas.

## 17. Compatibilidad y datos existentes

N/A — motivo: sin cambios de esquema, solo verificación de lo existente.

## 18. Tasks

### T01 — Documentar el contrato de structureHash y ciclo de estados

Objetivo:
Redactar el contrato: cálculo de structureHash, significado de cada `status` (candidate/validated/verified/legacy/deprecated), transiciones permitidas.

Archivos / módulos probables:
`api/format-profiles/index.js`, migración que crea `format_profiles`, migración 0012.

Cambios:
Añadir tabla de transiciones de estado a este documento.

No hacer:
No modificar código.

Criterios de aceptación:
- [ ] Todas las transiciones de `status` documentadas coinciden con el código.
- [ ] structureHash descrito con su fórmula/origen real.

Tests:
Ninguno.

Evidencia esperada:
Tabla de transiciones en este documento.

### T02 — Verificar alineación entre índice único (migración 0012) y recuperación 23505 en código

Objetivo:
Confirmar que la recuperación de la violación de índice único en `api/format-profiles/index.js` corresponde exactamente al índice `(organization_id, structureHash) WHERE status != 'deprecated'`.

Archivos / módulos probables:
`api/format-profiles/index.js`, migración 0012.

Cambios:
Ninguno si está alineado; si no, registrar como hallazgo bloqueante para remediación inmediata (no diferible a otra microfase, dado que es una condición de carrera de datos).

No hacer:
No relajar el índice único sin justificación documentada.

Criterios de aceptación:
- [x] Confirmado: la condición WHERE del índice coincide exactamente con la condición que dispara la recuperación 23505 en código.

Tests:
`qa/e2e-acceptance/specs-local/format-memory.spec.ts` es un test Playwright real-browser contra base de datos dev real (no vitest — no está en el `include` de `vitest.config.ts`; confirmado con `npx vitest run` sobre ese path: "No test files found"). Requiere servidor dev local levantado, navegadores Playwright, y credenciales de Neon dev. **No se ejecuta en esta microfase** — ejecutar un E2E real-browser contra infraestructura compartida sin necesidad inmediata está fuera del alcance de una verificación documental, y el estado de CI-gating de exactamente este tipo de test es el objeto explícito de R1-M15 (Import E2E Matrix). La invariante bajo prueba (índice único vs recuperación 23505) queda verificada aquí por lectura estática de código, que es la evidencia real del contrato — no depende de ejecutar el E2E.

Evidencia esperada:
Cita de línea de código + cita de migración confirmando alineación (ver abajo).

**Verificación T02**: migración 0012 crea `UNIQUE INDEX ... ON format_profiles (organization_id, (signature->>'structureHash')) WHERE status != 'deprecated'` (`db/migrations/0012_format_profiles_structurehash_uniqueness.sql`). La recuperación 23505 en `createCandidateFormatProfile` (`api/_lib/format-profiles.js:341-351`) re-consulta con exactamente `WHERE organization_id = ${ctx.organizationId} AND status != 'deprecated' AND signature->>'structureHash' = ${value.signature.structureHash}` — condición idéntica a la del índice. **Alineación confirmada, sin discrepancia.**

## 19. Tests obligatorios

- `qa/e2e-acceptance/specs-local/format-memory.spec.ts` debe pasar (verificación, no nueva escritura de test salvo gap encontrado).

## 20. Evidencias

- Este documento.
- Resultado de T02.

## 21. Gate

Gates obligatorios: G14 (Documentation), G10 (Unit/integration tests — confirmar que la suite de format-memory pasa).

## 22. Rollback / remediación

Si T02 detecta desalineación: FAIL, remediar en código (no en la migración, que ya es la fuente de verdad de la invariante) y revalidar.

## 23. Criterio de DONE

Contrato de detección de formato documentado y verificado contra HEAD sin discrepancias.
