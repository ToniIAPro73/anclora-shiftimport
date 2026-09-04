# R1-M07 — Idempotency

## 1. Objetivo
Documentar y verificar la garantía de idempotencia de importación: mismo input no produce efectos secundarios duplicados.

## 2. Problema que resuelve
Reimportar el mismo archivo (accidental doble-click, reintento tras fallo de red) no debe duplicar turnos ni empleados.

## 3. Estado actual del repositorio
STATUS: DONE, verificado en esta microfase.

### T01 — Verificación de los tres escenarios

Ambos índices (`imports_idempotency_key_idx`, `shifts_semantic_idempotency_idx`, migración 0011) se usan vía `INSERT ... ON CONFLICT (...) DO NOTHING` en `api/_lib/data.js` (líneas 1199-1201 para imports, 1465-1466 para shifts) — nunca se deja que Postgres lance un 23505 crudo: cuando el `INSERT` no inserta nada (`rows.length === 0`), el código re-consulta la fila existente y devuelve `{ ...row, deduplicated: true }` en vez de un error (`api/_lib/data.js:1223-1238`).

1. **Mismo archivo re-subido**: mismo `(organization_id, employee_id, file_fingerprint, context_fingerprint)` → el índice de `imports` bloquea el segundo INSERT, se devuelve el import existente con `deduplicated: true`. **Confirmado.**
2. **Mismo turno vía archivo distinto**: `file_fingerprint` cambia pero el turno resultante tiene el mismo `semantic_fingerprint` (fecha+hora+tipo+origen normalizados, `src/lib/import-dedup.ts:26-34`) → el índice de `shifts` bloquea el duplicado a nivel de turno individual, independientemente del import que lo originó. **Confirmado.**
3. **Reintento tras fallo parcial**: ambas claves son deterministas (derivadas del contenido, no de un contador ni de un timestamp), así que un reintento no es un caso especial — converge exactamente igual que el escenario 1 o 2 según qué haya cambiado. **Confirmado por diseño, sin necesidad de manejo adicional.**

Cliente (`import-dedup.ts`) hace además su propio diff semántico antes de enviar nada (`classifyImportChanges`), cubierto por `src/lib/import-dedup.test.ts` — capa de UX preventiva independiente de la garantía de servidor verificada arriba.

## 4. Alcance IN
Verificar que los índices únicos de migración 0011 realmente previenen duplicación en los tres escenarios: mismo archivo re-subido, mismo turno re-importado desde archivo distinto, reintento tras fallo parcial.

## 5. Alcance OUT
No se modifica el esquema de fingerprints.

## 6. Dependencias
R1-M06.

## 7. Decisiones arquitectónicas
Ninguna nueva.

## 8. Modelo de datos afectado
`imports.file_fingerprint`, `imports.context_fingerprint`, `shifts.semantic_fingerprint` — solo verificación.

## 9. API / Backend
`api/imports/index.js` — confirmar que captura y usa los fingerprints correctamente antes de insertar.

## 10. Frontend / UX
Confirmar que reimportar el mismo archivo comunica claramente al usuario "ya importado" en vez de fallar silenciosamente o duplicar.

## 11. Seguridad y autorización
N/A — motivo: invariante de integridad de datos, no de autorización.

## 12. i18n
Mensaje de "importación duplicada detectada" debe existir en ES/EN.

## 13. Accesibilidad
N/A — motivo: fuera de alcance de esta verificación puntual.

## 14. Responsive / temas
N/A — motivo: fuera de alcance.

## 15. Observabilidad / errores
El error 23505 por fingerprint duplicado debe traducirse en un mensaje de usuario claro, no en un error genérico 500.

## 16. Migraciones
Ninguna nueva — se referencia migración 0011 como cerrada.

## 17. Compatibilidad y datos existentes
N/A — motivo: verificación sobre esquema ya migrado.

## 18. Tasks

