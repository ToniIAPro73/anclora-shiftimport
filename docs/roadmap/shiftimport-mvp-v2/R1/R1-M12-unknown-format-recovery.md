# R1-M12 — Unknown Format Recovery

## 1. Objetivo
Formalizar como contrato cerrado el flujo de recuperación de formato desconocido: los estados `NEEDS_USER_INPUT`, `BLOCKED`, `FAILED` del `ImportState` de 6 valores, y la decisión de diseño de que `BLOCKED` es terminal.

## 2. Problema que resuelve
Documentar de forma canónica una decisión de diseño ya tomada (commits 1ee5b8b, fb471bd) para que no se reabra accidentalmente sin pasar por una decisión explícita.

## 3. Estado actual del repositorio
STATUS: DONE, verificado sin regresión.

### T01 — Paridad confirmada

`ImportState` (`src/ingestion/diagnostics.ts:27-33`) sigue teniendo exactamente 6 valores: `READY`, `NEEDS_USER_INPUT`, `PARTIAL`, `BLOCKED`, `UNSUPPORTED`, `FAILED` — sin cambios desde 1ee5b8b. Ambos modales importan y usan las mismas funciones (`buildImportDiagnosis`, `diagnosisFromError`) de `src/ingestion/diagnostics.ts` como única fuente de verdad — `TeamImportModal.tsx:34,266,268,312` y `ImportModal.tsx:363,564` — confirmando que fb471bd sigue vigente: ningún modal deriva su propio estado ad hoc. Suite `state-contract.test.ts` (12 tests, fixtures canónicas de 1ee5b8b): **12/12 en verde**.

### T02 — Decisión ratificada: `BLOCKED` es terminal

Origen: commit `1ee5b8b` ("fix(ingestion): formalize recovery and format memory lifecycle"). Justificación registrada en el propio código (`ImportModal.tsx:848-850`): la capa de diagnóstico (`diagnostics.ts`) es la única fuente de verdad sobre recuperabilidad — la UI nunca re-deriva el estado por su cuenta. `NEEDS_USER_INPUT` es el único estado que ofrece una pregunta accionable al usuario (`recovery.strategy === 'answer-question'`); `BLOCKED` no tiene ninguna vía de recuperación asistida — el documento estructuralmente no permite continuar. `FAILED` es distinto de ambos: fallo técnico (excepción de parseo/red), no un juicio sobre el formato del documento.

**Esta decisión NO se reabre en esta microfase.** Cualquier propuesta futura de hacer `BLOCKED` parcialmente recuperable (p. ej. "preguntar sobre un Excel con cero empleados detectados") requiere una microfase nueva y explícita con sign-off de producto — no un cambio incidental dentro de otra microfase.

## 4. Alcance IN
Confirmar que ambos modales (individual y team) distinguen visualmente los tres estados terminales/recuperables, y ratificar la decisión de `BLOCKED` como terminal.

## 5. Alcance OUT
No se reabre la decisión de que `BLOCKED` es terminal — cualquier cambio a esa decisión requiere una microfase nueva y explícita con sign-off de producto (ver sección 22).

## 6. Dependencias
R1-M01, R1-M11.

## 7. Decisiones arquitectónicas
Se ratifica: `ImportState` tiene 6 valores; `BLOCKED` terminal; `NEEDS_USER_INPUT` único estado recuperable-con-asistente; `FAILED` distinto de ambos (fallo técnico, no de formato).

## 8. Modelo de datos afectado
N/A — motivo: `ImportState` es un valor de dominio en memoria/UI, no una columna de tabla nueva.

## 9. API / Backend
`src/ingestion/diagnostics.ts` — confirmar que el enum de 6 valores y sus transiciones siguen sin cambios desde 1ee5b8b.

## 10. Frontend / UX
`TeamImportModal.tsx`, `ImportModal.tsx` — confirmar que ambos presentan mensajes distintos y accionables para cada uno de los tres estados (no un genérico "error").

## 11. Seguridad y autorización
N/A — motivo: fuera de alcance.

## 12. i18n
Confirmar que los mensajes de cada estado existen en ES/EN.

## 13. Accesibilidad
Confirmar que el estado se comunica también sin depender solo de color (texto/icono con label).

## 14. Responsive / temas
N/A — motivo: cubierto por R1-M14 (Import UX Premium) de forma más amplia.

## 15. Observabilidad / errores
Confirmar que `FAILED` (fallo técnico) se distingue claramente de `BLOCKED` (formato irreconocible) y `NEEDS_USER_INPUT` (formato parcialmente reconocible) en cualquier log/telemetría.

## 16. Migraciones
Ninguna.

## 17. Compatibilidad y datos existentes
N/A — motivo: verificación sobre comportamiento ya formalizado.

## 18. Tasks

### T01 — Confirmar paridad de manejo entre ImportModal y TeamImportModal
Objetivo: Releer ambos modales y confirmar que comparten el mismo pipeline de diagnóstico para los 6 estados desde fb471bd.
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`, `src/ingestion/diagnostics.ts`.
Cambios: Ninguno si confirmado.
No hacer: No modificar el pipeline compartido.
Criterios de aceptación:
- [x] Confirmado que ambos modales usan el mismo pipeline y distinguen los 3 estados relevantes visualmente (ver sección 3).
Tests: `state-contract.test.ts` — 12/12 en verde.
Evidencia esperada: Ver sección 3 arriba.

### T02 — Ratificar la decisión de BLOCKED terminal en este documento
Objetivo: Dejar registro explícito de la decisión y su justificación, para que cualquier intento futuro de reabrirla pase primero por este documento.
Archivos / módulos probables: N/A — solo documentación.
Cambios: Redactar sección de decisión ratificada.
No hacer: No proponer alternativas a la decisión en esta microfase — eso sería una decisión de producto fuera de alcance aquí.
Criterios de aceptación:
- [x] Decisión documentada con referencia a commit 1ee5b8b como origen (ver sección 3).
Tests: Ninguno.
Evidencia esperada: Sección de decisión en este documento (sección 3).

## 19. Tests obligatorios
Suite de state-contract (fixtures de 1ee5b8b).

## 20. Evidencias
Resultado de T01, sección de decisión de T02.

## 21. Gate
Gates obligatorios: G14 (Documentation), G10 (Unit tests), G11 (E2E — si las fixtures de state-contract corren como E2E).

## 22. Rollback / remediación
Cambiar el estatus terminal de `BLOCKED` NO es una remediación de esta microfase — requiere una microfase nueva, explícita, con sign-off de producto, dado que es una decisión de diseño ya formalizada y testeada.

## 23. Criterio de DONE
Flujo de recuperación de formato desconocido documentado como contrato cerrado, paridad entre modales confirmada, decisión de `BLOCKED` terminal ratificada por escrito.
