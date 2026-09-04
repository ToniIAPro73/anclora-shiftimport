# R4-M13 — R4 Final Gate

## 1. Objetivo

Gate agregado que certifica que el Portal del Empleado (R4-M00 a R4-M12) está completo, seguro, accesible y consistente antes de habilitar R5 (Approval Lite) a apoyarse en sus recursos (Change Request en particular).

## 2. Problema que resuelve

Evita avanzar a R5 con una base de Change Request/Acknowledgement incompleta o con brechas de aislamiento no detectadas por las microfases individuales.

## 3. Estado actual del repositorio

R4-M00 a R4-M12 deben estar todas en Gate PASS (o PASS_WITH_WARNINGS explícitamente permitido por su propia spec) antes de ejecutar esta microfase.

## 4. Alcance IN

- Verificación agregada de que R0-M05 (routing) y R3-M10 (Publication) — dependencias externas de R4 — siguen en PASS (no se han revertido ni degradado desde que R4 empezó).
- Re-ejecución de la matriz de tests de R4-M12 (E2E) como smoke final.
- Revisión de que ningún endpoint de R4 escribe estados `APPROVED`/`REJECTED` de change requests (invariante de R4-M06, re-verificado aquí a nivel agregado).
- Checklist de calidad UI premium (master-prompt §22) aplicado a las 10 pantallas, consolidando R4-M10/M11.

## 5. Alcance OUT

Cualquier implementación nueva — este es un Gate, no una microfase de construcción.

## 6. Dependencias

R4-M00 a R4-M12.

## 7. Decisiones arquitectónicas

N/A — motivo: microfase de verificación, no de diseño.

## 8. Modelo de datos afectado

N/A — motivo: solo verificación, sin migraciones propias.

## 9. API / Backend

N/A — motivo: solo verificación de invariantes ya implementados.

## 10. Frontend / UX

N/A — motivo: solo verificación agregada.

## 11. Seguridad y autorización

Punto de control explícito: confirmar que ningún endpoint de R4 puede escribir `change_requests.status IN ('APPROVED','REJECTED')` — grep/test dedicado.

## 12. i18n

Confirmar cobertura completa ES/EN de las 10 pantallas (test de paridad de claves ya existente, `i18n-coverage.test.ts`, extendido a los nuevos archivos).

## 13. Accesibilidad

Confirmar cero violaciones axe críticas/serias remanentes (de R4-M11).

## 14. Responsive / temas

Confirmar checklist de R4-M10 sin regresiones.

## 15. Observabilidad / errores

Confirmar ausencia de errores de consola en la ejecución completa del E2E de R4-M12.

## 16. Migraciones

Confirmar que las migraciones de `shift_acknowledgements`, `shift_comments`, `change_requests`, `notifications` están todas aplicadas limpiamente en el entorno de desarrollo (Neon dev) sin errores.

## 17. Compatibilidad y datos existentes

Confirmar que ningún turno histórico importado quedó en estado inconsistente tras introducir las 4 tablas nuevas.

## 18. Tasks

### T01 — Checklist agregado de Gates individuales
Objetivo: confirmar PASS de R4-M00..M12.
Archivos: N/A (proceso de verificación).
Cambios: N/A.
No hacer: no declarar PASS si algún Gate individual está en FAIL o BLOCKED.
Criterios de aceptación:
- [ ] Los 13 Gates individuales de R4 están en PASS o PASS_WITH_WARNINGS documentado.
Tests: revisión de cada spec.
Evidencia esperada: tabla de estado de las 13 microfases.

### T02 — Re-ejecución de suite completa (unit + integration + E2E)
Objetivo: smoke final sin regresiones.
Archivos: N/A.
Cambios: N/A.
No hacer: N/A.
Criterios de aceptación:
- [ ] `npm test` y suite E2E de R4 pasan en verde.
Tests: ejecución completa.
Evidencia esperada: log de ejecución completo.

### T03 — Verificación del invariante de no-aprobación
Objetivo: confirmar que R4 no introdujo ningún camino de escritura a `APPROVED`/`REJECTED`.
Archivos: grep sobre `api/me/change-requests/` y afines.
Cambios: N/A.
No hacer: N/A.
Criterios de aceptación:
- [ ] Cero ocurrencias de escritura a esos valores fuera del alcance reservado a R5.
Tests: grep + test dedicado de T05 en R4-M06.
Evidencia esperada: resultado de grep documentado.

## 19. Tests obligatorios

Full regression (unit+integration+E2E), Security (invariante de aprobación), Accessibility (axe agregado), i18n (paridad de claves).

## 20. Evidencias

Tabla de estado de las 13 microfases, log de ejecución completa, resultado de grep de seguridad.

## 21. Gate

Gates obligatorios: agregación de G0-G15 según lo que cada microfase individual haya requerido (ver tabla en 00-ROADMAP-MASTER.md).

Resultado: PASS solo si todas las microfases R4-M00..M12 están en PASS/PASS_WITH_WARNINGS documentado y las tres tasks de esta microfase se completan sin hallazgos. Cualquier FAIL bloquea el inicio de R5.

## 22. Rollback / remediación

Si el Gate falla, no se hace commit de esta microfase; se identifica cuál de las 13 sub-microfases causó el fallo y se remedia allí, no aquí.

## 23. Criterio de DONE

R4 completo, verificado de forma agregada, sin invariantes rotos; Gate PASS; R5 puede iniciar apoyándose en `change_requests`.
