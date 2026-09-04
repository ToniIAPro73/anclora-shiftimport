# R2-M00 — Existing Multi-Tenant Audit

STATUS: DONE (audit already performed; this spec documents and formalizes it)

## 1. Objetivo

Dejar constancia formal, dentro de la jerarquía de specs de R2, del estado real de la capa multi-tenant del producto antes de construir el resto de Organization Foundation, evitando reimplementar lo que ya existe.

## 2. Problema que resuelve

Sin un punto de referencia explícito, microfases posteriores (R2-M06..M11) podrían asumir incorrectamente que la segmentación por organización no existe, o reconstruirla de forma redundante.

## 3. Estado actual del repositorio

Según `00-BASELINE.md`:
- `organizations` es la raíz de tenant. Toda fila operativa (`employees`, `areas`, `imports`, `shifts`, `format_profiles`, `memberships`) lleva `organization_id`.
- `memberships` conecta `users` con `organizations` con rol (`api/_lib/auth.js`, migración 0007).
- Endpoints (`api/organizations/reset.js`, `api/onboarding.js`, `api/areas/index.js`, `api/employees/*`, `api/imports/*`) operan sobre el `organization_id` de la sesión autenticada.
- No se ha encontrado evidencia de fuga cross-tenant en la revisión de esquema; sí queda pendiente una E2E dedicada (ver R2-M11).

## 4. Alcance IN

- Documentar el modelo de tenancy actual (tabla `organizations`, `organization_id` en cada tabla de negocio).
- Confirmar qué endpoints ya filtran por `organization_id` de sesión.

## 5. Alcance OUT

- No se realizan cambios de código en esta microfase.
- No se cubre aquí la verificación E2E de aislamiento (R2-M11).

## 6. Dependencias

R0-M07 (R0 Final Gate) — necesita el glosario de dominio y el modelo de autorización baseline ya fijados para nombrar correctamente los conceptos.

## 7. Decisiones arquitectónicas

Se confirma el modelo de tenancy: una organización es la raíz; todo dato de negocio cuelga de `organization_id`. No se introduce jerarquía adicional (ver R2-M03 sobre Areas opcionales).

## 8. Modelo de datos afectado

N/A — motivo: microfase de auditoría, no modifica esquema. Referencia de solo lectura a las 12 migraciones existentes descritas en `00-BASELINE.md`.

## 9. API / Backend

N/A — motivo: no se modifican endpoints; se listan como evidencia los ya existentes con scoping por organización.

## 10. Frontend / UX

N/A — motivo: microfase documental, sin cambios de UI.

## 11. Seguridad y autorización

Se deja constancia de que el scoping por `organization_id` es la única barrera de aislamiento verificada hasta ahora a nivel de esquema; la verificación de que ningún endpoint omite ese filtro se traslada explícitamente a R2-M11 (Cross-Tenant Isolation E2E) y R2-M08 (API Authorization Enforcement).

## 12. i18n

N/A — motivo: sin superficie de usuario.

## 13. Accesibilidad

N/A — motivo: sin superficie de usuario.

## 14. Responsive / temas

N/A — motivo: sin superficie de usuario.

## 15. Observabilidad / errores

N/A — motivo: microfase documental.

## 16. Migraciones

N/A — motivo: no se crean migraciones en esta microfase.

## 17. Compatibilidad y datos existentes

N/A — motivo: no se modifican datos.

## 18. Tasks

### T01 — Confirmar organization_id en cada tabla de negocio

Objetivo:
Verificar que `employees`, `areas`, `imports`, `shifts`, `format_profiles`, `memberships` tienen `organization_id` NOT NULL o equivalente y que las consultas en `api/_lib/data.js` siempre lo incluyen en el `WHERE`.

Archivos / módulos probables:
`db/migrations/*.sql`, `api/_lib/data.js`.

Cambios:
Ninguno de código; producir tabla de verificación (endpoint → cláusula de filtrado confirmada) como evidencia adjunta a esta spec.

No hacer:
No modificar queries en esta microfase — cualquier gap encontrado se traslada a R2-M08/R2-M11 como hallazgo, no se corrige aquí.

Criterios de aceptación:
- [ ] Tabla de verificación completa para las 6 tablas de negocio.
- [ ] Cualquier gap identificado documentado con archivo:línea.

Tests:
N/A — auditoría de lectura de código, no de ejecución.

Evidencia esperada:
Tabla de verificación embebida en el resumen de evidencias (sección 20).

## 19. Tests obligatorios

N/A — motivo: microfase de auditoría documental sin cambios ejecutables.

## 20. Evidencias

- Extracto de `00-BASELINE.md` sección "Modelo DB".
- Tabla de verificación producida en T01.

## 21. Gate

Gates requeridos: G14 (Documentation).

G14: confirma que esta spec refleja fielmente el estado real (contrastado contra `00-BASELINE.md`).

Resultado únicamente uno de: PASS / PASS_WITH_WARNINGS / FAIL / BLOCKED.

## 22. Rollback / remediación

N/A — motivo: microfase documental, nada que revertir.

## 23. Criterio de DONE

La tabla de verificación T01 está completa y cualquier gap está explícitamente derivado a la microfase correspondiente (R2-M08 o R2-M11).
