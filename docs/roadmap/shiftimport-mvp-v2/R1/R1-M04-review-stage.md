# R1-M04 — Review Stage

## 1. Objetivo
Documentar y verificar el stage REVIEW del pipeline ANALYZE→REVIEW→COMPARE→CONFIRM.

## 2. Problema que resuelve
El stage REVIEW (presentación de datos parseados al usuario para corrección antes de comparar) no tiene contrato documentado.

## 3. Estado actual del repositorio
STATUS: DONE. Implementado en `ImportModal.tsx` / `TeamImportModal.tsx`, permitiendo edición/corrección de filas detectadas antes de avanzar.

### Contrato de edición verificado (T01)

Tabla real (`ImportModal.tsx:1262`) con una fila `<tr>` por turno detectado. Campos editables vía `handleUpdateShift(index, field, value)`: `date`, `shiftType`, `startTime`, `endTime` (líneas 1283-1311). El campo `sourceFormat` es de solo lectura (`readOnly`, línea ~1290) — informativo, no editable. Validación visual: filas con `incomplete` (hora `'??:??'`) o vinculadas a un warning de `quality.state === 'REVIEW'` se resaltan con `background: var(--danger-row-bg)` (`needsAttention`, líneas 1276-1281) — marcado de error inline, no bloqueo de avance forzado en esta etapa (el bloqueo real de escritura ocurre en CONFIRM, R1-M06).

### Verificación T02 — accesibilidad de la tabla de revisión

- Inputs de la tabla usan la clase `.modal-input` (`src/index.css:975`), que **no** sobreescribe `outline` — mantiene el anillo de foco nativo del navegador.
- Los otros usos de `outline: none` en `index.css` (líneas 514, 1026, 1060, 1681) están todos emparejados con un indicador de foco de reemplazo (`border-color: var(--color-accent)` u equivalente) — patrón de foco visible custom, no foco eliminado.
- Navegación por teclado: son `<input>` HTML estándar dentro de `<table>`/`<tr>`/`<td>` — orden de tabulación nativo del navegador, sin `tabIndex` negativo que los excluya.
- **Sin hallazgo que derivar a R1-M14** — accesibilidad básica (foco visible, navegación por teclado) confirmada por lectura de código.

## 4. Alcance IN
Documentar qué campos son editables en REVIEW, qué validaciones se aplican antes de permitir avanzar a COMPARE.

## 5. Alcance OUT
No se modifica el UI de revisión.

## 6. Dependencias
R1-M03.

## 7. Decisiones arquitectónicas
Ninguna nueva.

## 8. Modelo de datos afectado
N/A — motivo: REVIEW no escribe en base de datos, opera sobre datos en memoria/estado de sesión de importación.

## 9. API / Backend
N/A — motivo: REVIEW es client-side sobre datos ya analizados; sin endpoint dedicado nuevo.

## 10. Frontend / UX
`ImportModal.tsx`, `TeamImportModal.tsx` — documentar la interacción de edición de filas.

## 11. Seguridad y autorización
N/A — motivo: sin escritura, sin nueva superficie de autorización.

## 12. i18n
Confirmar etiquetas de columnas y mensajes de validación en REVIEW están en ES/EN.

## 13. Accesibilidad
Confirmar tabla/formulario de revisión es navegable por teclado y con foco visible.

## 14. Responsive / temas
Confirmar tabla de revisión es usable en mobile (o tiene alternativa) y en dark/light.

## 15. Observabilidad / errores
Documentar cómo se marcan filas con error de validación durante REVIEW.

## 16. Migraciones
Ninguna.

## 17. Compatibilidad y datos existentes
N/A — motivo: sin escritura.

## 18. Tasks

### T01 — Documentar contrato de edición en REVIEW
Objetivo: Redactar qué campos son editables y qué validaciones se disparan.
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`.
Cambios: Añadir sección de contrato.
No hacer: No modificar código.
Criterios de aceptación:
- [ ] Campos editables y validaciones documentados y verificados contra código.
Tests: Ninguno.
Evidencia esperada: Sección de contrato.

### T02 — Verificar accesibilidad de la tabla de revisión
Objetivo: Confirmar navegación por teclado y foco visible en la tabla/formulario de REVIEW.
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`.
Cambios: Ninguno si conforme; si hay gap, registrar hallazgo para R1-M14.
No hacer: No implementar fixes aquí.
Criterios de aceptación:
- [ ] Confirmado o refutado con evidencia (navegación manual o test) el cumplimiento de accesibilidad básica.
Tests: axe o verificación manual si no hay test automatizado.
Evidencia esperada: Nota de hallazgo si aplica.

## 19. Tests obligatorios
Suite existente relacionada con edición de filas en importación debe seguir en verde.

## 20. Evidencias
Este documento.

## 21. Gate
Gates obligatorios: G14 (Documentation), G6 (UX/UI), G10 (Unit/integration tests).

## 22. Rollback / remediación
N/A — motivo: microfase documental.

## 23. Criterio de DONE
Stage REVIEW documentado, accesibilidad verificada o hallazgos registrados para R1-M14.
