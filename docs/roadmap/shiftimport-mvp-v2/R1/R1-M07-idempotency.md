# R1-M07 — Idempotency

## 1. Objetivo
Documentar y verificar la garantía de idempotencia de importación: mismo input no produce efectos secundarios duplicados.

## 2. Problema que resuelve
Reimportar el mismo archivo (accidental doble-click, reintento tras fallo de red) no debe duplicar turnos ni empleados.

## 3. Estado actual del repositorio
STATUS: DONE. Migración 0011 añade `file_fingerprint`, `context_fingerprint` en `imports` y `semantic_fingerprint` en `shifts`, con índices únicos por `(organization_id, employee_id, file_fingerprint, context_fingerprint)` y por `semantic_fingerprint`.

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
- [ ] Los tres escenarios confirmados sin duplicación de datos.
Tests: Test de integración por escenario (nuevo si no existe cobertura).
Evidencia esperada: Resultados de los tres tests.

### T02 — Verificar mensaje de usuario ante duplicado detectado
Objetivo: Confirmar que el error 23505 de fingerprint se traduce en mensaje claro ES/EN, no en error genérico.
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`, manejo de errores en `api/imports/index.js`.
Cambios: Añadir manejo específico si falta.
No hacer: No cambiar el código de error subyacente (23505), solo su traducción a mensaje de usuario.
Criterios de aceptación:
- [ ] Usuario ve mensaje claro y localizado ante reimportación duplicada.
Tests: Test de componente/E2E cubriendo el mensaje.
Evidencia esperada: Test en verde o captura.

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
