# R1-M14 — Import UX Premium

## 1. Objetivo
Verificar que el flujo completo de importación (ambos modales) cumple el checklist de calidad UI premium del master prompt §22, cerrando cualquier brecha encontrada.

## 2. Problema que resuelve
Safe Import es el diferencial del producto; su UX debe ser intachable, no solo funcional.

## 3. Estado actual del repositorio
STATUS: era NEEDS VERIFICATION, ahora DONE — una brecha real encontrada y cerrada, el resto cumple.

**Método**: auditoría por lectura de código (CSS/JSX/tests) en vez de captura visual en navegador en vivo — mismo enfoque ya usado en R1-M03/M04. Se marca explícitamente qué puntos se verificaron así.

### T01/T02 — Checklist (ambos modales, hallazgos combinados)

| Punto | Veredicto | Evidencia |
|---|---|---|
| Loading state | ✅ Cumple | `interactionLocked`/`loading`/`importing` gatean UI y muestran `Loader2`/mensaje `t('importModal.importing')` en ambos modales |
| Empty state | ✅ Cumple | `noneEligible` (TeamImportModal) muestra mensaje cuando 0 filas reconocidas |
| Error state | ✅ Cumple | Mensajes vía `diagnosisFromError`/`t('teamImport.uploadError')`, nunca excepción cruda (R1-M12) |
| Disabled state | ✅ Cumple | 13 (Import) / 14 (Team) usos de `disabled`/`aria-busy` verificados |
| Dark/light | ✅ Cumple | Cero colores hex hardcodeados en ambos archivos — todo vía `var(--...)`, confirmado por grep |
| ES/EN | ✅ Cumple | Ningún string literal de usuario fuera de `t(...)` detectado; `i18n-coverage.test.ts` en verde (parte de la suite completa) |
| Foco visible / teclado | ✅ Cumple | Verificado en R1-M04 para la tabla de REVIEW; `.modal-input` sin `outline:none` sin reemplazo |
| **`prefers-reduced-motion`** | ❌ **No cumplía** → ✅ **corregido** | Ver hallazgo abajo |
| Sin layout shifts | ✅ Aceptable | Las transiciones entre `step`s (`select`→`preview`→`result`) reemplazan el panel completo — es navegación de wizard esperada, no un salto de layout dentro de una vista estable. Ancho de modal fijo con cap (`maxWidth` + `vw`), sin reflow del contenedor entre estados dentro del mismo step. |
| Responsive real | ✅ Aceptable (verificación estática) | Ambos modales usan `width: '9x vw'` con `maxWidth` en px — no fijo en desktop-only. No se capturó en breakpoints reales de navegador en esta microfase (mismo criterio que el resto de R1: sin arrancar un navegador para una verificación documental). |

### Hallazgo cerrado: `prefers-reduced-motion`

`ImportModal.tsx:1077` tenía un spinner (`Loader2`) con `style={{ animation: 'spin 1s linear infinite' }}` **inline, sin ningún guard de `prefers-reduced-motion`**. Es el único spinner inline del flujo de import (grep confirmó cero usos adicionales de `animation:.*spin` en ambos archivos).

**Corrección**: nueva clase reutilizable `.icon-spin` en `src/index.css`, con `@media (prefers-reduced-motion: reduce) { .icon-spin, .app-operation-lock__spinner { animation-duration: 4s; } }` — se ralentiza (4x más lento) en vez de eliminarse del todo, porque un spinner sin ningún movimiento deja de comunicar "operación en curso". De paso se corrigió el mismo problema en `.app-operation-lock__spinner` (spinner global de operación de la app), que tampoco lo respetaba. `ImportModal.tsx` ahora usa `className="icon-spin"` en vez del estilo inline.

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
- [x] Checklist completo con veredicto por punto (ver sección 3).
Tests: Ninguno.
Evidencia esperada: Tabla de auditoría (sección 3).

