# R2-M12 — R2 Final Gate

## 1. Objetivo

Cerrar formalmente Organization Foundation antes de comenzar R3 (Future Scheduling), confirmando que roles, scopes, autorización, auditoría y aislamiento cross-tenant están completos y verificados.

## 2. Problema que resuelve

R3/R4/R5 asumen un modelo de autorización estable (4 roles, 3 scopes, enforcement server-side). Avanzar sin este cierre propagaría deuda de seguridad a cada microfase futura.

## 3. Estado actual del repositorio

Depende del resultado de R2-M00 a R2-M11, todas ejecutadas antes de esta microfase.

## 4. Alcance IN

Verificación agregada de que R2-M00..M11 tienen Gate PASS o PASS_WITH_WARNINGS (con warning explícitamente no bloqueante y absorbido por una microfase futura declarada).

## 5. Alcance OUT

No se introduce funcionalidad nueva en esta microfase — es puramente de verificación agregada.

## 6. Dependencias

R2-M00, R2-M01, R2-M02, R2-M03, R2-M04, R2-M05, R2-M06, R2-M07, R2-M08, R2-M09, R2-M10, R2-M11.

## 7. Decisiones arquitectónicas

N/A — motivo: microfase de cierre, no toma decisiones nuevas.

## 8. Modelo de datos afectado

N/A — motivo: microfase de verificación agregada.

## 9. API / Backend

N/A — motivo: verificación agregada de lo ya construido en R2-M01..M11.

## 10. Frontend / UX

N/A — motivo: verificación agregada.

## 11. Seguridad y autorización

Confirmar explícitamente: (a) 4 roles operativos con backfill correcto (R2-M06), (b) 3 scopes aplicados en todos los endpoints relevantes (R2-M07/M08), (c) suite de aislamiento cross-tenant en verde (R2-M11).

## 12. i18n

Confirmar `i18n-coverage.test.ts` en verde tras todas las claves añadidas en R2.

## 13. Accesibilidad

N/A — motivo: sin nueva superficie de UI propia; hereda el estado de R2-M01/M06/M07.

## 14. Responsive / temas

N/A — motivo: hereda el estado de las microfases individuales.

## 15. Observabilidad / errores

Confirmar que R2-M09 (auditoría) está capturando eventos reales en un entorno de prueba.

## 16. Migraciones

Confirmar que todas las migraciones de R2 (roles, scopes, auditoría) están aplicadas limpiamente en Neon de desarrollo, en orden, sin conflictos.

## 17. Compatibilidad y datos existentes

Confirmar invariante final: cada organización tiene exactamente un OWNER, ningún empleado quedó en estado inconsistente, ninguna vinculación duplicada.

## 18. Tasks

### T01 — Checklist agregado de Gates R2-M00..M11

Objetivo: Confirmar estado PASS/PASS_WITH_WARNINGS de cada microfase previa.
Archivos / módulos probables: esta spec + specs individuales de R2.
Cambios: Ninguno de código; tabla de verificación.
No hacer: No declarar PASS agregado si alguna microfase individual está en FAIL o BLOCKED.
Criterios de aceptación:
- [ ] Las 12 microfases previas (R2-M00..M11) tienen Gate registrado como PASS o PASS_WITH_WARNINGS justificado.
Tests: N/A — checklist.
Evidencia esperada: tabla de estado por microfase.

### T02 — Regresión completa de R1 (Safe Import) sobre el nuevo modelo de autorización

Objetivo: Confirmar que el motor de importación (R1) sigue funcionando correctamente bajo los roles/scopes nuevos.
Archivos / módulos probables: `qa/e2e-acceptance/`, suite de ingestión.
Cambios: Ninguno; solo ejecución.
No hacer: No omitir esta regresión — es el diferencial principal del producto.
Criterios de aceptación:
- [ ] Suite de importación completa en verde bajo el nuevo modelo de roles/scopes.
Tests: suite de ingestión existente.
Evidencia esperada: resultado de ejecución.

## 19. Tests obligatorios

Regresión completa: unit, integration, E2E de R1 y R2.

## 20. Evidencias

Tabla de estado T01, resultado de regresión T02.

## 21. Gate

Gates requeridos: G0 (Repository/baseline integrity), G2, G3, G4, G10, G11, G12, G13, G14 (subconjunto agregado de los ya exigidos en R2-M00..M11).

## 22. Rollback / remediación

Si cualquier microfase previa está en FAIL, R2-M12 no puede declarar PASS — se retorna a la microfase fallida, se remedia, y se reintenta esta Gate final.

## 23. Criterio de DONE

Todas las microfases R2-M00..M11 cerradas con PASS/PASS_WITH_WARNINGS justificado; regresión de R1 en verde bajo el nuevo modelo de autorización; commit de cierre de release R2 realizado.
