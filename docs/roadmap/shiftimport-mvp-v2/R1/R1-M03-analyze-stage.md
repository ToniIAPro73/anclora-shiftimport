# R1-M03 — Analyze Stage

## 1. Objetivo
Documentar y verificar el stage ANALYZE del pipeline ANALYZE→REVIEW→COMPARE→CONFIRM (master prompt §14).

## 2. Problema que resuelve
El stage ANALYZE (parseo inicial + detección de formato + diagnóstico) no tiene contrato documentado como paso aislado del pipeline.

## 3. Estado actual del repositorio
STATUS: DONE. Implementado en `analyzeDocumentFile` + `diagnostics.ts`, con parsers PDF/XLSX/CSV/XML/JSON.

### Contrato verificado (T01)

`analyzeDocumentFile(file, selector, savedProfilesHint?, contextOverride?, vlm?)` (`src/ingestion/parsers/file.ts:873`):
- **Entrada**: `File` crudo + `EmployeeSelector` (individual/team) + hints opcionales (perfiles de formato guardados, contexto de calendario, hooks VLM).
- **Salida**: `Promise<DocumentAnalysisResult>` (turnos parseados, calidad, estructura detectada, preguntas del asistente si aplica) — o lanza `IngestionError('UNSUPPORTED_FORMAT', ...)` para formatos no admitidos (detectado antes de intentar parsear).
- **Sin escritura en base de datos**: confirmado — todo el trabajo es parseo/análisis en memoria; nada se persiste hasta CONFIRM (R1-M06).
- **Fallback VLM**: si el resultado determinista es inutilizable (sin ítems, o `UNRECOGNIZED` con cero turnos) y hay sesión activa, rasteriza y llama a `/api/ingestion/vlm`; nunca lanza — el resultado o se reemplaza (capado en `REVIEW`) o se marca con `vlmError`.

### Verificación T02 — i18n y accesibilidad del estado "analizando"

- **i18n**: todos los strings visibles en `ImportModal.tsx`/`TeamImportModal.tsx` usan `t(...)`, incluido el estado VLM "analyzing" (`ImportModal.tsx:1081`).
- **Accesibilidad**: el diálogo lleva `aria-busy={interactionLocked}` (`ImportModal.tsx:885`); el progreso de import tiene una región `aria-live="polite"` dedicada (`ImportModal.tsx:1378`).
- **Sin hallazgo que derivar a R1-M14** — ambos criterios ya cumplidos en el código actual.

## 4. Alcance IN
Documentar entradas/salidas del stage ANALYZE: archivo crudo entra, sale un `ImportState` + datos parseados o diagnóstico de fallo.

## 5. Alcance OUT
No se modifica el parsing.

## 6. Dependencias
R1-M01, R1-M02.

## 7. Decisiones arquitectónicas
Ninguna nueva.

## 8. Modelo de datos afectado
N/A — motivo: ANALYZE no escribe en base de datos (solo lectura/parseo en memoria).

## 9. API / Backend
Documentar `analyzeDocumentFile` como función de entrada al pipeline.

## 10. Frontend / UX
`ImportModal.tsx` / `TeamImportModal.tsx` — documentar cómo se invoca el análisis y qué feedback recibe el usuario mientras corre.

## 11. Seguridad y autorización
Confirmar que el archivo subido se procesa solo en el contexto de la organización del usuario autenticado.

## 12. i18n
Confirmar mensajes de estado durante análisis están en ES/EN.

## 13. Accesibilidad
Confirmar estado de "analizando" es anunciado a lectores de pantalla (aria-live o equivalente).

## 14. Responsive / temas
Confirmar estado de carga se ve correctamente en dark/light y en mobile.

## 15. Observabilidad / errores
Documentar cómo se comunican errores de parseo (vía `ImportState`/diagnostics, no excepciones sin capturar).

## 16. Migraciones
Ninguna.

## 17. Compatibilidad y datos existentes
N/A — motivo: sin escritura en esta etapa.

## 18. Tasks

### T01 — Documentar contrato de entrada/salida de ANALYZE
Objetivo: Redactar el contrato de esta etapa.
Archivos / módulos probables: `src/ingestion/diagnostics.ts`, función `analyzeDocumentFile`.
Cambios: Añadir sección de contrato.
No hacer: No modificar código.
Criterios de aceptación:
- [ ] Contrato de entrada/salida documentado y verificado contra código.
Tests: Ninguno.
Evidencia esperada: Sección de contrato.

### T02 — Verificar accesibilidad y i18n del estado de análisis
Objetivo: Confirmar que el feedback visual durante el análisis cumple i18n y accesibilidad básica.
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`.
Cambios: Ninguno si conforme; si hay gap, registrar como hallazgo para remediar en R1-M14 (Import UX Premium), no aquí.
No hacer: No implementar fixes de UX aquí — eso es R1-M14.
Criterios de aceptación:
- [ ] Confirmado o refutado, con evidencia, que el estado "analizando" tiene equivalente ES/EN y es accesible.
Tests: Ninguno.
Evidencia esperada: Nota de hallazgo (si aplica) referenciando R1-M14.

## 19. Tests obligatorios
Suite existente de ingestión relacionada con parseo/análisis debe seguir en verde.

## 20. Evidencias
Este documento.

## 21. Gate
Gates obligatorios: G14 (Documentation), G10 (Unit tests).

## 22. Rollback / remediación
N/A — motivo: microfase documental, sin cambios de código que revertir.

## 23. Criterio de DONE
Stage ANALYZE documentado y confirmado sin discrepancias contra el código.
