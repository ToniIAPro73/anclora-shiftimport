# R3-M07 — Rest Rule Baseline

STATUS: DONE — PASS

## 1. Objetivo
Validar un periodo mínimo de descanso entre dos turnos consecutivos del mismo empleado dentro de una `ScheduleVersion`.

## 2. Problema que resuelve
Evita planificaciones que violan descansos mínimos razonables entre jornadas (p.ej. cerrar a medianoche y abrir a las 6am), reduciendo riesgo legal/operativo antes de publicar.

## 3. Estado actual del repositorio
IMPLEMENTED. Depende de R3-M06 (validación de solapamiento ya en su sitio; el descanso es una validación complementaria, no sustituta).

## 4. Alcance IN
- Regla fija: mínimo 11 horas de descanso entre el fin de un turno y el inicio del siguiente del mismo empleado. Producto/legal confirmó este valor el 2026-09-04.
- Validación aplicada en los mismos endpoints de create/update de assignment (R3-M05), como capa adicional a la de solapamiento (R3-M06).

## 5. Alcance OUT
Reglas configurables por organización/convenio (motor de reglas genérico — expresamente prohibido en esta fase, §32 del prompt maestro: "no introducir microservicios... no features post-MVP"). Validación de horas máximas semanales, descansos semanales, festivos — fuera de alcance MVP.

## 6. Dependencias
R3-M06.

## 7. Decisiones arquitectónicas
Valor de 11 horas hardcodeado como constante de dominio (no columna de configuración), documentado como decisión temporal MVP. Producto/legal aprobó explícitamente el valor el 2026-09-04. Si el piloto revela necesidad real de configurabilidad, eso se plantea como microfase nueva post-piloto, no se anticipa aquí (evitar over-engineering, §3 del prompt maestro).

## 8. Modelo de datos afectado
Ninguno — validación en capa de aplicación.

## 9. API / Backend
Los endpoints de R3-M05 devuelven 422 con `{ error: 'Minimum rest period is 11 hours', code: 'REST_RULE_VIOLATION', minimumRestHours: 11, conflictingAssignmentId }` cuando aplica. La validación considera assignments próximos por fecha, turnos overnight y el límite inclusivo de 11 horas.

## 10. Frontend / UX
N/A en esta microfase — consumido por el planner UI (R3-M08).

## 11. Seguridad y autorización
N/A adicional — hereda guard de R3-M05.

## 12. i18n
N/A en backend — se expone un código estable y el número de horas para que la UI de R3-M08 lo traduzca en ES/EN.

## 13. Accesibilidad
N/A — sin UI en esta microfase.

## 14. Responsive / temas
N/A.

## 15. Observabilidad / errores
Error 422 distinguible de `OVERLAP` (R3-M06), 409 y 403.

## 16. Migraciones
N/A.

## 17. Compatibilidad y datos existentes
N/A — feature nueva, no afecta datos existentes.

## 18. Tasks

### T01 — Confirmación de producto sobre el valor del descanso mínimo
Objetivo: documentar la decisión formal antes de implementar.
Archivos / módulos probables: este documento (sección 20).
Cambios: valor confirmado: 11 horas.
No hacer: no convertir el valor en configuración por organización durante el MVP.
Criterios de aceptación:
- [x] Valor confirmado y documentado como aprobación de producto/legal del 2026-09-04.
Tests: N/A.
Evidencia esperada: nota de confirmación registrada.

### T02 — Validación de descanso mínimo en create/update
Objetivo: implementar el chequeo con el valor confirmado en T01.
Archivos / módulos probables: mismo módulo de datos que R3-M06.
Cambios: query que busca el assignment inmediatamente anterior/siguiente del mismo empleado y calcula el gap.
No hacer: no implementar como regla configurable por organización.
Criterios de aceptación:
- [x] Crear un assignment con menos del mínimo de descanso respecto a otro del mismo empleado es rechazado.
- [x] Assignments con exactamente el mínimo son aceptados (límite inclusivo).
Tests: unit test de la función de cálculo de gap (casos límite) + integración sobre los endpoints.
Evidencia esperada: resultados de test adjuntos.

## 19. Tests obligatorios
`unit`, `API`, `integration`.

## 20. Evidencias
Confirmación: producto/legal aprobó el mínimo de 11 horas el 2026-09-04.

Implementación:
- `api/_lib/scheduling.js`: constante de dominio, cálculo de gaps entre fechas, soporte overnight y validación en create/update.
- `api/_lib/http.js`: serialización del valor `minimumRestHours` en errores 422.
- `api/schedules/assignments.test.js`: helper y frontera inclusiva cubiertos; 6 tests PASS.
- `qa/e2e-acceptance/specs-local/scheduling-draft.spec.ts`: rechazo a 10h59 y aceptación a 11h; 4 tests E2E PASS.
- Corrección defensiva de DATE PostgreSQL materializado como `Date` local para evitar desplazamientos de fecha con `toISOString()`.
- Verificación visual con `agent-browser` contra `http://localhost:3199`: contenido renderizado, sin overlay de error.
- Suite completa: 102 archivos y 1041 tests PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.

## 21. Gate
Gates requeridos: **G3**, **G10**.

Resultado ejecutado: **PASS**.

- G3 — PASS: mínimo fijo de 11 horas, límite inclusivo, solapamiento separado y assignments overnight cubiertos.
- G10 — PASS: unit/API/E2E específicos ejecutados; suite completa, lint, build y diff check PASS.

## 22. Rollback / remediación
Si el valor confirmado cambia después de implementado: es un cambio de constante, no de schema — remediación trivial, nueva microfase de ajuste si el piloto lo requiere.

## 23. Criterio de DONE
Valor confirmado por producto/legal, validación operativa, casos límite cubiertos por test, Gate G3+G10 PASS. Commit de implementación: `79b3faf`.
