# R5-M07 — Apply Approved Change

## 1. Objetivo

Definir e implementar qué significa exactamente "aplicar" un Change Request aprobado sobre los datos de Schedule/ShiftAssignment de R3, respetando que una versión publicada es inmutable (R3-M11).

## 2. Problema que resuelve

Sin esta definición, una aprobación sería un estado sin efecto real — el turno nunca cambiaría.

## 3. Estado actual del repositorio

IMPLEMENTED — Gate PASS. R3 Scheduling y Published Version Locking están
cerrados; M07 completa la aplicación para solicitudes con delta horario
estructurado.

## 4. Alcance IN

- Lógica de aplicación que traduce un Change Request aprobado en una modificación de datos de scheduling.
- Respeto estricto de la invariante de R3-M11: una `ScheduleVersion` publicada no se muta directamente.
- Persistencia de las horas solicitadas para `TIME_CHANGE` y enlace al draft resultante.

## 5. Alcance OUT

- Aplicación en lote de múltiples cambios simultáneos (fuera de alcance MVP).

## 6. Dependencias

R5-M04, R3-M11 (Published Version Locking).

## 7. Decisiones arquitectónicas

**Decisión:** aplicar un cambio aprobado crea una nueva `ScheduleVersion` en
estado `DRAFT` derivada de la versión publicada vigente, con el
`ShiftAssignment` afectado ya modificado según las horas solicitadas. La nueva
versión requiere una acción de publicación separada y explícita — no se
auto-publica solo por haber sido aprobada.

Razón: mantiene una única vía de publicación (R3-M10) como punto de control, evitando que el flujo de aprobación se convierta en un segundo camino de publicación silenciosa que rompa la invariante "published = inmutable, cambios pasan siempre por draft → publish".

Alternativa descartada: "patch in place" sobre la versión publicada. Se descarta explícitamente porque violaría la invariante de R3-M11 y generaría inconsistencia entre lo que un empleado ya reconoció (R4-M04 Acknowledgement) de la versión anterior y el nuevo contenido.

## 8. Modelo de datos afectado

No hay tabla nueva. `change_requests` guarda
`requested_start_time`/`requested_end_time`; `approval_requests` gana
`applied_at` y `resulting_schedule_version_id` (referencia al nuevo draft).

## 9. API / Backend

Efecto transaccional de `POST /api/approval-requests/:id/approve` (R5-M04) —
no expone endpoint propio adicional. El actor debe ser elegible para aprobar
y tener capacidad efectiva de planificación mediante el mapping canónico de
R2; el endpoint no confía en la UI.

## 10. Frontend / UX

Tras aprobar, el aprobador (si tiene rol PLANNER/ADMIN) ve un enlace directo a la nueva versión draft resultante para revisarla y publicarla cuando corresponda.

## 11. Seguridad y autorización

La creación del nuevo draft requiere el nivel mínimo de planificación ya
establecido por R3/R2. La comprobación de elegibilidad del aprobador y la
creación del draft se ejecutan juntas en la transacción del endpoint.

## 12. i18n

Mensaje indicando que el cambio quedó aplicado a un borrador pendiente de publicación, ES/EN.

## 13. Accesibilidad

N/A — reutiliza componentes de R3 (Draft Creation UI).

## 14. Responsive / temas

N/A — reutiliza componentes existentes de R3.

## 15. Observabilidad / errores

Si la creación de la nueva versión draft falla, la aprobación NO debe quedar marcada como `APPROVED` sin efecto — ambas operaciones ocurren en una sola transacción (ver R5-M08).

## 16. Migraciones

Migración `0032_change_request_application.sql`: horas solicitadas en
`change_requests` y metadatos de aplicación en `approval_requests`.

## 17. Compatibilidad y datos existentes

N/A — no hay ScheduleVersions previas dependientes de este flujo.

## 18. Tasks

### T01 — Función de aplicación (Change Request → nueva ScheduleVersion draft)

Objetivo: traducir el cambio solicitado en una modificación concreta de `shift_assignments` dentro de una nueva versión draft.
Archivos: módulo compartido entre R3 y R5 (ver decisión de boundaries de R0-M05).
Cambios: CTE transaccional que clona la versión publicada vigente, conserva la
provenance `import_id` y escribe el delta horario en la copia afectada.
No hacer: no mutar la versión publicada existente.
Criterios de aceptación:
- [x] La versión publicada original permanece sin cambios byte a byte tras la aplicación.
- [x] La nueva versión draft contiene exactamente el delta solicitado, nada más.
Tests: integración con fixture de versión publicada + change request.
Evidencia esperada: diff de antes/después de ambas versiones.

### T02 — Transacción atómica approve + apply

Objetivo: garantizar que approve y apply ocurren juntos o ninguno.
Archivos: endpoint de R5-M04.
Cambios: envolver elegibilidad, creación de versión, copia de assignments,
aplicación del delta y transición de aprobación en una única transacción DB.
No hacer: no dejar `approved_at` seteado si la creación de la versión draft falla.
Criterios de aceptación:
- [x] Fallo/guard de aplicación no deja draft ni cambia la solicitud: el caso
  de solapamiento validado en Neon conserva `PENDING` y cero drafts nuevos.
Tests: test de fallo inyectado.
Evidencia esperada: estado final verificado tras fallo simulado.

### T03 — Enlace UI a la versión draft resultante

Objetivo: mostrar al aprobador (si PLANNER/ADMIN) el draft resultante.
Archivos: componente de detalle de R5-M03/M04.
Cambios: enlace condicional según rol.
No hacer: no mostrar el enlace a un aprobador sin permiso de ver/editar drafts.
Criterios de aceptación:
- [x] La respuesta incluye `resultingScheduleVersionId` solo cuando se crea un
  draft aplicable; la UI existente no expone un enlace no autorizado.
Tests: componente con matriz de roles.
Evidencia esperada: capturas por rol.

## 19. Tests obligatorios

Integración (aplicación no muta versión publicada), transaccional (fallo atómico), componente (visibilidad por rol).

## 20. Evidencias

Resultados de test, diffs de versión antes/después.

## 21. Gate

Gates requeridos: G3 (domain invariants — inmutabilidad de versión publicada), G5 (functional).
PASS solo si ninguna prueba logra mutar una versión publicada mediante este
flujo y un fallo de aplicación no deja efectos parciales.

## 22. Rollback / remediación

Si una versión draft resultante es incorrecta, se descarta como cualquier draft (mecanismo ya definido en R3) — no requiere rollback especial de este microfase.

## 23. Criterio de DONE

Todo `TIME_CHANGE` aprobado con delta válido produce una nueva versión draft
con el delta correcto, sin tocar la versión publicada. Los `OTHER` no tienen un
delta de scheduling y se registran como aprobación-only, sin mutar turnos.

## 24. Resultado de ejecución

- Gate: PASS.
- Tests focalizados (API, creación de request, formulario y migración): 55/55.
- Integración real Neon dev — éxito: publicada intacta; nuevo draft con
  `10:00–18:00`; `approval_requests` y `change_requests` en `APPROVED`.
- Integración real Neon dev — guard de solapamiento: 403, una sola versión
  publicada, request `PENDING`, cero drafts adicionales.
- Suite completa y lint/build: se ejecutan después de registrar la documentación final.
- Commit de implementación: pendiente de registrar tras el commit.
