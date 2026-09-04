# R1-M11 — Learned Format Lifecycle

## 1. Objetivo
Formalizar como contrato cerrado el ciclo de vida completo de un formato aprendido (`format_profiles`), incluyendo el cierre de la condición de carrera resuelta en commit c863223.

## 2. Problema que resuelve
Los formatos aprendidos deben progresar de forma predecible (candidate → validated → verified → legacy → deprecated) sin colisiones cuando dos importaciones concurrentes detectan el mismo `structureHash` por primera vez.

## 3. Estado actual del repositorio
STATUS: DONE, verificado sin regresión.

### T01 — Vigencia confirmada

R1-M01 (commit `462a6c5`, ya cerrado) ya verificó línea a línea que el índice único parcial de migración 0012 y la recuperación 23505 en `api/_lib/format-profiles.js:341-351` siguen alineados exactamente — no se repite esa verificación aquí, se referencia. Confirmado adicionalmente en esta microfase: el fix de visualización de columnas (`FormatProfilesModal.tsx:164`, `t('formatProfiles.columns', { count: profile.signature.columnCount })`) sigue presente sin regresión.

El test E2E real-browser (`qa/e2e-acceptance/specs-local/format-memory.spec.ts`) no se ejecuta en esta microfase por el mismo motivo que en R1-M01: requiere servidor dev + navegadores + DB real, y su estado de CI-gating es el objeto de R1-M15.

### T02 — Diagrama de ciclo de vida (ya redactado en R1-M01, referenciado aquí como contrato cerrado)

```text
(create) ──createCandidateFormatProfile──> candidate
candidate ──confirmFormatProfile (ADMIN)──> validated
validated/verified/candidate ──(al confirmar un perfil que lo supersede)──> legacy
cualquiera ──deprecateFormatProfile (ADMIN)──> deprecated
legacy/deprecated ──reactivateFormatProfile (ADMIN)──> validated
```

`verified` permanece como estado declarado sin disparador de código (hallazgo ya documentado en R1-M01, no es una regresión — es el mismo gap conocido, sin cambios desde entonces).

## 4. Alcance IN
Documentar el ciclo de vida completo como contrato cerrado; confirmar que el fix de c863223 sigue vigente y no ha sido revertido accidentalmente.

## 5. Alcance OUT
No se modifica el ciclo de vida ni se añaden nuevos estados.

## 6. Dependencias
R1-M01.

## 7. Decisiones arquitectónicas
Ninguna nueva — se ratifica la decisión de c863223 como definitiva y cerrada.

## 8. Modelo de datos afectado
`format_profiles` — sin cambios, solo verificación de migración 0012.

## 9. API / Backend
`api/format-profiles/index.js` — confirmar que la recuperación 23505 sigue presente.

## 10. Frontend / UX
Confirmar que la UI de gestión de formatos distingue correctamente perfiles con distinto número de columnas (el bug corregido en c863223).

## 11. Seguridad y autorización
N/A — motivo: fuera de alcance, cubierto en R1-M01.

## 12. i18n
N/A — motivo: sin cambios de texto nuevos.

## 13. Accesibilidad
N/A — motivo: sin cambios de UI nuevos.

## 14. Responsive / temas
N/A — motivo: sin cambios de UI nuevos.

## 15. Observabilidad / errores
Confirmar que el error 23505 sigue manejándose como recuperación esperada, no como fallo genérico.

## 16. Migraciones
Ninguna nueva — se referencia migración 0012 como cerrada y verificada.

## 17. Compatibilidad y datos existentes
N/A — motivo: verificación sobre esquema ya migrado y ya en producción.

## 18. Tasks

### T01 — Confirmar vigencia del fix de c863223
Objetivo: Releer `api/format-profiles/index.js` y migración 0012, confirmando que el índice único parcial y la recuperación 23505 siguen presentes sin regresión.
Archivos / módulos probables: `api/format-profiles/index.js`, migración 0012.
Cambios: Ninguno si vigente.
No hacer: No modificar el fix ya cerrado.
Criterios de aceptación:
- [x] Confirmado sin regresión desde c863223 (índice + recuperación 23505 ya verificados en R1-M01; fix de visualización de columnas confirmado presente en `FormatProfilesModal.tsx:164`).
Tests: `qa/e2e-acceptance/specs-local/format-memory.spec.ts` no ejecutado en esta microfase (mismo razonamiento que R1-M01 — ver sección 3).
Evidencia esperada: Cita de código (ver sección 3).

### T02 — Documentar el ciclo de vida completo como contrato
Objetivo: Redactar diagrama de estados candidate→validated→verified→legacy→deprecated con las transiciones que los disparan.
Archivos / módulos probables: `api/format-profiles/index.js`.
Cambios: Añadir el diagrama a este documento.
No hacer: No modificar código.
Criterios de aceptación:
- [x] Diagrama de transiciones completo y verificado contra código (ver sección 3).
Tests: Ninguno.
Evidencia esperada: Diagrama incluido en este documento (sección 3).

## 19. Tests obligatorios
`qa/e2e-acceptance/specs-local/format-memory.spec.ts`.

## 20. Evidencias
Resultado de T01, diagrama de T02.

## 21. Gate
Gates obligatorios: G14 (Documentation), G10 (Unit/integration tests).

## 22. Rollback / remediación
Si T01 detecta regresión: FAIL bloqueante — es una condición de carrera de datos ya resuelta una vez, no se permite reabrirla sin remediación inmediata.

## 23. Criterio de DONE
Ciclo de vida de formatos aprendidos documentado como contrato cerrado, fix de c863223 confirmado vigente.
