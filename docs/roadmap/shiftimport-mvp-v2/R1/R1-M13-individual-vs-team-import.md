# R1-M13 — Individual vs Team Import

## 1. Objetivo
Documentar y verificar las diferencias de contrato entre importación individual y de equipo.

## 2. Problema que resuelve
Ambos flujos comparten motor de ingestión pero difieren en UX y en resolución de empleados (uno vs varios); es necesario un contrato claro de qué es común y qué diverge.

## 3. Estado actual del repositorio
STATUS: DONE. `ImportModal.tsx` (individual) y `TeamImportModal.tsx` (equipo) comparten pipeline de diagnóstico (desde fb471bd) pero difieren en detección de roster (`team-roster.ts` solo aplica a team).

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
- [ ] Tabla de diferencias completa y verificada contra código.
Tests: Ninguno.
Evidencia esperada: Tabla en este documento.

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
