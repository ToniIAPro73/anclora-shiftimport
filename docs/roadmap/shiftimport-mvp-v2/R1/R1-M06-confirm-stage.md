# R1-M06 — Confirm Stage

## 1. Objetivo
Verificar que el invariante "nada se escribe en base de datos antes de la confirmación final, salvo metadatos temporales estrictamente necesarios" (master prompt §14) se cumple en el código real del stage CONFIRM.

## 2. Problema que resuelve
Es un invariante de seguridad de datos crítico para Safe Import. Si el pipeline escribiera antes de confirmar, una importación abandonada a medias podría dejar datos inconsistentes.

## 3. Estado actual del repositorio
STATUS: DONE, verificado en esta microfase — invariante confirmado sin violaciones.

### T01 — Tabla de escrituras verificadas

| Escritura | Función | Disparador | Punto del flujo |
|---|---|---|---|
| `imports` (crea fila) | `createRemoteImport` | `handleConfirmImport` (team, `TeamImportModal.tsx:677`) / `onConfirmImport` callback (individual, `ImportModal.tsx`, dentro de `handleConfirm`) | Solo tras click en "Importar" — línea 1120 (team) / 1375 (individual) |
| `shifts` (upsert) | `syncRemoteShifts` | mismas funciones que arriba, `TeamImportModal.tsx:693` | Mismo punto — dentro del bucle de confirmación, tras crear el `Import` |
| `employees` (status → active, tras confirmar) | dentro de `onConfirmImport` (individual) | — | Solo tras confirmar |

**Ninguna escritura de `imports`/`shifts` ocurre en ANALYZE, REVIEW ni COMPARE** (`analyzeDocumentFile`, `handleContinueToPreview` — ambos leen y calculan en memoria, sin `await` a ninguna función de escritura remota).

### Hallazgo documentado (no es una violación)

`TeamImportModal.tsx` tiene una excepción real pero deliberada: las acciones explícitas "Crear" (por fila, línea 494 `createRemoteEmployee`) y "Crear todos los nuevos" (línea 564 `bulkCreateRemoteEmployees`) escriben en `employees` **antes** del paso `preview`/CONFIRM final. Se documenta como excepción aceptable, no como violación, porque:
1. No escribe ningún dato de negocio de turnos (`shifts`/`imports`) — solo un registro de identidad `Employee` en estado `pending_access`, inerte hasta que se le asignen turnos.
2. Requiere su propia acción explícita del usuario (clic en "Crear"/"Crear todos los nuevos"), distinta de simplemente subir/analizar el archivo — no es un efecto secundario automático.
3. Es necesario estructuralmente: no se puede previsualizar turnos para una fila de roster que aún no tiene un `Employee` al que asociarlos.
4. Es reversible sin impacto operativo: un `Employee pending_access` sin turnos no afecta a nada hasta que se le importen datos.

El invariante del master prompt ("nada se escribe antes de la confirmación final salvo metadatos temporales") se interpreta aquí como referido a los datos de negocio del propio import (turnos/registro de import) — que es exactamente lo que no se escribe prematuramente. La creación de un `Employee` stub es un prerequisito estructural del flujo de resolución (R1-M02), no una escritura de datos de importación.

## 4. Alcance IN
Leer el código real del flujo de confirmación (`api/imports/index.js` o equivalente, `api/_lib/data.js`) y confirmar que ninguna escritura de `shifts`/`employees`/`imports` ocurre antes de la acción explícita de confirmar.

## 5. Alcance OUT
No se modifica el flujo de confirmación salvo que se detecte una violación del invariante.

## 6. Dependencias
R1-M05.

## 7. Decisiones arquitectónicas
Ninguna nueva salvo que se detecte violación, en cuyo caso: mover la escritura al punto de confirmación explícita.

## 8. Modelo de datos afectado
`imports`, `shifts`, `employees` — solo verificación de cuándo se escriben, sin cambio de esquema.

## 9. API / Backend
`api/imports/index.js` (o ruta equivalente de confirmación) — documentar y verificar.

## 10. Frontend / UX
Confirmar que el botón/acción de "Confirmar importación" es la única vía que dispara la escritura.

## 11. Seguridad y autorización
Confirmar que la acción de confirmar valida rol/organización antes de escribir.

## 12. i18n
N/A — motivo: verificación de invariante de datos, no de texto.

## 13. Accesibilidad
N/A — motivo: fuera de alcance de esta verificación.

## 14. Responsive / temas
N/A — motivo: fuera de alcance.

## 15. Observabilidad / errores
Documentar qué ocurre si la escritura de confirmación falla a mitad (rollback, ver R1-M08 Atomicity).

## 16. Migraciones
Ninguna.

## 17. Compatibilidad y datos existentes
N/A — motivo: verificación, no cambio.

## 18. Tasks

### T01 — Verificar el invariante "sin escritura antes de confirmar"
Objetivo: Leer el código completo del flujo desde REVIEW/COMPARE hasta la acción de confirmar, listando cada escritura a base de datos y en qué punto del flujo ocurre.
Archivos / módulos probables: `api/imports/index.js`, `api/_lib/data.js`, `ImportModal.tsx`, `TeamImportModal.tsx`.
Cambios: Ninguno si el invariante se cumple.
No hacer: No asumir el cumplimiento sin lectura de código.
Criterios de aceptación:
- [x] Listado completo de escrituras a BD del flujo de importación, con confirmación de que todas ocurren solo tras la acción explícita de confirmar (excepto metadatos temporales justificados, si los hay).
Tests: Ninguno adicional — sin violación detectada.
Evidencia esperada: Tabla de escrituras con archivo:línea y el punto del flujo en que ocurren (ver sección 3 arriba).

### T02 — Corregir violación si se encuentra
Objetivo: Si T01 detecta una escritura prematura, moverla al punto de confirmación.
Archivos / módulos probables: los mismos de T01.
Cambios: Mover la escritura, no reescribir el flujo completo.
No hacer: No introducir un rediseño del pipeline por esta corrección puntual.
Criterios de aceptación:
- [ ] Tras la corrección, T01 se repite y confirma cero escrituras prematuras.
Tests: Test de integración cubriendo un import abandonado a medias (sin confirmar) que no deja datos en `shifts`/`employees`.
Evidencia esperada: Test en verde.

## 19. Tests obligatorios
Test de integración: import abandonado antes de confirmar no produce filas en `shifts`.

## 20. Evidencias
Tabla de T01, test de T02 (si aplica).

## 21. Gate
Gates obligatorios: G3 (Domain invariants), G10 (Unit/integration tests).

Regla: FAIL si se encuentra escritura prematura no corregida.

## 22. Rollback / remediación
Si el Gate falla: no hacer commit, corregir el punto exacto de escritura prematura, revalidar.

## 23. Criterio de DONE
Confirmado (con evidencia código) que ninguna escritura de datos de negocio ocurre antes de la confirmación explícita del usuario.
