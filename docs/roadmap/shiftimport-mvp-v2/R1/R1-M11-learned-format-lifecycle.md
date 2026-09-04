# R1-M11 — Learned Format Lifecycle

## 1. Objetivo
Formalizar como contrato cerrado el ciclo de vida completo de un formato aprendido (`format_profiles`), incluyendo el cierre de la condición de carrera resuelta en commit c863223.

## 2. Problema que resuelve
Los formatos aprendidos deben progresar de forma predecible (candidate → validated → verified → legacy → deprecated) sin colisiones cuando dos importaciones concurrentes detectan el mismo `structureHash` por primera vez.

## 3. Estado actual del repositorio
STATUS: DONE. Commit c863223 cerró una condición de carrera real en el check-then-insert a nivel de aplicación, añadiendo migración 0012 (índice único parcial `(organization_id, structureHash) WHERE status != 'deprecated'`) y recuperación del error 23505 en `api/format-profiles/index.js`. El mismo commit corrigió un bug de visualización (perfiles de 6 vs 7 columnas parecían duplicados).

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
- [ ] Confirmado sin regresión desde c863223.
Tests: `qa/e2e-acceptance/specs-local/format-memory.spec.ts` en verde.
Evidencia esperada: Resultado de test + cita de código.

### T02 — Documentar el ciclo de vida completo como contrato
Objetivo: Redactar diagrama de estados candidate→validated→verified→legacy→deprecated con las transiciones que los disparan.
Archivos / módulos probables: `api/format-profiles/index.js`.
Cambios: Añadir el diagrama a este documento.
No hacer: No modificar código.
Criterios de aceptación:
- [ ] Diagrama de transiciones completo y verificado contra código.
Tests: Ninguno.
Evidencia esperada: Diagrama incluido en este documento.

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