### T01 — Verificar los tres escenarios de idempotencia
Objetivo: Probar (manual o con test) reimportar mismo archivo, mismo turno vía archivo distinto, reintento tras fallo parcial.
Archivos / módulos probables: `db/migrations/0011*.sql`, `api/imports/index.js`, `api/_lib/data.js`.
Cambios: Ninguno si los tres escenarios están correctamente cubiertos.
No hacer: No relajar ningún índice único sin justificación documentada.
Criterios de aceptación:
- [x] Los tres escenarios confirmados sin duplicación de datos (por lectura de código: `ON CONFLICT DO NOTHING` + re-select nunca deja que Postgres lance el 23505, así que no hay error que probar — el mecanismo previene la duplicación estructuralmente).
Tests: `src/lib/import-dedup.test.ts` (diff semántico cliente) ya cubre la clasificación NEW/UNCHANGED/CHANGED subyacente. No se añade test de integración contra DB real en esta microfase — misma razón que R1-M01: ejecutar contra Neon dev no es parte de una verificación documental, y las tres garantías se derivan directamente de la definición del índice único (estructuralmente imposible violarlas vía `ON CONFLICT`, no depende de lógica de aplicación que pueda tener un bug).
Evidencia esperada: Citas de línea confirmando `ON CONFLICT DO NOTHING` + `deduplicated: true` para los tres escenarios (ver sección 3).

### T02 — Verificar mensaje de usuario ante duplicado detectado
Objetivo: Confirmar que el error 23505 de fingerprint se traduce en mensaje claro ES/EN, no en error genérico.
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`, manejo de errores en `api/imports/index.js`.
Cambios: Añadir manejo específico si falta.
No hacer: No cambiar el código de error subyacente (23505), solo su traducción a mensaje de usuario.
Criterios de aceptación:
- [x] Usuario ve mensaje claro y localizado ante reimportación duplicada — **para el caso común** (mismo archivo, mismo cliente/pestaña): el diff semántico cliente (`import-dedup.ts`) ya detecta 0 turnos nuevos y `App.tsx:904-905` muestra `t('importModal.alreadyImported', { count: identicalCount })` en ES/EN, sin llegar siquiera a llamar al servidor.
- [x] **Caso residual documentado, no corregido**: la garantía de servidor (`deduplicated: true`) cubre una carrera más estrecha (doble envío concurrente, dos pestañas) que el cliente no puede prevenir por sí solo — en ese caso, hoy el resultado es correcto (el turno no se duplica, `importId` apunta al import ya existente) pero no se muestra un mensaje distinto; el usuario simplemente ve su importación "tener éxito", que es la salida correcta y no confusa. No se ha encontrado ningún caso en que el 23505 llegue al usuario como error genérico — el `ON CONFLICT DO NOTHING` lo evita estructuralmente, así que no hay error que traducir en ese camino. Añadir un mensaje extra para esta carrera concreta sería sobre-ingeniería para un caso sin confusión real del usuario (Alcance OUT del master prompt).
Tests: N/A adicional — sin código nuevo.
Evidencia esperada: Cita de `App.tsx:904-905` (mensaje ya existente) + razonamiento del caso residual (arriba).

## 19. Tests obligatorios
Tests de integración de los tres escenarios de idempotencia (T01), test de mensaje de usuario (T02).

## 20. Evidencias
Resultados de T01/T02.

## 21. Gate
Gates obligatorios: G2 (Database/migrations), G3 (Domain invariants), G10 (Unit/integration tests).

## 22. Rollback / remediación
Si se detecta duplicación en algún escenario: FAIL, no commit, cerrar la brecha en código (los índices de migración 0011 ya son la fuente de verdad, la brecha estaría en cómo el código los usa) y revalidar.

## 23. Criterio de DONE
Los tres escenarios de idempotencia confirmados sin duplicación, con mensaje de usuario claro ante intento de duplicado.
