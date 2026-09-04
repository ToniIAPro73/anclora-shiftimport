# R0-M01 — Product Contract Rebaseline

## 1. Objetivo

Reescribir README.md y README.en.md para que reflejen el producto real: una plataforma B2B/B2B2E de gestión operativa de turnos cuyo diferencial es Safe Import, no un importador B2C de "Phase 0".

## 2. Problema que resuelve

README.md y README.en.md afirman actualmente "B2C / Prosumer", "no es un HRIS", flujo limitado a "Importar → revisar → calendario", badge "Estado: Phase 0". El código real ya tiene organizaciones multi-tenant, memberships con roles, provisioning masivo de usuarios con distribución de credenciales, áreas opcionales, historial de importación con auditoría — infraestructura muy por delante de "Phase 0" y claramente B2B/B2B2E. Cualquier persona (interna o externa) que lea el README hoy se forma un modelo mental incorrecto del producto.

## 3. Estado actual del repositorio

README.md / README.en.md desactualizados (ver `../00-BASELINE.md`, sección "Contradicciones documentales"). `docs/product/APPLICATION_STRUCTURE_AREAS_OPTIONAL.md` y `docs/IMPORT_RECOVERY_FORMAT_MEMORY_REMEDIATION_2026-09-04.md` sí están al día y sirven de fuente fiable para el nuevo contrato de producto.

## 4. Alcance IN

- Reescribir sección de posicionamiento de producto en README.md y README.en.md: B2B/B2B2E, gestión operativa de turnos, Safe Import como moat funcional.
- Reescribir el flujo descrito para reflejar el pipeline real: `importar → revisar → comparar → confirmar → (futuro: planificar → publicar → consultar → confirmar → solicitar cambios → aprobar → auditar)`, marcando explícitamente qué parte del flujo existe hoy (import) y cuál es roadmap (R2-R5).
- Actualizar el badge de estado (quitar "Phase 0"; reflejar estado real, p.ej. "MVP en construcción — Safe Import completo, capa organizativa en progreso").
- Listar capacidades reales existentes: multi-tenant, roles ADMIN/EMPLOYEE (con nota de que RBAC de 4 roles está en R0-M03/R2-M06), áreas opcionales, bulk provisioning con credenciales de un solo uso, import history, formatos aprendidos.
- No sobre-prometer: no describir scheduling, portal de empleado, aprobaciones como ya construidos.

## 5. Alcance OUT

- No tocar SETUP.md, backend-setup.md ni implementation_plan.md en esta microfase (eso es R0-M06 Documentation Reconciliation).
- No cambiar código de producto.

## 6. Dependencias

R0-M00.

## 7. Decisiones arquitectónicas

Decisión de producto (no arquitectónica): el README es el contrato canónico de posicionamiento; cualquier ambigüedad B2C/B2B se resuelve a favor de B2B/B2B2E porque es lo que el código ya implementa (multi-tenancy, roles, provisioning masivo).

## 8. Modelo de datos afectado

N/A — motivo: solo documentación, ningún cambio de esquema.

## 9. API / Backend

N/A — motivo: solo documentación.

## 10. Frontend / UX

N/A — motivo: solo documentación (README no es UI de producto).

## 11. Seguridad y autorización

N/A — motivo: no aplica a documentación de producto.

## 12. i18n

README.md (ES) y README.en.md (EN) deben mantenerse en paridad de contenido — ambos se actualizan en la misma microfase, mismo mensaje, sin desincronización.

## 13. Accesibilidad

N/A — motivo: Markdown plano, sin componentes de UI.

## 14. Responsive / temas

N/A — motivo: no aplica a documentación.

## 15. Observabilidad / errores

N/A — motivo: no aplica.

## 16. Migraciones

N/A — motivo: ninguna.

## 17. Compatibilidad y datos existentes

N/A — motivo: cambio puramente documental, no afecta datos.

## 18. Tasks

### T01 — Auditar contenido actual de README.md y README.en.md

Objetivo:
Confirmar exactamente qué líneas/secciones contradicen el estado real del producto.

Archivos / módulos probables:
`README.md`, `README.en.md`.

Cambios:
Ninguno todavía — solo lectura y listado de contradicciones.

No hacer:
No reescribir todavía en este task.

Criterios de aceptación:
- [ ] Lista exhaustiva de afirmaciones contradictorias (B2C, "Phase 0", flujo limitado) con número de línea.

Tests:
N/A.

Evidencia esperada:
Lista de contradicciones con file:line.

### T02 — Reescribir README.md (ES)

Objetivo:
Actualizar posicionamiento, flujo y badge de estado en español.

Archivos / módulos probables:
`README.md`.

Cambios:
Sección de posicionamiento → B2B/B2B2E; flujo actualizado con etapas reales vs roadmap; badge de estado corregido.

No hacer:
No inventar features no verificadas en `../00-BASELINE.md`.

Criterios de aceptación:
- [ ] Sin menciones de "B2C", "Prosumer" ni "Phase 0" salvo como referencia histórica explícita.
- [ ] Flujo real (import → review → compare → confirm) descrito con precisión.
- [ ] Roadmap futuro (scheduling, portal, aprobaciones) marcado explícitamente como no implementado.

Tests:
N/A.

Evidencia esperada:
Diff de `README.md`.

### T03 — Reescribir README.en.md (EN), paridad con README.md

Objetivo:
Mismo contenido que T02 en inglés, sin desincronización.

Archivos / módulos probables:
`README.en.md`.

Cambios:
Análogos a T02.

No hacer:
No dejar contenido en inglés desactualizado respecto al español.

Criterios de aceptación:
- [ ] Paridad de mensaje con README.md.
- [ ] Mismas correcciones de badge/flujo/posicionamiento.

Tests:
N/A.

Evidencia esperada:
Diff de `README.en.md`.

### T04 — Revisión cruzada final

Objetivo:
Verificar que ambos README quedan coherentes entre sí y con `../00-BASELINE.md`.

Archivos / módulos probables:
`README.md`, `README.en.md`, `../00-BASELINE.md`.

Cambios:
Ajustes menores de redacción si se detecta discrepancia.

No hacer:
No introducir nuevas afirmaciones no verificadas.

Criterios de aceptación:
- [ ] Ninguna afirmación en los README contradice `../00-BASELINE.md`.

Tests:
N/A.

Evidencia esperada:
Confirmación de revisión cruzada (nota en el resumen de microfase).

## 19. Tests obligatorios

N/A — motivo: cambio documental sin código ejecutable; no hay suite de tests aplicable.

## 20. Evidencias

Diffs de `README.md` y `README.en.md`; lista de contradicciones cerradas (T01).

## 21. Gate

Gates requeridos: **G0 (Repository/baseline integrity)**, **G14 (Documentation)**.

- G0: PASS si el working tree queda limpio salvo los dos README modificados, sin cambios de código colaterales.
- G14: PASS si README.md y README.en.md ya no contradicen `../00-BASELINE.md` y mantienen paridad ES/EN.

PASS solo si ambos gates PASS. FAIL si queda alguna afirmación contradictoria sin corregir — no commit, corregir, re-Gate.

## 22. Rollback / remediación

Si el Gate falla: revertir con `git checkout -- README.md README.en.md` (sin commit previo) o, si ya hubo commit, crear un nuevo commit correctivo (nunca amend). No hay riesgo de datos, solo de mensaje de producto.

## 23. Criterio de DONE

README.md y README.en.md describen con precisión el estado B2B/B2B2E actual, sin contradicciones con `../00-BASELINE.md`, con paridad ES/EN, y Gate G0+G14 en PASS.
