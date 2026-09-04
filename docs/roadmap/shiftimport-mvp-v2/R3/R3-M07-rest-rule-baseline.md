# R3-M07 — Rest Rule Baseline

## 1. Objetivo
Validar un periodo mínimo de descanso entre dos turnos consecutivos del mismo empleado dentro de una `ScheduleVersion`.

## 2. Problema que resuelve
Evita planificaciones que violan descansos mínimos razonables entre jornadas (p.ej. cerrar a medianoche y abrir a las 6am), reduciendo riesgo legal/operativo antes de publicar.

## 3. Estado actual del repositorio
MISSING. Depende de R3-M06 (validación de solapamiento ya en su sitio; el descanso es una validación complementaria, no sustituta).

## 4. Alcance IN
- Regla fija: mínimo 11 horas de descanso entre el fin de un turno y el inicio del siguiente del mismo empleado (valor por defecto propuesto, estilo normativa UE — **requiere confirmación de producto/legal antes de marcar esta microfase DONE**, ya que la normativa laboral varía por jurisdicción y convenio).
- Validación aplicada en los mismos endpoints de create/update de assignment (R3-M05), como capa adicional a la de solapamiento (R3-M06).

## 5. Alcance OUT
Reglas configurables por organización/convenio (motor de reglas genérico — expresamente prohibido en esta fase, §32 del prompt maestro: "no introducir microservicios... no features post-MVP"). Validación de horas máximas semanales, descansos semanales, festivos — fuera de alcance MVP.

## 6. Dependencias
R3-M06.

## 7. Decisiones arquitectónicas
Valor de 11 horas hardcodeado como constante de dominio (no columna de configuración), documentado como decisión temporal MVP. Si el piloto revela necesidad real de configurabilidad, eso se plantea como microfase nueva post-piloto, no se anticipa aquí (evitar over-engineering, §3 del prompt maestro).

**BLOQUEO EXPLÍCITO**: esta microfase no puede alcanzar Gate PASS sin que el valor de 11h (o el que se decida) esté confirmado por el responsable de producto — es una decisión con implicación legal/laboral real, no una elección técnica libre. Documentar la confirmación en la sección 20 (Evidencias) antes de cerrar el Gate.

## 8. Modelo de datos afectado
Ninguno — validación en capa de aplicación.

## 9. API / Backend
Los endpoints de R3-M05 devuelven 422 con `{ error: 'REST_RULE_VIOLATION', minimumRestHours: 11, conflictingAssignmentId }` cuando aplica.

## 10. Frontend / UX
N/A en esta microfase — consumido por el planner UI (R3-M08).

## 11. Seguridad y autorización
N/A adicional — hereda guard de R3-M05.

## 12. i18n
Mensaje de error con clave i18n ES/EN, mencionando explícitamente el mínimo de horas requerido.

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
Objetivo: obtener y documentar la decisión formal (11h u otro valor) antes de implementar.
Archivos / módulos probables: este documento (sección 20).
Cambios: N/A — decisión de producto, no código.
No hacer: no implementar la validación con un valor sin confirmar.
Criterios de aceptación:
- [ ] Valor confirmado y documentado con quién lo aprobó y cuándo.
Tests: N/A.
Evidencia esperada: nota de confirmación registrada.

### T02 — Validación de descanso mínimo en create/update
Objetivo: implementar el chequeo con el valor confirmado en T01.
Archivos / módulos probables: mismo módulo de datos que R3-M06.
Cambios: query que busca el assignment inmediatamente anterior/siguiente del mismo empleado y calcula el gap.
No hacer: no implementar como regla configurable por organización.
Criterios de aceptación:
- [ ] Crear un assignment con menos del mínimo de descanso respecto al turno adyacente es rechazado.
- [ ] Assignments con exactamente el mínimo son aceptados (límite inclusivo, documentar la elección).
Tests: unit test de la función de cálculo de gap (casos límite) + integración sobre los endpoints.
Evidencia esperada: resultados de test adjuntos.

## 19. Tests obligatorios
`unit`, `API`, `integration`.

## 20. Evidencias
Confirmación de producto sobre el valor (T01), función de validación commiteada, tests en PASS.

## 21. Gate
Gates requeridos: **G3**, **G10**.

Resultado BLOCKED si T01 no está confirmado — no se permite PASS_WITH_WARNINGS sobre un valor legal no confirmado (riesgo real, no solo deuda técnica, §9 del prompt maestro).

## 22. Rollback / remediación
Si el valor confirmado cambia después de implementado: es un cambio de constante, no de schema — remediación trivial, nueva microfase de ajuste si el piloto lo requiere.

## 23. Criterio de DONE
Valor confirmado por producto, validación operativa, casos límite cubiertos por test, Gate G3+G10 PASS.
