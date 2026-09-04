# R3-M14 — Future Import → Draft Integration

## 1. Objetivo
Permitir que importar un archivo con fechas futuras cree o alimente un `ScheduleVersion` DRAFT, en lugar de publicar turnos silenciosamente como hace hoy el import de histórico.

## 2. Problema que resuelve
Hoy Safe Import (R1) escribe directamente en `shifts` tras confirmación, sin distinguir pasado de futuro. Con Scheduling existiendo, importar un cuadrante futuro debe integrarse con el flujo de planificación, no saltárselo — mandato explícito del prompt maestro (§17): "Importar un cuadrante futuro debe poder crear o alimentar un draft, no publicar silenciosamente".

## 3. Estado actual del repositorio
MISSING esta integración específica. El pipeline de import (R1, DONE) y el pipeline de Scheduling (R3-M01..M13) existen por separado hasta esta microfase.

## 4. Alcance IN
- Detección: si el periodo importado (period_year/period_month o fechas de las filas) es total o parcialmente futuro respecto a la fecha de confirmación, el flujo de confirmación de Safe Import (R1-M06) ofrece "Crear/alimentar borrador de planificación" en vez de escribir directo en `shifts`.
- Turnos con fecha pasada dentro del mismo import siguen el camino actual (escritura directa en `shifts`, sin cambios) — solo el futuro se redirige a draft.
- Reutiliza los endpoints de R3-M04 (crear draft) y R3-M05 (crear assignments) internamente — no un camino de escritura paralelo.

## 5. Alcance OUT
Cambiar el comportamiento de importación de histórico puro (sigue exactamente igual que hoy, DONE, sin tocar).

## 6. Dependencias
R1-M16 (R1 Final Gate — Safe Import cerrado), R3-M04, R3-M05.

## 7. Decisiones arquitectónicas
El punto de corte pasado/futuro es la fecha de confirmación del import (server time), no la fecha de subida del archivo. Si un import mezcla fechas pasadas y futuras (p.ej. import a mitad de semana), se hace un split: filas pasadas → `shifts` directo (camino actual), filas futuras → `shift_assignments` de un draft (nuevo o existente para ese periodo/área). Esto es un cambio de comportamiento visible del import existente — debe comunicarse claramente en el resumen de confirmación (Compare Stage, R1-M05) antes de escribir nada, siguiendo el mismo patrón "X nuevos / Y modificados / Z draft" ya usado.

## 8. Modelo de datos afectado
Ninguno nuevo — combina `imports`/`shifts` (R1) con `schedules`/`schedule_versions`/`shift_assignments` (R3). Posible columna `imports.schedule_version_id` (nullable) para trazar qué import alimentó qué draft — a confirmar necesidad real en T01 antes de migrar.

## 9. API / Backend
Extiende el endpoint de confirmación de import existente (`api/imports/index.js` o el endpoint específico de confirm — verificar nombre exacto en el código de R1) para, tras el split pasado/futuro, invocar internamente la creación/alimentación de draft en vez de (o además de) el insert directo en `shifts`.

## 10. Frontend / UX
El Compare Stage de Safe Import (ya existente) debe mostrar explícitamente cuántas filas van a "turnos confirmados" vs "borrador de planificación", para que el usuario entienda que lo futuro no se publica solo.

## 11. Seguridad y autorización
Mismo guard que crear/editar draft (PLANNER+) se aplica también cuando la creación del draft es disparada desde import — si el usuario que importa no es PLANNER+, la parte futura del import se rechaza o se informa como no permitida (a decidir en T01, documentar la elección).

## 12. i18n
Nuevos textos en el Compare Stage para la distinción pasado/futuro, ES/EN.

## 13. Accesibilidad
N/A adicional — reutiliza componentes de Import ya auditados.

## 14. Responsive / temas
N/A adicional.

## 15. Observabilidad / errores
El resumen de confirmación debe ser inequívoco sobre qué se escribió directo y qué quedó en borrador — evitar cualquier ambigüedad que lleve a que un usuario crea que un turno futuro ya está publicado cuando solo está en draft.

## 16. Migraciones
`db/migrations/0017_imports_schedule_version_link.sql` (si T01 confirma que la trazabilidad `imports → schedule_version` es necesaria) — aditiva.

## 17. Compatibilidad y datos existentes
Imports históricos ya confirmados no se ven afectados — el split solo aplica a partir de esta microfase, hacia adelante.

## 18. Tasks

### T01 — Decisión de trazabilidad import↔draft y permiso de import futuro sin rol PLANNER
Objetivo: decidir si se necesita `imports.schedule_version_id` y qué ocurre si un ADMIN sin scope PLANNER intenta importar futuro.
Archivos / módulos probables: este documento (sección 20).
Cambios: decisión documentada.
No hacer: no implementar sin esta decisión tomada.
Criterios de aceptación:
- [ ] Decisión registrada con justificación.
Tests: N/A.
Evidencia esperada: nota de decisión.

### T02 — Split pasado/futuro en Compare Stage
Objetivo: detectar y separar filas futuras del import antes de confirmar.
Archivos / módulos probables: módulo de comparación de R1 (`src/ingestion/` o el componente de Compare Stage — verificar ubicación exacta en R1-M05).
Cambios: lógica de clasificación por fecha.
No hacer: no alterar el camino de import puramente histórico.
Criterios de aceptación:
- [ ] Import 100% pasado se comporta exactamente igual que hoy (regresión cero).
- [ ] Import con fechas futuras muestra el desglose pasado/draft antes de confirmar.
Tests: regresión sobre acceptance-corpus existente (R1) + nuevos casos con fechas futuras.
Evidencia esperada: resultados de test, incluida confirmación de cero regresión en el corpus existente.

### T03 — Confirmación: escritura dual (shifts directo + draft)
Objetivo: al confirmar, escribir filas pasadas en `shifts` y filas futuras como assignments de un draft (nuevo o existente), en una operación coherente (si falla la parte draft, no se aplica tampoco la parte de shifts directos, o se documenta explícitamente por qué se permite parcialidad aquí — decidir y justificar).
Archivos / módulos probables: endpoint de confirmación de import.
Cambios: lógica de escritura dual.
No hacer: no publicar automáticamente el draft resultante.
Criterios de aceptación:
- [ ] Confirmar un import mixto crea shifts para lo pasado y un draft (o alimenta uno existente) para lo futuro, sin publicarlo.
Tests: integración end-to-end del flujo completo.
Evidencia esperada: resultados de test + verificación en Neon de desarrollo.

## 19. Tests obligatorios
`integration`, `regression` (contra acceptance-corpus existente de R1).

## 20. Evidencias
Decisión T01 documentada, tests en PASS, cero regresión en corpus de R1 verificada explícitamente.

## 21. Gate
Gates requeridos: **G3**, **G5**, **G10**, **G13** (Regression).

## 22. Rollback / remediación
Si se detecta regresión en el import histórico existente: FAIL inmediato, no negociable — Safe Import es el moat del producto (§1 del prompt maestro), no se puede degradar.

## 23. Criterio de DONE
Split pasado/futuro operativo, escritura dual verificada, cero regresión en acceptance-corpus de R1, Gate G3+G5+G10+G13 PASS.
