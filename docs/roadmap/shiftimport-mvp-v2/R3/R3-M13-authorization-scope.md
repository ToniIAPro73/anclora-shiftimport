# R3-M13 — Authorization / Scope

## 1. Objetivo
Auditoría dedicada y hardening de la capa de autorización de todos los endpoints de Scheduling (R3-M04 a R3-M12) contra el modelo de roles/scopes de R2-M06/M07.

## 2. Problema que resuelve
Cada microfase anterior implementó su propio guard puntual; esta microfase verifica de forma centralizada y con tests cruzados que no hay huecos (p.ej. un PLANNER de un área accediendo a otra área, un EMPLOYEE accediendo a endpoints de escritura).

## 3. Estado actual del repositorio
MISSING como auditoría formal — los guards individuales se construyeron incrementalmente en R3-M04..M12.

## 4. Alcance IN
- Matriz de permisos: {OWNER, ADMIN, PLANNER, EMPLOYEE} × {crear draft, editar assignment, publicar, ver historial, ver assignments propios} × {ORGANIZATION, AREA, SELF}.
- Test de integración cruzado cubriendo cada celda de la matriz contra los endpoints reales.
- Verificación de que ningún endpoint depende solo de una comprobación de frontend.

## 5. Alcance OUT
Nuevos roles o scopes — usa exactamente los definidos en R0-M03/R2-M06/M07.

## 6. Dependencias
R2-M08 (API Authorization Enforcement), R3-M04..M12 (todos los endpoints ya existen).

## 7. Decisiones arquitectónicas
Ninguna nueva — esta microfase es de verificación, no de diseño. Si la auditoría encuentra un hueco, el fix se aplica en la microfase original (R3-M04..M12) y se referencia desde aquí, no se parchea aquí directamente, para mantener trazabilidad.

## 8. Modelo de datos afectado
N/A.

## 9. API / Backend
N/A — auditoría de los endpoints existentes, sin endpoints nuevos.

## 10. Frontend / UX
N/A.

## 11. Seguridad y autorización
Núcleo de esta microfase — ver Alcance IN.

## 12. i18n
N/A.

## 13. Accesibilidad
N/A.

## 14. Responsive / temas
N/A.

## 15. Observabilidad / errores
Verificar que 403 vs 404 se usan consistentemente (no filtrar existencia de recursos de otra organización vía 404 vs 403 — evitar enumeración cross-tenant).

## 16. Migraciones
N/A.

## 17. Compatibilidad y datos existentes
N/A.

## 18. Tasks

### T01 — Matriz de permisos documentada
Objetivo: tabla completa rol × acción × scope para Scheduling.
Archivos / módulos probables: este documento (sección 20) o `docs/product/SCHEDULING_DOMAIN.md`.
Cambios: documentación.
No hacer: N/A.
Criterios de aceptación:
- [ ] Matriz completa, sin celdas ambiguas.
Tests: N/A.
Evidencia esperada: matriz commiteada.

### T02 — Test de integración cruzado
Objetivo: cubrir cada celda de la matriz contra los endpoints reales.
Archivos / módulos probables: nuevo archivo de test de integración dedicado a Scheduling authorization.
Cambios: suite de tests nueva.
No hacer: no debilitar guards existentes para que el test "pase".
Criterios de aceptación:
- [ ] Todas las combinaciones no permitidas devuelven 403/404 apropiado, no 500 ni un 200 accidental.
- [ ] Cross-tenant: un PLANNER de la organización A no puede leer/editar schedules de la organización B.
Tests: la suite es el entregable.
Evidencia esperada: resultados de test adjuntos, 100% de la matriz cubierta.

## 19. Tests obligatorios
`API`, `integration`, `security`.

## 20. Evidencias
Matriz documentada, suite de test en PASS con cobertura completa de la matriz.

## 21. Gate
Gates requeridos: **G4**, **G12** (Security).

## 22. Rollback / remediación
Cualquier hueco encontrado es FAIL inmediato — no PASS_WITH_WARNINGS en autorización cross-tenant (riesgo de seguridad real, §9 del prompt maestro).

## 23. Criterio de DONE
Matriz completa, suite de test cubriendo 100% de combinaciones, cero huecos encontrados o todos corregidos con re-verificación, Gate G4+G12 PASS.
