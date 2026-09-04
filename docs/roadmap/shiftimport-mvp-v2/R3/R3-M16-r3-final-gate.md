# R3-M16 — R3 Final Gate

## 1. Objetivo
Verificar y cerrar formalmente que el release R3 (Future Scheduling) cumple todos sus criterios antes de habilitar el inicio de R4 (Employee Portal).

## 2. Problema que resuelve
Evita iniciar R4 (que depende de datos publicados por Scheduling) sobre una base R3 con Gates pendientes o parciales.

## 3. Estado actual del repositorio
N/A — microfase de cierre, no de implementación.

## 4. Alcance IN
- Confirmar Gate PASS de R3-M00 a R3-M15, cada uno con su SHA de commit registrado.
- Confirmar explícitamente que las dependencias externas (R0-M05, R2-M06/M07) siguen en PASS (no han sido revertidas).
- Ejecutar una pasada de regresión completa: suite de Safe Import (R1) + suite de Organization (R2) + suite de Scheduling (R3) todas en PASS simultáneamente.

## 5. Alcance OUT
Cualquier feature nueva — esta microfase no implementa, solo verifica y cierra.

## 6. Dependencias
R3-M00 a R3-M15.

## 7. Decisiones arquitectónicas
N/A — microfase de verificación.

## 8. Modelo de datos afectado
N/A.

## 9. API / Backend
N/A.

## 10. Frontend / UX
N/A.

## 11. Seguridad y autorización
Re-ejecutar R3-M13 (matriz de autorización) como parte de la regresión, no confiar en que sigue válida solo porque pasó una vez.

## 12. i18n
N/A adicional — cubierto por R3-M15.

## 13. Accesibilidad
N/A adicional — cubierto por R3-M09.

## 14. Responsive / temas
N/A adicional.

## 15. Observabilidad / errores
N/A.

## 16. Migraciones
Confirmar que todas las migraciones 0013-0017 (o el rango final real usado) están aplicadas y documentadas en `db/migrations/`.

## 17. Compatibilidad y datos existentes
Confirmar que el import de histórico (R1) sigue funcionando exactamente igual tras toda la integración de R3-M14 (regresión cero, ya verificado en R3-M15 pero re-confirmado aquí como parte del cierre).

## 18. Tasks

### T01 — Checklist de cierre de release
Objetivo: recorrer R3-M00..M15 y confirmar Gate PASS + SHA de cada uno.
Archivos / módulos probables: este documento (sección 20).
Cambios: checklist completado.
No hacer: no marcar PASS si algún ítem quedó en PASS_WITH_WARNINGS sin justificación explícita heredada de su spec original.
Criterios de aceptación:
- [ ] Los 16 microfases de R3 (M00-M15) tienen SHA registrado y Gate PASS.
Tests: N/A.
Evidencia esperada: checklist con SHAs.

### T02 — Regresión completa cruzada
Objetivo: ejecutar toda la suite de tests del repo (R1+R2+R3) en un solo pase y confirmar cero fallos.
Archivos / módulos probables: `npm test` completo + suite E2E completa.
Cambios: N/A — solo ejecución.
No hacer: no excluir suites "para ir más rápido".
Criterios de aceptación:
- [ ] `npm test` completo en PASS.
- [ ] Suite E2E completa (R1 + R2 + R3) en PASS.
Tests: la ejecución completa es el entregable.
Evidencia esperada: output completo adjunto.

## 19. Tests obligatorios
Todos los definidos en R3-M00..M15, ejecutados juntos.

## 20. Evidencias
Checklist de 16 microfases con SHA, output de regresión completa.

## 21. Gate
Gate agregado: requiere que TODOS los gates individuales de R3-M00..M15 sigan en PASS, más regresión cruzada limpia. Resultado único: PASS / FAIL / BLOCKED (no se admite PASS_WITH_WARNINGS a nivel de Final Gate salvo que ya viniera heredado y justificado de una microfase individual).

## 22. Rollback / remediación
Si algo falla aquí: identificar la microfase origen del fallo, volver a ella, corregir, re-ejecutar su Gate individual, y repetir este Final Gate — no parchear directamente en esta microfase.

## 23. Criterio de DONE
Los 16 Gates individuales en PASS con SHA registrado, regresión cruzada limpia, R4 habilitado para empezar.
