# R1-M13 — Individual vs Team Import

## 1. Objetivo
Documentar y verificar las diferencias de contrato entre importación individual y de equipo.

## 2. Problema que resuelve
Ambos flujos comparten motor de ingestión pero difieren en UX y en resolución de empleados (uno vs varios); es necesario un contrato claro de qué es común y qué diverge.

## 3. Estado actual del repositorio
STATUS: DONE.

### T01 — Tabla de diferencias

| Aspecto | Individual (`ImportModal.tsx`) | Team (`TeamImportModal.tsx`) |
|---|---|---|
| Entrada al motor | `analyzeDocumentFile` (R1-M03) | `analyzeDocumentFile` — mismo motor |
| Diagnóstico de estado | `buildImportDiagnosis`/`diagnosisFromError` (`diagnostics.ts`) | Mismas funciones, mismo módulo (confirmado R1-M12) |
| Detección de roster | No aplica — un único empleado, seleccionado antes de importar | `team-roster.ts` (CSV/tabular) / `pdf-roster.ts` (PDF posicional) — enumera cada empleado distinto del documento |
| Resolución de empleado | Un empleado (nombre/id introducido manualmente o preseleccionado) | `bulkCreateEmployees` (R1-M02): matching por `external_employee_id` o nombre, para N filas de roster |
| Etapa REVIEW | Tabla editable de turnos de un empleado (R1-M04) | Selección de filas reconocidas/nuevas/ambiguas por empleado (paso `select`), antes de construir el preview |
| Etapa COMPARE | `importDiff` (`classifyImportChanges`) sobre un empleado, mostrado inline (R1-M05) | `totals` agregado sobre todos los empleados seleccionados, 6 tarjetas de estadística (R1-M05, ya corregido en esta sesión) |
| Etapa CONFIRM | `handleConfirm` → callback `onConfirmImport` (App.tsx) | `handleConfirmImport` (dentro del propio modal) — ambos solo escriben tras el clic explícito (R1-M06) |
| `imports.import_mode` | `'individual'` | `'team'` |
| `imports.employee_count` | Siempre 1 | N (uno por empleado con turnos nuevos) |
| Filas de `imports` creadas | Una por confirmación | Una por empleado con `newShifts.length > 0` (no una por archivo — cada empleado del roster genera su propio registro de historial) |
| Fingerprint de idempotencia | `file_fingerprint` + `context_fingerprint` a nivel de la importación completa | Mismo mecanismo, pero evaluado por-empleado dentro del bucle de confirmación |
| Detección de multiempleado | No aplica | `team-roster.ts`/`pdf-roster.ts`, cubierto por acceptance-corpus GS-01..10 |

### Cuándo el sistema decide "team" vs "individual"

La decisión no la toma el motor de ingestión (`analyzeDocumentFile` es el mismo para ambos) — la toma el **usuario**, al elegir qué modal abrir (botón "Importar" individual vs "Importar equipo"). `import-dispatcher.ts` enruta hacia el adaptador de roster correcto (`team-roster.ts`, `pdf-roster.ts`, o adaptadores tabulares) **dentro** del flujo de equipo una vez elegido — no decide entre individual/equipo, solo entre formatos dentro de equipo. No hay detección automática "este archivo parece de varios empleados, cambia de modal" — es una elección explícita previa del usuario.

## 4. Alcance IN
Documentar tabla de diferencias: qué usa cada modal, qué comparten, cuándo el sistema decide que un archivo es "team" vs "individual".

## 5. Alcance OUT
No se modifica la lógica de decisión individual vs team.

## 6. Dependencias
R1-M02, R1-M12.

## 7. Decisiones arquitectónicas
Ninguna nueva.

## 8. Modelo de datos afectado
`imports.import_mode` (`individual`/`team`) — solo verificación.

## 9. API / Backend
N/A — motivo: mismo endpoint de import subyacente, diferenciado por `import_mode`; sin cambios de contrato.

## 10. Frontend / UX
`ImportModal.tsx`, `TeamImportModal.tsx` — documentar diferencias de UX.

## 11. Seguridad y autorización
N/A — motivo: fuera de alcance, cubierto en otras microfases.

## 12. i18n
N/A — motivo: sin cambios de texto nuevos.

## 13. Accesibilidad
N/A — motivo: cubierto en R1-M14.

## 14. Responsive / temas
N/A — motivo: cubierto en R1-M14.

## 15. Observabilidad / errores
N/A — motivo: cubierto en R1-M12.

## 16. Migraciones
Ninguna.

## 17. Compatibilidad y datos existentes
N/A — motivo: verificación, sin cambios.

## 18. Tasks

### T01 — Documentar tabla de diferencias individual vs team
Objetivo: Redactar tabla comparativa (detección de roster, UI de selección de empleado, manejo de multi-empleado).
Archivos / módulos probables: `ImportModal.tsx`, `TeamImportModal.tsx`, `team-roster.ts`.
Cambios: Añadir tabla a este documento.
No hacer: No modificar código.
Criterios de aceptación:
- [x] Tabla de diferencias completa y verificada contra código (ver sección 3).
Tests: Ninguno.
Evidencia esperada: Tabla en este documento (sección 3).

## 19. Tests obligatorios
N/A — motivo: microfase puramente documental, sin cambios de código.

## 20. Evidencias
Este documento.

## 21. Gate
Gates obligatorios: G14 (Documentation).

## 22. Rollback / remediación
N/A — motivo: microfase documental, sin cambios de código.

## 23. Criterio de DONE
Diferencias entre importación individual y de equipo documentadas con precisión.
