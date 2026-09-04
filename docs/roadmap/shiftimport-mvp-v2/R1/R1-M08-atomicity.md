# R1-M08 — Atomicity

## 1. Objetivo
Confirmar que la escritura de una importación (creación/actualización de `employees` + `shifts` + `imports`) es atómica — todo o nada — y cerrar la brecha si no lo es.

## 2. Problema que resuelve
Un fallo a mitad de la escritura de un import grande (p. ej. 50 turnos) no debe dejar la base de datos en estado parcial (25 turnos escritos, import marcado como fallido pero turnos huérfanos).

## 3. Estado actual del repositorio
STATUS: era NEEDS VERIFICATION, ahora DONE tras esta microfase — brecha real encontrada y cerrada.

### T01 — Hallazgo

`upsertShifts` (`api/_lib/data.js:1394`, invocada por `syncRemoteShifts` en el flujo de confirmación de ambos modales) era un `for` loop con un `INSERT` individual por turno, **sin transacción envolvente**. Cada `INSERT` se autoconfirma individualmente contra el driver HTTP de Neon fuera de una transacción. Si el turno N de un lote lanzaba (p. ej. `EMPLOYEE_NOT_ACTIVE`, límite de plan), los turnos 1..N-1 ya estaban escritos en `shifts` mientras el resto nunca se escribía — exactamente el escenario "25 turnos escritos, resto no" del problema que esta microfase existe para cerrar. Confirmado: **violación real del invariante de atomicidad.**

(`resetOrganization` y `deleteImport`, en cambio, ya usaban `sql.transaction((txn) => [...])` correctamente — el patrón existía en el código, solo no se aplicaba a `upsertShifts`.)

### T02 — Corrección aplicada

`upsertShifts` se dividió en dos pasadas:
1. **Validación + cómputo** (sin escritura): mismo bucle, misma lógica exacta de validación/resolución de área/límite de plan que antes, pero ahora solo acumula los parámetros de escritura de cada turno (`id`, `employeeId`, `shiftAreaId`, `semanticFingerprint`) en un array `prepared`, sin tocar la base de datos. Cualquier turno inválido lanza aquí, **antes de que se haya escrito nada del lote**.
2. **Escritura atómica**: `sql.transaction((txn) => prepared.map(...))` — todos los `INSERT` (la misma SQL exacta que antes, sin cambios de lógica de negocio) se ejecutan como una única transacción. Si Postgres rechaza cualquiera de ellos, la transacción entera hace rollback.

Efecto: un turno inválido en cualquier posición del lote ahora aborta el lote **completo** antes de escribir nada — más estricto que el comportamiento anterior (que sí escribía los turnos previos al fallo).

Dos fakes de test (`api/_lib/data.test.js`, `api/_lib/data.areas.test.js`) no implementaban `sql.transaction` — se les añadió el mismo shim ya usado para `resetOrganization`/`deleteImport` (`sql.transaction = async (fn) => Promise.all(fn(sql))`).

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
- [x] Confirmado con cita de código si existe o no una transacción envolvente — no existía (ver sección 3, T01).
Tests: Ninguno adicional para el diagnóstico.
Evidencia esperada: `api/_lib/data.js:1394` (antes: `for` loop de `INSERT` individuales, sin `sql.transaction`).

### T02 — Implementar transacción envolvente si falta
Objetivo: Envolver la secuencia completa de escritura de un import (employees + shifts + imports) en una única transacción con rollback ante cualquier fallo intermedio.
Archivos / módulos probables: `api/imports/index.js`, `api/_lib/data.js`.
Cambios: Añadir BEGIN/COMMIT/ROLLBACK (o transacción del pool de conexión usado) alrededor de la secuencia de inserts.
No hacer: No cambiar la lógica de negocio de qué se inserta, solo la garantía transaccional.
Criterios de aceptación:
- [x] Un fallo simulado a mitad de la escritura no deja filas parciales en `shifts`/`employees` — verificado con un lote de 2 turnos (primero válido, segundo inválido): cero `INSERT INTO shifts` ejecutados.
Tests: `api/_lib/data.test.js` — nuevo describe `batch atomicity (R1-M08)`: (1) un turno inválido en cualquier posición del lote no escribe nada, ni siquiera los turnos previos válidos; (2) un lote completamente válido escribe todos los turnos vía `sql.transaction` (`state.transactionUsed === true`).
Evidencia esperada: `npm test` → 96 archivos, 983 tests, todos en verde (981 + 2 nuevos).

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
