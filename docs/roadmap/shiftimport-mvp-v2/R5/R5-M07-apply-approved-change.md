# R5-M07 — Apply Approved Change

## 1. Objetivo

Definir e implementar qué significa exactamente "aplicar" un Change Request aprobado sobre los datos de Schedule/ShiftAssignment de R3, respetando que una versión publicada es inmutable (R3-M11).

## 2. Problema que resuelve

Sin esta definición, una aprobación sería un estado sin efecto real — el turno nunca cambiaría.

## 3. Estado actual del repositorio

MISSING — depende íntegramente de R3 (Scheduling), que está MISSING en el baseline actual.

## 4. Alcance IN

- Lógica de aplicación que traduce un Change Request aprobado en una modificación de datos de scheduling.
- Respeto estricto de la invariante de R3-M11: una `ScheduleVersion` publicada no se muta directamente.

## 5. Alcance OUT

- Aplicación en lote de múltiples cambios simultáneos (fuera de alcance MVP).

## 6. Dependencias

R5-M04, R3-M11 (Published Version Locking).

## 7. Decisiones arquitectónicas

**Decisión (requiere validación cuando R3 esté implementado):** aplicar un cambio aprobado crea una nueva `ScheduleVersion` en estado `DRAFT` derivada de la versión publicada vigente, con el `ShiftAssignment` afectado ya modificado según lo solicitado, y dicha nueva versión requiere una acción de publicación separada y explícita (por un PLANNER/ADMIN) para entrar en vigor — no se auto-publica solo por haber sido aprobada.

Razón: mantiene una única vía de publicación (R3-M10) como punto de control, evitando que el flujo de aprobación se convierta en un segundo camino de publicación silenciosa que rompa la invariante "published = inmutable, cambios pasan siempre por draft → publish".

Alternativa descartada: "patch in place" sobre la versión publicada. Se descarta explícitamente porque violaría la invariante de R3-M11 y generaría inconsistencia entre lo que un empleado ya reconoció (R4-M04 Acknowledgement) de la versión anterior y el nuevo contenido.

## 8. Modelo de datos afectado

Ninguna tabla nueva — opera sobre `schedules`, `schedule_versions`, `shift_assignments` (definidas en R3-M01..M03). `approval_requests` gana `applied_at`, `resulting_schedule_version_id` (referencia a la nueva versión draft creada).

## 9. API / Backend

Efecto colateral de `POST /api/approval-requests/:id/approve` (R5-M04) — no expone endpoint propio adicional.

## 10. Frontend / UX

Tras aprobar, el aprobador (si tiene rol PLANNER/ADMIN) ve un enlace directo a la nueva versión draft resultante para revisarla y publicarla cuando corresponda.

## 11. Seguridad y autorización

La creación de la nueva versión draft requiere los mismos permisos que crear cualquier draft (R3-M04) — el actor "sistema" que ejecuta la aplicación actúa con los privilegios efectivos del aprobador que disparó la acción.

## 12. i18n

Mensaje indicando que el cambio quedó aplicado a un borrador pendiente de publicación, ES/EN.

## 13. Accesibilidad

N/A — reutiliza componentes de R3 (Draft Creation UI).

## 14. Responsive / temas

N/A — reutiliza componentes existentes de R3.

## 15. Observabilidad / errores

Si la creación de la nueva versión draft falla, la aprobación NO debe quedar marcada como `APPROVED` sin efecto — ambas operaciones ocurren en una sola transacción (ver R5-M08).

## 16. Migraciones

Nuevas columnas en `approval_requests`: `applied_at`, `resulting_schedule_version_id`.

## 17. Compatibilidad y datos existentes

N/A — no hay ScheduleVersions previas dependientes de este flujo.

## 18. Tasks

### T01 — Función de aplicación (Change Request → nueva ScheduleVersion draft)

Objetivo: traducir el cambio solicitado en una modificación concreta de `shift_assignments` dentro de una nueva versión draft.
Archivos: módulo compartido entre R3 y R5 (ver decisión de boundaries de R0-M05).
Cambios: función pura/transaccional que clona la versión publicada vigente + aplica el delta solicitado.
No hacer: no mutar la versión publicada existente.
Criterios de aceptación:
- [ ] La versión publicada original permanece sin cambios byte a byte tras la aplicación.
- [ ] La nueva versión draft contiene exactamente el delta solicitado, nada más.
Tests: integración con fixture de versión publicada + change request.
Evidencia esperada: diff de antes/después de ambas versiones.

### T02 — Transacción atómica approve + apply

Objetivo: garantizar que approve y apply ocurren juntos o ninguno.
Archivos: endpoint de R5-M04.
Cambios: envolver ambas operaciones en una única transacción DB.
No hacer: no dejar `approved_at` seteado si la creación de la versión draft falla.
Criterios de aceptación:
- [ ] Fallo simulado en creación de versión revierte también el estado `APPROVED`.
Tests: test de fallo inyectado.
Evidencia esperada: estado final verificado tras fallo simulado.

### T03 — Enlace UI a la versión draft resultante

Objetivo: mostrar al aprobador (si PLANNER/ADMIN) el draft resultante.
Archivos: componente de detalle de R5-M03/M04.
Cambios: enlace condicional según rol.
No hacer: no mostrar el enlace a un aprobador sin permiso de ver/editar drafts.
Criterios de aceptación:
- [ ] Enlace visible solo si el usuario tiene permiso sobre R3 drafts.
Tests: componente con matriz de roles.
Evidencia esperada: capturas por rol.

## 19. Tests obligatorios

Integración (aplicación no muta versión publicada), transaccional (fallo atómico), componente (visibilidad por rol).

## 20. Evidencias

Resultados de test, diffs de versión antes/después.

## 21. Gate

Gates requeridos: G3 (domain invariants — inmutabilidad de versión publicada), G5 (functional).
PASS solo si ninguna prueba logra mutar una versión publicada mediante este flujo.

## 22. Rollback / remediación

Si una versión draft resultante es incorrecta, se descarta como cualquier draft (mecanismo ya definido en R3) — no requiere rollback especial de este microfase.

## 23. Criterio de DONE

Todo Change Request aprobado produce una nueva versión draft con el delta correcto, sin tocar la versión publicada, verificado por test.
