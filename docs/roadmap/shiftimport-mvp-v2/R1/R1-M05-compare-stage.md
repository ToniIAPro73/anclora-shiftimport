# R1-M05 — Compare Stage

## 1. Objetivo
Verificar que el stage COMPARE muestra al usuario el desglose exacto exigido por el master prompt §14 (X nuevos / Y modificados / Z duplicados / N ignorados / M errores) antes de permitir CONFIRM, y cerrar la brecha si no es así.

## 2. Problema que resuelve
El master prompt exige explícitamente que "el usuario debe saber antes de confirmar" ese desglose de cinco categorías. El baseline marca esta microfase como PARTIAL: no está confirmado que la UI muestre exactamente esas cinco categorías.

## 3. Estado actual del repositorio
STATUS: era PARTIAL, ahora DONE tras esta microfase.

### T01 — Hallazgo (antes de la corrección)

| Categoría | Individual (`ImportModal.tsx`) antes de CONFIRM | Team (`TeamImportModal.tsx`) antes de CONFIRM |
|---|---|---|
| Nuevos | ✅ `importDiff.new.length` (línea 1350) | ✅ `totals.created` (stat card) |
| Modificados | ✅ `importDiff.changed.length` (línea 1351) | ✅ `totals.conflicts` (stat card) |
| Duplicados | ✅ `importDiff.unchanged.length` (línea 1352) | ❌ `unchangedCount` ya calculado por fila (`PreviewEntry.unchangedCount`) pero **nunca agregado ni mostrado** en el resumen `preview` |
| Ignorados | N/A — import individual no tiene concepto de filas/hojas ignoradas | ❌ `sheetSummaries` (hojas no procesadas) ya calculado y mostrado en el paso `select`, pero **no se traslada al resumen `preview`** justo antes de confirmar |
| Errores | N/A — import individual no tiene lote de filas con error | ❌ `rowDiagnostics` (fecha inválida, turno incompleto, hoja desconocida) ya calculado y mostrado en el paso `select`, pero **no se traslada al resumen `preview`** |

Import individual ya cumplía las 3 categorías que le aplican (no tiene concepto de lote de filas, así que "ignorados"/"errores" no aplican de la misma forma). **El import de equipo era el que tenía la brecha real**: el resumen `preview` (justo antes del botón "Importar") solo mostraba 3 cifras (empleados, nuevos, conflictos) — duplicados, ignorados y errores ya estaban calculados en otro punto del componente pero no llegaban al resumen final pre-confirmación, que es exactamente donde el master prompt §14 exige verlos.

### T02 — Brecha cerrada

`TeamImportModal.tsx`: el objeto `totals` (usado por el resumen `preview`) ahora incluye `duplicates` (suma de `unchangedCount` por fila), `ignored` (hojas de `sheetSummaries` con `status !== 'processed'`, ya calculado, solo reutilizado) y `errors` (`rowDiagnostics.length`, ya calculado, solo reutilizado) — sin nuevo cálculo de negocio, pura agregación de datos que el componente ya producía. El grid de tarjetas de estadísticas se amplió de 3 a 6 (empleados, nuevos, conflictos, duplicados, ignorados, errores), todas visibles incondicionalmente (incluido el cero) para que el usuario vea el desglose completo antes de decidir importar.

Nuevas claves i18n ES/EN: `teamImport.previewDuplicates`, `teamImport.previewIgnored`, `teamImport.previewErrors` (`src/lib/i18n.ts`).

## 4. Alcance IN
- Leer el código real de COMPARE en ambos modales.
- Confirmar o refutar que se muestran: nuevos, modificados, duplicados, ignorados, errores.
- Si falta alguna categoría, implementar el cálculo/presentación faltante.

## 5. Alcance OUT
No se rediseña el flujo COMPARE más allá de completar el desglose exigido.

## 6. Dependencias
R1-M04.

## 7. Decisiones arquitectónicas
Si falta alguna categoría, la decisión es aditiva sobre el componente existente, no un rediseño.

## 8. Modelo de datos afectado
N/A — motivo: COMPARE es de solo lectura (compara contra `shifts`/`imports` existentes, no escribe).

## 9. API / Backend
Posible extensión de endpoint de análisis/comparación si falta cálculo de alguna categoría (p. ej. conteo de "ignorados").

## 10. Frontend / UX
`TeamImportModal.tsx`, `ImportModal.tsx` — el resumen de comparación debe ser visualmente claro, con las cinco cifras.

