# R1-M08 — Atomicity

## 1. Objetivo
Confirmar que la escritura de una importación (creación/actualización de `employees` + `shifts` + `imports`) es atómica — todo o nada — y cerrar la brecha si no lo es.

## 2. Problema que resuelve
Un fallo a mitad de la escritura de un import grande (p. ej. 50 turnos) no debe dejar la base de datos en estado parcial (25 turnos escritos, import marcado como fallido pero turnos huérfanos).

## 3. Estado actual del repositorio
STATUS: NEEDS VERIFICATION. El baseline no confirma explícitamente que exista una transacción envolviendo toda la escritura del import en `api/_lib/data.js` / `api/imports/index.js`.

## 4. Alcance IN
Leer el código de escritura de import y confirmar si usa una transacción Postgres (BEGIN/COMMIT/ROLLBACK) envolviendo la inserción completa. Si no existe, añadirla.

## 5. Alcance OUT
No se rediseña el modelo de datos de import; solo se garantiza atomicidad de la escritura ya existente.

## 6. Dependencias
R1-M06.

## 7. Decisiones arquitectónicas
Si falta transacción: envolver la secuencia de inserts/upserts de un import en una única transacción de base de datos.

## 8. Modelo de datos afectado
`imports`, `employees`, `shifts` — sin cambio de esquema, solo de disciplina transaccional en el código de escritura.

## 9. API / Backend
`api/imports/index.js`, `api/_lib/data.js` — posible cambio para envolver en transacción si falta.

## 10. Frontend / UX
N/A — motivo: cambio interno de backend, sin impacto visible salvo mejor manejo de fallos parciales.

## 11. Seguridad y autorización
N/A — motivo: fuera de alcance de esta verificación.

## 12. i18n
N/A — motivo: sin cambios de texto de usuario salvo el mensaje de error si se endurece el manejo de fallos.

## 13. Accesibilidad
N/A — motivo: sin cambios de UI.

## 14. Responsive / temas
N/A — motivo: sin cambios de UI.

## 15. Observabilidad / errores
Si la transacción falla, debe hacer ROLLBACK completo y el usuario debe ver un error claro indicando que la importación no se aplicó.

## 16. Migraciones
Ninguna — cambio de código, no de esquema.

## 17. Compatibilidad y datos existentes
N/A — motivo: no reescribe datos existentes, solo la disciplina de escritura futura.

## 18. Tasks

### T01 — Verificar existencia de transacción envolvente
Objetivo: Leer el código de escritura de import y confirmar si hay BEGIN/COMMIT/ROLLBACK (o equivalente del driver Postgres usado) envolviendo toda la secuencia de escritura.
Archivos / módulos probables: `api/imports/index.js`, `api/_lib/data.js`.
Cambios: Ninguno en esta task, solo diagnóstico.
No hacer: No asumir atomicidad sin lectura de código.
Criterios de aceptación:
- [ ] Confirmado con cita de código si existe o no una transacción envolvente.
Tests: Ninguno.
Evidencia esperada: Cita de código (o ausencia confirmada).

### T02 — Implementar transacción envolvente si falta
Objetivo: Envolver la secuencia completa de escritura de un import (employees + shifts + imports) en una única transacción con rollback ante cualquier fallo intermedio.
Archivos / módulos probables: `api/imports/index.js`, `api/_lib/data.js`.
Cambios: Añadir BEGIN/COMMIT/ROLLBACK (o transacción del pool de conexión usado) alrededor de la secuencia de inserts.
No hacer: No cambiar la lógica de negocio de qué se inserta, solo la garantía transaccional.
Criterios de aceptación:
- [ ] Un fallo simulado a mitad de la escritura no deja filas parciales en `shifts`/`employees`.
Tests: Test de integración que simule fallo a mitad de escritura (p. ej. mock de error en el N-ésimo insert) y confirme rollback completo.
Evidencia esperada: Test en verde.

## 19. Tests obligatorios
Test de integración de fallo a mitad de escritura con verificación de rollback completo.

## 20. Evidencias
Resultado de T01, test de T02.

## 21. Gate
Gates obligatorios: G2 (Database/migrations), G3 (Domain invariants), G10 (Unit/integration tests).

Regla: FAIL si tras T02 persiste algún escenario de escritura parcial.

## 22. Rollback / remediación
Si el Gate falla: no commit, revisar puntos de fallo no cubiertos por la transacción, revalidar.

## 23. Criterio de DONE
Confirmado (con test) que la escritura completa de un import es atómica: todo se aplica o nada se aplica.
