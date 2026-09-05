# R5-M11 — R5 Final Gate

## 1. Objetivo

Cerrar formalmente R5 (Approval Lite) verificando que R5-M00..M10 están todos en PASS antes de habilitar el MVP Release Gate (R5-M12).

## 2. Problema que resuelve

Evita declarar R5 completo con microfases individuales en verde pero con regresiones cruzadas entre ellas (p. ej. R5-M08 concurrencia rompiendo algo que R5-M04 daba por sentado).

## 3. Estado actual del repositorio

IMPLEMENTED — R5-M00..M10 están en PASS y la revalidación agregada ha pasado.

## 4. Alcance IN

- Re-ejecución agregada de toda la suite de tests de R5 (unit, integración, E2E) en un solo pase.
- Verificación de que ningún Gate individual de R5-M00..M10 quedó en PASS_WITH_WARNINGS sin justificación documentada que siga siendo válida.

## 5. Alcance OUT

- Verificación de releases anteriores (R0-R4) — eso ya debió cerrarse en sus propios Final Gates.

## 6. Dependencias

R5-M00..M10.

## 7. Decisiones arquitectónicas

N/A — microfase de verificación agregada, no introduce diseño nuevo.

## 8. Modelo de datos afectado

N/A.

## 9. API / Backend

N/A — solo ejecución de tests existentes.

## 10. Frontend / UX

N/A.

## 11. Seguridad y autorización

Re-verificación de que R5-M09 (Authorization) sigue en PASS tras la integración completa de todo R5.

## 12. i18n

N/A.

## 13. Accesibilidad

N/A.

## 14. Responsive / temas

N/A.

## 15. Observabilidad / errores

N/A.

## 16. Migraciones

Verificar que todas las migraciones de R5 (approval_policy, area_responsibles, approval_requests, columnas de rejection/apply) se aplican limpiamente en orden desde cero sobre una base de datos vacía (no solo incrementalmente sobre una ya migrada).

## 17. Compatibilidad y datos existentes

Verificar que ninguna organización existente cambió de comportamiento observable tras el despliegue completo de R5 (todas siguen en NO_APPROVAL hasta configuración explícita).

## 18. Tasks

### T01 — Ejecución agregada de toda la suite R5

Objetivo: correr unit + integración + E2E de R5-M00..M10 en un solo pase limpio.
Archivos: N/A (ejecución, no código nuevo).
Cambios: ninguno de producto; solo verificación.
No hacer: no marcar PASS si algún test individual falla de forma intermitente sin diagnóstico.
Criterios de aceptación:
- [x] 100% de los tests de R5 pasan en una ejecución limpia consecutiva (no "pasó la segunda vez").
Tests: toda la suite de R5.
Evidencia esperada: log de ejecución completo.

### T02 — Migración desde cero

Objetivo: verificar que las migraciones de R5 aplican limpio sobre DB vacía.
Archivos: `db/migrate.mjs` contra base de datos de test vacía.
Cambios: ninguno de producto.
No hacer: no verificar solo incrementalmente.
Criterios de aceptación:
- [x] Migración desde cero exitosa.
Tests: script de migración.
Evidencia esperada: log de migración.

### T03 — Revisión de warnings pendientes

Objetivo: listar todo PASS_WITH_WARNINGS de R5-M00..M10 y confirmar que sigue siendo válido o corregirlo.
Archivos: specs individuales de R5.
Cambios: actualizar spec si el warning ya no aplica.
No hacer: no arrastrar un warning obsoleto sin revisarlo.
Criterios de aceptación:
- [x] Cada warning tiene justificación vigente o fue resuelto.
Tests: N/A — revisión documental.
Evidencia esperada: lista de warnings revisados.

## 19. Tests obligatorios

Suite completa de R5 (unit, integración, E2E), migración desde cero.

## 20. Evidencias

Log de ejecución agregada, log de migración desde cero, lista de warnings revisados.

## 21. Gate

Gates requeridos: agregado de todos los gates individuales de R5-M00..M10 (G0-G15 según lo que cada uno declaró).
Resultado: **PASS**.

Validado:
- `npm test`: 136 archivos, 1216 tests PASS;
- `npm run lint`: PASS;
- `npm run build`: PASS;
- R5-M10: 4/4 escenarios Playwright PASS contra Neon development real;
- migración incremental en Neon development: 32 migraciones al día;
- migración desde cero en schema efímero dentro de Neon development: 32/32 aplicadas y schema eliminado al finalizar;
- compatibilidad de organizaciones existentes: 8 organizaciones, todas con `NO_APPROVAL`;
- warnings revisados: solo warning no bloqueante de chunks grandes del build y warnings deprecados de configuración Vite/esbuild; sin warning funcional o de seguridad abierto.

## 22. Rollback / remediación

Si algún sub-gate falla en la re-ejecución agregada, no se avanza a R5-M12: se diagnostica el microfase específico, se corrige, se repite este Gate.

## 23. Criterio de DONE

CUMPLIDO. Toda la suite de R5 pasa en una ejecución agregada limpia, las migraciones aplican desde cero en un schema efímero seguro, y no quedan warnings funcionales o de seguridad sin justificación vigente. Commit del Gate: pendiente de registrar.
