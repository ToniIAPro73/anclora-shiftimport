# R2-M08 — API Authorization Enforcement

STATUS: PARTIAL

## 1. Objetivo

Garantizar que todo endpoint mutante y de lectura sensible aplica rol + scope de forma server-side, cerrando el guard de 2 roles a los 4 roles y 3 scopes definidos en R2-M06/M07.

## 2. Problema que resuelve

Un guard de autorización incompleto o inconsistente es la vulnerabilidad más probable al introducir roles/scopes nuevos; esta microfase es la pasada de cierre que confirma que ningún endpoint quedó desprotegido.

## 3. Estado actual del repositorio

Guard de 2 roles en `api/_lib/auth.js:163-165`. Tras R2-M06/M07, existen 4 roles y `resolveAccessScope`. Falta confirmar que **todos** los endpoints de `api/` consumen el guard actualizado.

## 4. Alcance IN

- Inventario completo de endpoints en `api/` y su requisito de autorización.
- Cierre de cualquier endpoint que compruebe rol de forma ad-hoc en lugar de usar el guard central.
- Test de autorización negativa (rol/scope insuficiente → 403) para cada endpoint mutante.

## 5. Alcance OUT

No se auditan endpoints de dominios aún no construidos (scheduling, portal, approval) — se cubrirán en sus propias microfases (R3-M13, R4, R5-M09).

## 6. Dependencias

R2-M07.

## 7. Decisiones arquitectónicas

Todo endpoint mutante debe importar y usar el guard central (`requireRole`/`resolveAccessScope` o equivalente) — prohibido reimplementar comprobaciones de rol inline.

## 8. Modelo de datos afectado

N/A — motivo: sin cambios de esquema en esta microfase.

## 9. API / Backend

Inventario de `api/**/*.js` (excluyendo tests) con columna "usa guard central: sí/no". Todo "no" es un hallazgo a corregir en esta misma microfase.

## 10. Frontend / UX

N/A — motivo: la UI ya oculta condicionalmente elementos según rol; esta microfase se centra en el backend como barrera real (master-prompt sección 25: la UI nunca es la única barrera).

## 11. Seguridad y autorización

Núcleo de la microfase. Ningún endpoint puede quedar sin verificación server-side de rol y scope.

## 12. i18n

N/A — motivo: sin cambios de UI.

## 13. Accesibilidad

N/A — motivo: sin cambios de UI.

## 14. Responsive / temas

N/A — motivo: sin cambios de UI.

## 15. Observabilidad / errores

Todos los 403 deben ser distinguibles de 401 (no autenticado) y 404 (no encontrado) para depuración y para R2-M11.

## 16. Migraciones

N/A — motivo: ninguna migración nueva.

## 17. Compatibilidad y datos existentes

N/A — motivo: cambio de código de autorización, no de datos.

## 18. Tasks

### T01 — Inventario de endpoints y requisito de autorización

Objetivo: Mapear cada endpoint a su rol/scope requerido.
Archivos / módulos probables: todo `api/**/*.js` no-test.
Cambios: Ninguno; producir tabla.
No hacer: No omitir endpoints "internos" o poco usados.
Criterios de aceptación:
- [ ] Tabla completa endpoint → rol/scope requerido → usa guard central (sí/no).
Tests: N/A — auditoría.
Evidencia esperada: tabla de inventario.

### T02 — Cerrar endpoints sin guard central

Objetivo: Migrar cualquier comprobación ad-hoc al guard central.
Archivos / módulos probables: los identificados en T01 con "no".
Cambios: Reemplazar lógica inline por llamada al guard central.
No hacer: No dejar ningún endpoint mutante sin guard.
Criterios de aceptación:
- [ ] 100% de endpoints mutantes usan el guard central.
Tests: test de autorización por endpoint corregido.
Evidencia esperada: resultado de tests.

### T03 — Test de autorización negativa exhaustivo

Objetivo: Confirmar 403 para cada combinación rol/scope insuficiente en cada endpoint mutante.
Archivos / módulos probables: `api/**/*.test.js`.
Cambios: Nuevos casos de test.
No hacer: No limitarse a un solo caso "feliz" de rechazo — cubrir cada rol contra cada endpoint restringido.
Criterios de aceptación:
- [ ] Matriz de test rol × endpoint completa para endpoints mutantes.
Tests: suite de autorización.
Evidencia esperada: resultado de tests + matriz cubierta.

## 19. Tests obligatorios

integration/security por endpoint.

## 20. Evidencias

Tabla de inventario T01, resultados de T02/T03.

## 21. Gate

Gates requeridos: G4 (API/authorization), G12 (Security).

## 22. Rollback / remediación

Cualquier endpoint mutante sin guard central es bloqueante — no PASS hasta cerrar el 100%.

## 23. Criterio de DONE

100% de endpoints mutantes usan el guard central con rol/scope correcto; matriz de test de autorización negativa completa y en verde.
