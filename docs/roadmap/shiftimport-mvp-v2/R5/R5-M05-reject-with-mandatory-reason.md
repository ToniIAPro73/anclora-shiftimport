# R5-M05 — Reject with mandatory reason

## 1. Objetivo

Permitir que un aprobador rechace una `ApprovalRequest`, exigiendo un motivo no vacío, sin aplicar el cambio solicitado.

## 2. Problema que resuelve

Un rechazo sin motivo deja al empleado que solicitó el cambio sin contexto accionable, y sin auditoría suficiente de por qué se denegó.

## 3. Estado actual del repositorio

MISSING.

## 4. Alcance IN

- Endpoint y UI de rechazo con campo de motivo obligatorio.
- Transición `PENDING` → `REJECTED`, sin efecto sobre `shifts`/`schedule` (el cambio propuesto simplemente no se aplica).
- Visibilidad del motivo para el solicitante (vía R4-M07 Request Status).

## 5. Alcance OUT

- Motivos predefinidos/plantillas (texto libre es suficiente para MVP).

## 6. Dependencias

R5-M03.

## 7. Decisiones arquitectónicas

El motivo se almacena en `approval_requests.rejection_reason` (no en una tabla de comentarios separada) porque es 1:1 con la decisión, no una conversación — si se necesita hilo de comentarios, ya existe R4-M05 (Comments) para ese propósito y no se duplica aquí.

## 8. Modelo de datos afectado

`approval_requests`: `status` → `REJECTED`, `rejected_by_user_id`, `rejected_at`, `rejection_reason TEXT NOT NULL` (constraint a nivel de aplicación: no se persiste transición a REJECTED sin reason no vacío; constraint a nivel DB opcional pero recomendado con `CHECK (rejection_reason IS NULL OR length(trim(rejection_reason)) > 0)` combinado con NOT NULL condicional vía trigger o verificación en capa de datos).

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

Nueva columna `rejection_reason` en `approval_requests` (o ya incluida en la migración de R5-M02 si se anticipa aquí — decisión de implementación, documentar cuál).

## 17. Compatibilidad y datos existentes

N/A.

## 18. Tasks

### T01 — Endpoint reject con validación de motivo obligatorio

Objetivo: `POST /api/approval-requests/:id/reject`.
Archivos: `api/approval-requests/[id]/reject.js`.
Cambios: validación server-side de `reason` no vacío (nunca confiar solo en el disabled del botón de UI).
No hacer: no aceptar rechazo sin motivo aunque el cliente lo permita por bug de UI.
Criterios de aceptación:
- [ ] Motivo vacío o solo espacios → 400.
- [ ] Motivo válido → transición a REJECTED persistida junto al motivo.
Tests: API test, incluyendo bypass directo del endpoint sin pasar por UI.
Evidencia esperada: resultados de test.

### T02 — UI formulario de rechazo

Objetivo: textarea obligatorio + envío.
Archivos: componente de detalle de R5-M03.
Cambios: validación de cliente (UX) + manejo del 400 del servidor como red de seguridad.
No hacer: no confiar solo en la validación de cliente.
Criterios de aceptación:
- [ ] Botón deshabilitado sin texto.
- [ ] Error de servidor se muestra si, por cualquier vía, llega un 400.
Tests: componente.
Evidencia esperada: capturas ES/EN.

## 19. Tests obligatorios

API (validación server-side, no solo cliente), componente.

## 20. Evidencias

Resultados de test, capturas.

## 21. Gate

Gates requeridos: G4 (API/authorization), G5 (functional).
PASS solo si el servidor rechaza motivo vacío de forma independiente de la UI.

## 22. Rollback / remediación

N/A — rechazo no aplica ningún cambio a `shifts`, por lo que no hay estado que revertir más allá de la propia decisión.

## 23. Criterio de DONE

Ningún rechazo puede persistirse sin motivo no vacío, verificado a nivel de API independientemente de la UI.
