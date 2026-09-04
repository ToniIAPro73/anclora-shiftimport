# R0-M07 — R0 Final Gate

## 1. Objetivo

Verificar de forma agregada que todos los bloqueadores de R0 (Product & Architecture Rebaseline) están cerrados antes de permitir el inicio de R1-M00, y registrar un Gate final consolidado.

## 2. Problema que resuelve

R1 (Safe Import Completion) empieza a ejecutarse asumiendo un contrato de producto, un vocabulario, un modelo de autorización futuro, un modelo de estados y unos límites de arquitectura ya estables. Sin un Gate agregado, podría iniciarse R1 con alguna de estas bases todavía incompleta o contradictoria.

## 3. Estado actual del repositorio

Depende del resultado real de R0-M00..M06. Esta spec define el criterio de cierre; no repite el contenido de las microfases individuales.

## 4. Alcance IN

- Verificar que R0-M00 a R0-M06 tienen Gate individual en PASS o PASS_WITH_WARNINGS (con warning explícitamente absorbido por una microfase futura, como el sign-off de OWNER en R2-M06).
- Verificar consistencia cruzada final entre: README.md/README.en.md, `DOMAIN-GLOSSARY.md`, `RBAC-MODEL.md`, `STATE-MODEL.md`, `MODULE-BOUNDARIES.md`, y el resto de `docs/`.
- Confirmar que el router introducido en R0-M05 no rompió ningún test, build o comportamiento visible.
- Confirmar explícitamente qué queda pendiente de sign-off humano (regla de backfill OWNER) antes de que R2-M06 pueda ejecutarla.

## 5. Alcance OUT

- No re-ejecutar el trabajo de R0-M00..M06 — solo verificar sus resultados.
- No empezar ningún task de R1 en esta microfase.

## 6. Dependencias

R0-M00, R0-M01, R0-M02, R0-M03, R0-M04, R0-M05, R0-M06.

## 7. Decisiones arquitectónicas

N/A — motivo: microfase de verificación agregada, no toma decisiones nuevas.

## 8. Modelo de datos afectado

N/A — motivo: ninguna migración ejecutada en R0; el Gate solo confirma que los diseños de R0-M03/M04 están completos y listos para R2/R3.

## 9. API / Backend

N/A — motivo: ningún endpoint nuevo en R0.

## 10. Frontend / UX

N/A — motivo: verificación del router de R0-M05 ya cubierta en su propio Gate; aquí solo se confirma que sigue en PASS.

## 11. Seguridad y autorización

N/A — motivo: ningún cambio de autorización ejecutado en R0 (solo diseño en R0-M03).

## 12. i18n

N/A — motivo: sin strings nuevos en R0.

## 13. Accesibilidad

N/A — motivo: cubierto por el Gate de R0-M05, no se repite aquí.

## 14. Responsive / temas

N/A — motivo: cubierto por el Gate de R0-M05.

## 15. Observabilidad / errores

N/A — motivo: no aplica a una microfase de verificación documental/agregada.

## 16. Migraciones

N/A — motivo: ninguna migración ejecutada en R0.

## 17. Compatibilidad y datos existentes

N/A — motivo: R0 no toca datos.

## 18. Tasks

### T01 — Verificar Gates individuales de R0-M00..M06

Objetivo: Confirmar PASS o PASS_WITH_WARNINGS justificado en cada microfase de R0.

Archivos / módulos probables: specs `R0-M00-*.md` a `R0-M06-*.md`.

Cambios: Ninguno — solo verificación.

No hacer: No convertir un FAIL en PASS sin remediar realmente.

Criterios de aceptación:
- [ ] Los 7 Gates individuales (R0-M00..M06) están en PASS o PASS_WITH_WARNINGS documentado.

Tests: N/A.

Evidencia esperada: Tabla resumen de Gates por microfase.

### T02 — Verificación cruzada final de documentación

Objetivo: Confirmar cero contradicciones entre todos los documentos canónicos producidos en R0.

Archivos / módulos probables: `README.md`, `README.en.md`, `DOMAIN-GLOSSARY.md`, `RBAC-MODEL.md`, `STATE-MODEL.md`, `MODULE-BOUNDARIES.md`, `docs/`.

Cambios: Ninguno — solo verificación (correcciones puntuales si aparece algo, delegando a re-abrir la microfase correspondiente si es sustancial).

No hacer: No parchear contradicciones sustanciales aquí sin volver a la microfase de origen.

Criterios de aceptación:
- [ ] Sin contradicciones detectadas.

Tests: N/A.

Evidencia esperada: Confirmación explícita en el resumen.

### T03 — Confirmar estado del router y suite de tests

Objetivo: Re-ejecutar `npm test`, build y typecheck una vez más para confirmar estabilidad al cierre de R0.

Archivos / módulos probables: repositorio completo.

Cambios: Ninguno.

No hacer: No hacer skip de fallos.

Criterios de aceptación:
- [ ] Suite completa, build y typecheck en verde.

Tests: Suite completa del repositorio.

Evidencia esperada: Salida de `npm test`, `npm run build`, typecheck.

### T04 — Registrar bloqueadores pendientes explícitos para R1/R2

Objetivo: Dejar constancia clara de qué decisiones quedan pendientes de sign-off humano (regla OWNER) antes de R2-M06.

Archivos / módulos probables: este documento.

Cambios: Sección "Pending items carried into R1/R2".

No hacer: No fingir que el sign-off ya ocurrió si no ha ocurrido.

Criterios de aceptación:
- [ ] Sección de pendientes explícita y completa.

Tests: N/A.

Evidencia esperada: Sección visible en este documento.

## 19. Tests obligatorios

Suite completa (`npm test`), build (`npm run build`) y typecheck deben estar en verde al cierre de R0.

## 20. Evidencias

Tabla resumen de Gates R0-M00..M06; confirmación de verificación cruzada; salida de test/build/typecheck; sección de pendientes para R1/R2.

## 21. Gate

Gates requeridos: **G0 a G15, subconjunto aplicable** (en la práctica: G0, G1, G3, G4, G14, G15 — los que aplicaron en las microfases individuales de R0; G2/G5-G13 no aplican porque R0 no ejecuta migraciones, endpoints ni UI de negocio nuevos).

Resultado agregado:
- **PASS** si los 7 Gates individuales están en PASS/PASS_WITH_WARNINGS justificado y la verificación cruzada (T02) no encuentra contradicciones.
- **FAIL** si cualquier microfase individual está en FAIL sin remediar, o si aparece una contradicción no detectada previamente — no se permite iniciar R1-M00 hasta remediar.

## 22. Rollback / remediación

Si el Gate agregado falla: identificar la microfase de origen del fallo, reabrirla, remediar, repetir su Gate individual, y volver a ejecutar este Gate agregado. No avanzar a R1 mientras este Gate no esté en PASS.

## 23. Criterio de DONE

Los 7 Gates de R0-M00..M06 en PASS/PASS_WITH_WARNINGS justificado, verificación cruzada de documentación sin contradicciones, suite de tests/build/typecheck en verde, y pendientes de sign-off (regla OWNER) registrados explícitamente para R2-M06. R1-M00 puede iniciar.
