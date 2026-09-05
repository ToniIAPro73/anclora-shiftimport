# R5-M04 — Approve

## 1. Objetivo

Permitir que un aprobador elegible apruebe una `ApprovalRequest` pendiente, disparando la aplicación del cambio (R5-M07).

## 2. Problema que resuelve

Cierra el ciclo: sin acción de aprobar, una solicitud queda indefinidamente `PENDING`.

## 3. Estado actual del repositorio

IMPLEMENTED — Gate PASS.

## 4. Alcance IN

- Endpoint y UI de aprobación desde la bandeja (R5-M03).
- Transición `PENDING` → `APPROVED` con verificación de elegibilidad server-side.
- Persistencia auditable de la decisión (`approved_by_user_id`, `approved_at`).
- La aplicación material del delta se implementa en R5-M07; este endpoint la
  ejecuta en la misma transacción para `TIME_CHANGE` con delta estructurado.

## 5. Alcance OUT

- Aprobación en lote (múltiples requests a la vez) — no requerido para MVP piloto.

## 6. Dependencias

R5-M03, R5-M07 para la aplicación del delta.

## 7. Decisiones arquitectónicas

La elegibilidad, aplicación a un nuevo draft y actualización compare-and-set
de `PENDING` se ejecutan en una única transacción. La versión publicada nunca
se muta.

## 8. Modelo de datos afectado

`approval_requests.status` → `APPROVED`, `approved_by_user_id`, `approved_at`,
`applied_at`, `resulting_schedule_version_id`.
Migración aplicada: `0029_approval_decision_metadata.sql`.

## 9. API / Backend

`POST /api/approval-requests/:id/approve` — verifica que el caller es un aprobador elegible para esa request en el momento de la llamada (no confía en que apareciera en la bandeja hace unos segundos).

## 10. Frontend / UX

Botón "Aprobar" en el detalle de la solicitud (bandeja de R5-M03), con confirmación si el cambio es de alto impacto (opcional, a discreción de UX — no bloqueante).

## 11. Seguridad y autorización

Doble verificación: elegibilidad de política + pertenencia a la organización. Rechazo 403 si no elegible, incluso si la request aparece visualmente en su bandeja por una condición de carrera de UI desactualizada.

## 12. i18n

Textos de botón, confirmación y mensajes de éxito/error ES/EN.

## 13. Accesibilidad

Botón con foco visible, confirmación accesible por teclado.

## 14. Responsive / temas

Hereda del sistema de diseño existente.

## 15. Observabilidad / errores

Error si la request ya no está `PENDING` (aprobada/rechazada por otro, o cancelada) — mensaje claro, no genérico.

## 16. Migraciones

`0029_approval_decision_metadata.sql` añade actor y timestamp de aprobación de
forma forward-safe e idempotente con `IF NOT EXISTS`.

## 17. Compatibilidad y datos existentes

N/A.

## 18. Tasks

### T01 — Endpoint approve con verificación de elegibilidad en el momento

Objetivo: `POST /api/approval-requests/:id/approve`.
Archivos: `api/approval-requests/[id]/approve.js`.
Cambios: transición de estado y metadatos de decisión; elegibilidad actual
verificada en la misma operación.
No hacer: no aprobar si el estado ya cambió (ver R5-M08).
Criterios de aceptación:
- [x] Aprobador no elegible recibe 403.
- [x] Request ya no `PENDING` recibe 409 (conflict), no 200 silencioso.
Tests: API test con casos de elegibilidad y de estado ya cambiado.
Evidencia esperada: resultados de test.

### T02 — UI botón aprobar + feedback

Objetivo: acción desde la bandeja.
Archivos: componente de detalle de R5-M03.
Cambios: botón, estado de carga durante la petición, mensaje de éxito/error.
No hacer: no optimistic-update que oculte un posible 409.
Criterios de aceptación:
- [x] Tras aprobar, la solicitud desaparece de "pendientes" sin recargar toda la página.
- [x] Conflicto (409) muestra mensaje claro, no error genérico.
Tests: componente.
Evidencia esperada: capturas de los 2 casos (éxito/conflicto).

## 19. Tests obligatorios

API (elegibilidad, conflicto de estado), componente.

## 20. Evidencias

Resultados de test, validación de migración y pruebas de componente de éxito y
conflicto. La validación visual de la bandeja queda cubierta por la validación
browser de R5-M03; M04 añade la interacción y sus estados de feedback.

## 21. Gate

Gates requeridos: G4 (API/authorization), G5 (functional).
PASS si ningún caller no elegible puede aprobar, ningún doble-approve corrompe
estado y el feedback de conflicto es explícito.

## 22. Rollback / remediación

Revertir aprobación manualmente vía soporte (no hay "deshacer aprobar" en UI del MVP) — documentar como limitación conocida, no bloqueante (PASS_WITH_WARNINGS permitido si se documenta aquí y no hay riesgo de seguridad).

## 23. Criterio de DONE

Aprobación funciona de extremo a extremo, con verificación de elegibilidad en
el momento exacto de la acción, no solo al cargar la bandeja.

## 24. Resultado de ejecución

- Gate: PASS.
- API/componente/migración focalizados: 43/43 tests PASS.
- Suite completa: 135 archivos, 1202 tests PASS.
- Lint: PASS.
- Build: PASS (warning no bloqueante de chunks grandes preexistente).
- Migración Neon dev: aplicada correctamente; columnas verificadas y 0
  `approval_requests` existentes.
- Commit de implementación: `101af01`.
