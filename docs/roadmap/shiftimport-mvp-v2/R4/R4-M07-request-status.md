# R4-M07 — Request Status

## 1. Objetivo

Pantalla "Solicitudes": lista de las change requests del empleado (propias), con su estado actual (PENDING/APPROVED/REJECTED/CANCELLED), como una de las cuatro secciones principales de la navegación móvil.

## 2. Problema que resuelve

R4-M06 crea solicitudes pero no hay ningún lugar centralizado donde el empleado vea todas sus solicitudes y su estado a lo largo del tiempo.

## 3. Estado actual del repositorio

No existe. Depende de `change_requests` (R4-M06).

## 4. Alcance IN

- Endpoint de listado de change requests del empleado autenticado (todas, no solo pendientes).
- Componente de lista con filtro simple por estado.
- Enlace desde cada ítem al turno asociado (Shift Detail).

## 5. Alcance OUT

Aprobación/rechazo (R5). Edición de solicitud ya creada.

## 6. Dependencias

R4-M06.

## 7. Decisiones arquitectónicas

Vista puramente de lectura, SELF-scoped, sin lógica de negocio nueva — reutiliza el modelo de `change_requests` tal cual lo dejó R4-M06.

## 8. Modelo de datos afectado

Ninguna tabla nueva; lectura sobre `change_requests`.

## 9. API / Backend

`GET /api/me/change-requests` — SELF-scoped, con filtro opcional `?status=`.

## 10. Frontend / UX

Lista de solicitudes con badge de estado (colores/etiquetas distintas para PENDING/APPROVED/REJECTED/CANCELLED), estado vacío "no tienes solicitudes".

## 11. Seguridad y autorización

Server-side: solo solicitudes del empleado de sesión.

## 12. i18n

Estados y filtros en ES/EN.

## 13. Accesibilidad

Estado comunicado también por texto, no solo color (WCAG — no depender únicamente del color para transmitir estado).

## 14. Responsive / temas

Lista adaptada a mobile; contraste de badges verificado en dark/light.

## 15. Observabilidad / errores

Error state si el listado falla.

## 16. Migraciones

N/A — motivo: solo lectura sobre estructura ya creada en R4-M06.

## 17. Compatibilidad y datos existentes

N/A — motivo: no hay solicitudes históricas antes de R4-M06.

## 18. Tasks

### T01 — Endpoint `GET /api/me/change-requests`
Objetivo: listado SELF-scoped con filtro de estado.
Archivos: `api/me/change-requests/index.js`.
Cambios: lectura filtrable, orden por fecha descendente.
No hacer: no exponer solicitudes ajenas.
Criterios de aceptación:
- [ ] Filtro por estado funciona correctamente.
Tests: integration.
Evidencia esperada: respuesta filtrada de ejemplo.

### T02 — Componente Request Status
Objetivo: lista con badges de estado accesibles.
Archivos: `src/components/employee-portal/RequestStatus.tsx`.
Cambios: render de lista, filtro UI, estado vacío.
No hacer: no mezclar con lógica de creación (eso vive en Shift Detail/R4-M06).
Criterios de aceptación:
- [ ] Estado comunicado por texto además de color.
Tests: unit de render y accesibilidad de color/texto.
Evidencia esperada: captura con los 4 estados representados.

### T03 — Enlace a Shift Detail desde cada ítem
Objetivo: navegación desde solicitud a turno asociado.
Archivos: `src/components/employee-portal/RequestStatus.tsx`.
Cambios: enlace/navegación a `ShiftDetail` por `shift_id`.
No hacer: no duplicar lógica de detalle aquí.
Criterios de aceptación:
- [ ] Click en solicitud navega al turno correcto.
Tests: integration de navegación.
Evidencia esperada: captura de flujo.

## 19. Tests obligatorios

Unit, Integration (aislamiento, filtro), Accessibility (color+texto de estado).

## 20. Evidencias

Respuestas de API filtradas, capturas de los 4 estados, resultado de tests.

## 21. Gate

Gates obligatorios: G5 (Functional), G6 (UX/UI).

## 22. Rollback / remediación

Revert retira ruta/componente; no hay dato persistido nuevo (solo lectura).

## 23. Criterio de DONE

Empleado ve todas sus solicitudes con estado correcto y aislado; Gate G5+G6 PASS.
