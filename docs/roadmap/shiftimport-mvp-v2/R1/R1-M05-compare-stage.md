# R1-M05 — Compare Stage

## 1. Objetivo
Verificar que el stage COMPARE muestra al usuario el desglose exacto exigido por el master prompt §14 (X nuevos / Y modificados / Z duplicados / N ignorados / M errores) antes de permitir CONFIRM, y cerrar la brecha si no es así.

## 2. Problema que resuelve
El master prompt exige explícitamente que "el usuario debe saber antes de confirmar" ese desglose de cinco categorías. El baseline marca esta microfase como PARTIAL: no está confirmado que la UI muestre exactamente esas cinco categorías.

## 3. Estado actual del repositorio
STATUS: PARTIAL. El pipeline COMPARE existe (comparación contra datos ya existentes en `shifts`/`imports`), pero no está verificado que la UI de `TeamImportModal.tsx` / `ImportModal.tsx` presente las cinco categorías exactas antes de CONFIRM.

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
- [ ] Las cinco categorías (nuevos, modificados, duplicados, ignorados, errores) se muestran antes de CONFIRM en ambos modales (individual y team).
Tests: Test de componente o E2E cubriendo el resumen de comparación con datos que generen las cinco categorías.
Evidencia esperada: Captura o test en verde mostrando las cinco cifras.

### T03 — Verificar i18n y accesibilidad del resumen
Objetivo: Confirmar ES/EN y legibilidad por lector de pantalla del resumen final.
Archivos / módulos probables: los mismos de T01/T02.
Cambios: Ajustes menores de i18n/aria si faltan.
No hacer: No introducir componentes de diseño nuevos sin revisar primitives existentes (design system).
Criterios de aceptación:
- [ ] Resumen tiene equivalente ES/EN completo.
- [ ] Resumen es accesible (no depende solo de color).
Tests: `i18n-coverage.test.ts` sigue en verde; verificación manual de accesibilidad.
Evidencia esperada: Test en verde + nota de verificación manual.

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
