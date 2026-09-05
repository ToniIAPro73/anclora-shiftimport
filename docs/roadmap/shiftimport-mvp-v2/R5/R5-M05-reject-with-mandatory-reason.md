# R5-M05 — Reject with mandatory reason

## 1. Objetivo

Permitir que un aprobador rechace una `ApprovalRequest`, exigiendo un motivo no vacío, sin aplicar el cambio solicitado.

## 2. Problema que resuelve

Un rechazo sin motivo deja al empleado que solicitó el cambio sin contexto accionable, y sin auditoría suficiente de por qué se denegó.

## 3. Estado actual del repositorio

IMPLEMENTED — Gate PASS.

## 4. Alcance IN

- Endpoint y UI de rechazo con campo de motivo obligatorio.
- Transición `PENDING` → `REJECTED` en `approval_requests` y `change_requests`, sin efecto sobre `shifts`/`schedule` (el cambio propuesto simplemente no se aplica).
- Visibilidad del motivo para el solicitante (vía R4-M07 Request Status).

## 5. Alcance OUT

- Motivos predefinidos/plantillas (texto libre es suficiente para MVP).

## 6. Dependencias

R5-M03.

## 7. Decisiones arquitectónicas

El motivo se almacena en `approval_requests.rejection_reason` (no en una tabla de comentarios separada) porque es 1:1 con la decisión, no una conversación — si se necesita hilo de comentarios, ya existe R4-M05 (Comments) para ese propósito y no se duplica aquí.

## 8. Modelo de datos afectado

`approval_requests`: `status` → `REJECTED`, `rejected_by_user_id`,
`rejected_at`, `rejection_reason TEXT`. La API exige un motivo no vacío y la
constraint `approval_requests_rejected_reason_check` impide a nivel DB que una
fila `REJECTED` carezca de él.

## 9. API / Backend

`POST /api/approval-requests/:id/reject` — body `{ reason: string }`, rechaza con 400 si `reason` vacío o solo espacios.

## 10. Frontend / UX

Formulario de rechazo con textarea obligatorio, botón deshabilitado hasta que haya texto no vacío.

## 11. Seguridad y autorización

Misma verificación de elegibilidad que R5-M04 (approve).

## 12. i18n

Textos de formulario, validación, confirmación ES/EN.

## 13. Accesibilidad

Campo de motivo con label asociado, mensaje de error de validación anunciado.

## 14. Responsive / temas

Hereda del sistema de diseño.

## 15. Observabilidad / errores

400 claro si motivo vacío; 409 si la request ya no está `PENDING`.

## 16. Migraciones

`0030_approval_rejection_metadata.sql` añade actor, timestamp y motivo de
rechazo con `IF NOT EXISTS`, además de la constraint de dominio. La migración
usa únicamente sentencias compatibles con el runner SQL del repositorio.

## 17. Compatibilidad y datos existentes

N/A.

## 18. Tasks

### T01 — Endpoint reject con validación de motivo obligatorio

Objetivo: `POST /api/approval-requests/:id/reject`.
Archivos: `api/approval-requests/[id]/reject.js`.
Cambios: validación server-side de `reason` no vacío (nunca confiar solo en el disabled del botón de UI).
No hacer: no aceptar rechazo sin motivo aunque el cliente lo permita por bug de UI.
Criterios de aceptación:
- [x] Motivo vacío o solo espacios → 400.
- [x] Motivo válido → transición a REJECTED persistida junto al motivo.
Tests: API test, incluyendo bypass directo del endpoint sin pasar por UI.
Evidencia esperada: resultados de test.

### T02 — UI formulario de rechazo

Objetivo: textarea obligatorio + envío.
Archivos: componente de detalle de R5-M03.
Cambios: validación de cliente (UX) + manejo del 400 del servidor como red de seguridad.
No hacer: no confiar solo en la validación de cliente.
Criterios de aceptación:
- [x] Botón deshabilitado sin texto.
- [x] Error de servidor se muestra si, por cualquier vía, llega un 400.
Tests: componente.
Evidencia esperada: capturas ES/EN.

## 19. Tests obligatorios

API (validación server-side, no solo cliente), componente.

## 20. Evidencias

Resultados de test, validación de migración y pruebas de componente de motivo
obligatorio y confirmación server-side.

## 21. Gate

Gates requeridos: G4 (API/authorization), G5 (functional).
PASS solo si el servidor rechaza motivo vacío de forma independiente de la UI.

## 22. Rollback / remediación

N/A — rechazo no aplica ningún cambio a `shifts`, por lo que no hay estado que revertir más allá de la propia decisión.

## 23. Criterio de DONE

Ningún rechazo puede persistirse sin motivo no vacío, verificado a nivel de API
independientemente de la UI; el solicitante puede consultar el motivo desde
R4-M07.

## 24. Resultado de ejecución

- Gate: PASS.
- API/componente/portal/migración focalizados: 53/53 tests PASS.
- Suite completa: 136 archivos, 1209 tests PASS.
- Lint: PASS.
- Build: PASS (warning no bloqueante de chunks grandes preexistente).
- Migración Neon dev: aplicada correctamente; columnas y constraint verificadas.
- Commit de implementación: `015ff02`.