## 11. Seguridad y autorización
N/A — motivo: sin escritura, sin nueva superficie.

## 12. i18n
Las cinco etiquetas (nuevos/modificados/duplicados/ignorados/errores) deben existir en ES y EN.

## 13. Accesibilidad
El resumen debe ser legible por lectores de pantalla (no solo color/icono).

## 14. Responsive / temas
El resumen debe verse correctamente en mobile y en dark/light.

## 15. Observabilidad / errores
Si el cálculo de alguna categoría falla, debe degradar a un estado de error visible, no a un conteo silenciosamente incorrecto.

## 16. Migraciones
Ninguna.

## 17. Compatibilidad y datos existentes
N/A — motivo: solo lectura.

## 18. Tasks

### T01 — Leer el código real de COMPARE y verificar las cinco categorías
Objetivo: Confirmar qué categorías se calculan y muestran hoy.
Archivos / módulos probables: `TeamImportModal.tsx`, `ImportModal.tsx`, lógica de comparación en `src/ingestion/` o componentes de dashboard.
Cambios: Ninguno en esta task — solo lectura y registro de hallazgo.
No hacer: No asumir sin leer el código.
Criterios de aceptación:
- [ ] Documentado con cita de código qué categorías existen hoy y cuáles faltan.
Tests: Ninguno.
Evidencia esperada: Tabla de categorías presentes/ausentes con citas de línea.

### T02 — Cerrar brecha de categorías faltantes (si las hay)
Objetivo: Implementar cálculo/presentación de cualquier categoría faltante de las cinco exigidas.
Archivos / módulos probables: los mismos de T01.
Cambios: Añadir cálculo/UI para categoría(s) faltante(s) únicamente.
No hacer: No rediseñar el componente completo; no añadir categorías no exigidas por el master prompt.
Criterios de aceptación:
- [x] Las cinco categorías (nuevos, modificados, duplicados, ignorados, errores) se muestran antes de CONFIRM en ambos modales (individual y team) — o N/A documentado cuando el concepto no aplica al flujo individual (sin lote de filas).
Tests: `TeamImportModal.test.tsx` — nuevo test "preview summary shows all five R1-M05 categories (new/conflicts/duplicates/ignored/errors), including zeros" (verifica las 5 etiquetas presentes en el resumen `preview`, incluido un caso con un duplicado real vía `loadRemoteShifts` devolviendo un turno idéntico).
Evidencia esperada: `npm test` → 97 archivos, 981 tests, todos en verde (980 + 1 nuevo).

### T03 — Verificar i18n y accesibilidad del resumen
Objetivo: Confirmar ES/EN y legibilidad por lector de pantalla del resumen final.
Archivos / módulos probables: los mismos de T01/T02.
Cambios: Ajustes menores de i18n/aria si faltan.
No hacer: No introducir componentes de diseño nuevos sin revisar primitives existentes (design system).
Criterios de aceptación:
- [x] Resumen tiene equivalente ES/EN completo (`previewDuplicates`/`previewIgnored`/`previewErrors` añadidos en ambos idiomas, `src/lib/i18n.ts`).
- [x] Resumen es accesible (no depende solo de color): cada tarjeta siempre muestra la cifra + etiqueta de texto; el color (`var(--danger)`/`var(--color-gold)`) es un refuerzo visual condicional sobre `ignored`/`errors`/`conflicts` cuando > 0, nunca la única señal.
Tests: `i18n-coverage.test.ts` en verde (parte de la suite completa, 97/97 archivos).
Evidencia esperada: `npm test`, `npm run build`, `npm run lint` — los tres en verde.

## 19. Tests obligatorios
- Test de componente/E2E cubriendo las cinco categorías del resumen COMPARE.
- `i18n-coverage.test.ts`.

## 20. Evidencias
Hallazgos de T01, test en verde de T02, verificación de T03.

## 21. Gate
Gates obligatorios: G6 (UX/UI), G8 (i18n), G10 (Unit/integration tests), G11 (E2E).

Regla: FAIL si al cierre de la microfase no se muestran las cinco categorías exigidas por el master prompt antes de CONFIRM.

## 22. Rollback / remediación
Si T02 introduce una regresión visual, revertir el cambio puntual (commit aislado) y reintentar Gate.

## 23. Criterio de DONE
La UI de COMPARE (individual y team) muestra las cinco categorías exigidas, en ES/EN, de forma accesible, antes de permitir CONFIRM.
