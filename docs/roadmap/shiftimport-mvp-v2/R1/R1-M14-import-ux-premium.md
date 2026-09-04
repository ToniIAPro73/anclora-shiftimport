# R1-M14 — Import UX Premium

## 1. Objetivo
Verificar que el flujo completo de importación (ambos modales) cumple el checklist de calidad UI premium del master prompt §22, cerrando cualquier brecha encontrada.

## 2. Problema que resuelve
Safe Import es el diferencial del producto; su UX debe ser intachable, no solo funcional.

## 3. Estado actual del repositorio
STATUS: NEEDS VERIFICATION. No hay confirmación explícita en el baseline de que se cumplan todos los puntos del checklist §22 (loading/empty/error/disabled, dark/light, ES/EN, foco visible, teclado, prefers-reduced-motion, sin layout shifts, responsive real).

## 4. Alcance IN
Verificar cada punto del checklist §22 contra `ImportModal.tsx` y `TeamImportModal.tsx`, cerrando brechas encontradas.

## 5. Alcance OUT
No se rediseña el flujo de importación; solo se endurece su cumplimiento de calidad UI.

## 6. Dependencias
R1-M03, R1-M04, R1-M05.

## 7. Decisiones arquitectónicas
Ninguna nueva — solo correcciones puntuales sobre componentes existentes.

## 8. Modelo de datos afectado
N/A — motivo: cambios de UI, no de datos.

## 9. API / Backend
N/A — motivo: fuera de alcance.

## 10. Frontend / UX
`ImportModal.tsx`, `TeamImportModal.tsx` — verificación exhaustiva por checklist.

## 11. Seguridad y autorización
N/A — motivo: fuera de alcance.

## 12. i18n
Verificar paridad ES/EN completa en ambos modales (correr `i18n-coverage.test.ts`).

## 13. Accesibilidad
Verificar contraste WCAG, foco visible, navegación por teclado completa en ambos modales.

## 14. Responsive / temas
Verificar dark/light y responsive real (no solo desktop) en ambos modales.

## 15. Observabilidad / errores
Verificar que todos los estados de error tienen mensaje claro y accionable, no solo un icono.

## 16. Migraciones
Ninguna.

## 17. Compatibilidad y datos existentes
N/A — motivo: cambios de UI, no de datos.

## 18. Tasks

### T01 — Auditar checklist de calidad UI en ImportModal.tsx
Objetivo: Recorrer el checklist §22 completo contra el modal individual, registrando cumple/no cumple por punto.
Archivos / módulos probables: `ImportModal.tsx`.
Cambios: Ninguno en esta task — solo auditoría.
No hacer: No corregir nada todavía.
Criterios de aceptación:
- [ ] Checklist completo con veredicto por punto.
Tests: Ninguno.
Evidencia esperada: Tabla de auditoría.

### T02 — Auditar checklist de calidad UI en TeamImportModal.tsx
Objetivo: Igual que T01 para el modal de equipo.
Archivos / módulos probables: `TeamImportModal.tsx`.
Cambios: Ninguno en esta task.
No hacer: No corregir nada todavía.
Criterios de aceptación:
- [ ] Checklist completo con veredicto por punto.
Tests: Ninguno.
Evidencia esperada: Tabla de auditoría.

### T03 — Cerrar brechas encontradas
Objetivo: Corregir cada punto marcado "no cumple" en T01/T02.
Archivos / módulos probables: los mismos de T01/T02.
Cambios: Correcciones puntuales por brecha (foco, contraste, mensaje de error, reduced-motion, etc.).
No hacer: No introducir componentes de diseño paralelos; reutilizar primitives del design system.
Criterios de aceptación:
- [ ] Todas las brechas de T01/T02 cerradas o documentadas como aceptadas con justificación explícita.
Tests: axe/manual para accesibilidad; `i18n-coverage.test.ts`; verificación visual dark/light/responsive.
Evidencia esperada: Checklist final sin brechas abiertas no justificadas.

### T04 — Verificar prefers-reduced-motion
Objetivo: Confirmar que las animaciones del flujo de importación respetan `prefers-reduced-motion`.
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`, estilos asociados.
Cambios: Añadir soporte si falta.
No hacer: No eliminar animaciones para todos los usuarios, solo respetar la preferencia.
Criterios de aceptación:
- [ ] Confirmado que las animaciones se reducen/eliminan bajo `prefers-reduced-motion: reduce`.
Tests: Verificación manual.
Evidencia esperada: Nota de verificación.

### T05 — Verificar ausencia de layout shifts
Objetivo: Confirmar que las transiciones entre stages (ANALYZE→REVIEW→COMPARE→CONFIRM) no producen saltos de layout perceptibles.
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`.
Cambios: Reservar espacio/skeleton si falta.
No hacer: No rediseñar el layout general.
Criterios de aceptación:
- [ ] Confirmado sin layout shift perceptible entre stages.
Tests: Verificación manual/visual.
Evidencia esperada: Nota de verificación o captura antes/después.

## 19. Tests obligatorios
`i18n-coverage.test.ts`, verificación de accesibilidad (axe o manual), verificación visual dark/light/responsive.

## 20. Evidencias
Tablas de auditoría de T01/T02, checklist final de T03, notas de T04/T05.

## 21. Gate
Gates obligatorios: G6 (UX/UI), G7 (Accessibility), G8 (i18n), G9 (Responsive/temas).

Regla: PASS_WITH_WARNINGS permitido solo para brechas menores explícitamente documentadas sin riesgo funcional ni de seguridad, con microfase futura que las absorba si aplica.

## 22. Rollback / remediación
Si una corrección de T03 introduce una regresión visual, revertir el cambio puntual y reintentar.

## 23. Criterio de DONE
Ambos modales de importación cumplen el checklist de calidad UI premium del master prompt §22, sin brechas abiertas no justificadas.