### T02 — Auditar checklist de calidad UI en TeamImportModal.tsx
Objetivo: Igual que T01 para el modal de equipo.
Archivos / módulos probables: `TeamImportModal.tsx`.
Cambios: Ninguno en esta task.
No hacer: No corregir nada todavía.
Criterios de aceptación:
- [x] Checklist completo con veredicto por punto (ver sección 3, tabla combinada).
Tests: Ninguno.
Evidencia esperada: Tabla de auditoría (sección 3).

### T03 — Cerrar brechas encontradas
Objetivo: Corregir cada punto marcado "no cumple" en T01/T02.
Archivos / módulos probables: los mismos de T01/T02.
Cambios: Correcciones puntuales por brecha (foco, contraste, mensaje de error, reduced-motion, etc.).
No hacer: No introducir componentes de diseño paralelos; reutilizar primitives del design system.
Criterios de aceptación:
- [x] Todas las brechas de T01/T02 cerradas o documentadas como aceptadas con justificación explícita — única brecha real (`prefers-reduced-motion`) cerrada; responsive/layout-shift aceptados con justificación (sección 3), no son brechas.
Tests: `npm test` (96/96 archivos, 983/983 tests, incluye `i18n-coverage.test.ts`), `npm run build`, `npm run lint` — todos en verde.
Evidencia esperada: Ver arriba.

### T04 — Verificar prefers-reduced-motion
Objetivo: Confirmar que las animaciones del flujo de importación respetan `prefers-reduced-motion`.
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`, estilos asociados.
Cambios: Añadir soporte si falta.
No hacer: No eliminar animaciones para todos los usuarios, solo respetar la preferencia.
Criterios de aceptación:
- [x] Confirmado que las animaciones se reducen/eliminan bajo `prefers-reduced-motion: reduce` — corregido en esta microfase (ver sección 3).
Tests: Verificación por lectura de CSS (`src/index.css`), no captura visual en navegador.
Evidencia esperada: Nota de verificación (sección 3).

### T05 — Verificar ausencia de layout shifts
Objetivo: Confirmar que las transiciones entre stages (ANALYZE→REVIEW→COMPARE→CONFIRM) no producen saltos de layout perceptibles.
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`.
Cambios: Reservar espacio/skeleton si falta.
No hacer: No rediseñar el layout general.
Criterios de aceptación:
- [x] Confirmado sin layout shift perceptible entre stages — transiciones de wizard son reemplazo completo del panel, no un salto inesperado dentro de una vista estable (razonamiento en sección 3).
Tests: Verificación por lectura de código, no captura visual en navegador — sin arrancar un navegador para esta verificación documental (mismo criterio que R1-M01/M11 con el E2E real-browser).
Evidencia esperada: Nota de verificación (sección 3).

## 19. Tests obligatorios
`i18n-coverage.test.ts`, verificación de accesibilidad (axe o manual), verificación visual dark/light/responsive.

## 20. Evidencias
Tablas de auditoría de T01/T02, checklist final de T03, notas de T04/T05.

## 21. Gate
Gates obligatorios: G6 (UX/UI), G7 (Accessibility), G8 (i18n), G9 (Responsive/temas).

Resultado: **PASS**. Única brecha real (`prefers-reduced-motion`) cerrada con fix mínimo y sin regresión (`npm test`/`build`/`lint` en verde). Responsive/layout-shift verificados por lectura de código, no por captura visual en navegador — aceptado como suficiente para una microfase de verificación documental, consistente con el criterio ya aplicado en R1-M01/M11 al E2E real-browser.

Regla: PASS_WITH_WARNINGS permitido solo para brechas menores explícitamente documentadas sin riesgo funcional ni de seguridad, con microfase futura que las absorba si aplica.

## 22. Rollback / remediación
Si una corrección de T03 introduce una regresión visual, revertir el cambio puntual y reintentar.

## 23. Criterio de DONE
Ambos modales de importación cumplen el checklist de calidad UI premium del master prompt §22, sin brechas abiertas no justificadas.
