# R3-M00 — Scheduling Domain Baseline

STATUS: DONE — PASS

## 1. Objetivo

Fijar el vocabulario, los límites y las decisiones arquitectónicas del dominio de planificación futura (Scheduling) antes de tocar esquema o código, para que R3-M01..M16 se construyan sobre una base común y no se reinterprete el modelo microfase a microfase.

## 2. Problema que resuelve

Anclora ShiftImport hoy solo conoce turnos ya ocurridos (importados desde histórico). No existe ningún concepto de "planificación futura publicable". Sin una baseline de dominio, cada microfase de R3 tendría que redescubrir qué es un draft, qué es publicar, y cómo se relaciona con `shifts` — con alto riesgo de contradicciones entre microfases.

## 3. Estado actual del repositorio

MISSING en su totalidad. `git grep -i schedule` no devuelve resultados de dominio (0 hits de negocio). La tabla `shifts` (migración 0001, extendida en 0008/0011) solo representa turnos con `origin` de importación o manual, sin versión, sin estado de publicación, sin distinción pasado/futuro. No existe `src/components/scheduling/` ni `api/schedules/`.

## 4. Alcance IN

- Definir las tres entidades: `Schedule`, `ScheduleVersion`, `ShiftAssignment` (nombres, propósito, relación).
- Definir el ciclo de vida `DRAFT → PUBLISHED → LOCKED → COMPLETED` como propiedad de `ScheduleVersion`, no de `Schedule` ni de `ShiftAssignment` individual.
- Definir la relación entre `ShiftAssignment` (planificación futura) y `shifts` (turno real, ya sea importado o materializado desde una versión publicada).
- Decidir explícitamente si `shifts` se reutiliza como destino final al publicar, o si `ShiftAssignment` es una tabla separada que coexiste (ver sección 7).
- Fijar el glosario ES/EN de estos términos para uso consistente en UI y specs posteriores.

## 5. Alcance OUT

- Cualquier tabla, endpoint o componente de UI (eso es R3-M01 en adelante).
- Reglas de solapamiento/descanso (R3-M06/M07).
- Motor de reglas configurable (post-MVP, prohibido por §32 del prompt maestro).

## 6. Dependencias

- R0-M07 (R0 Final Gate) — el modelo de roles/scopes y el glosario de dominio general deben estar cerrados.
- R2-M06/R2-M07 (roles OWNER/ADMIN/PLANNER/EMPLOYEE + scopes) — Scheduling asume que PLANNER existe.

## 7. Decisiones arquitectónicas

- **Schedule** es el contenedor lógico por organización + área (o global si `area_id IS NULL`) + periodo (semana). No tiene estado propio.
- **ScheduleVersion** es la unidad versionada: cada edición de un draft es la misma versión hasta publicar; publicar congela la versión y cualquier nueva edición crea una versión siguiente (ver R3-M11).
- **ShiftAssignment** vive dentro de una `ScheduleVersion` y representa "empleado X trabaja turno Y en fecha Z" mientras la versión no está publicada. Al publicar, cada `ShiftAssignment` de la versión activa se materializa como una fila en `shifts` con `origin = 'schedule'` y una referencia a la versión de origen (`schedule_version_id`), reutilizando la tabla `shifts` existente en lugar de duplicar el modelo de turno. Esto evita bifurcar la fuente de verdad de "qué turno tiene un empleado" entre dos tablas.
- `ShiftAssignment` NO se borra al publicar; queda como registro histórico de la versión (auditoría de qué se planificó).
- Justificación de reutilizar `shifts` en vez de crear una tabla `published_shifts` paralela: el dashboard, el import history y todo el código de lectura de turnos ya asume `shifts` como fuente única; duplicar el modelo obligaría a fusionar dos fuentes en cada consulta (violación de §7 del prompt: "no diseñar para hipotéticos", y aquí el hipotético de tener dos tablas de turno no aporta valor).

## 8. Modelo de datos afectado

N/A en esta microfase — solo diseño conceptual, sin migraciones. El detalle de columnas se define en R3-M01/M02/M03.

## 9. API / Backend

N/A — sin endpoints en esta microfase.

## 10. Frontend / UX

N/A — sin UI en esta microfase.

## 11. Seguridad y autorización

N/A en detalle — se fija el principio general: solo PLANNER (scope ORGANIZATION o AREA según a qué área pertenezca el Schedule) puede crear/editar/publicar; EMPLOYEE solo lee sus propios `ShiftAssignment`/`shifts` publicados (scope SELF). Detalle en R3-M13.

## 12. i18n

Glosario ES/EN a fijar en esta microfase (ver Tasks) para reutilizar en toda la UI de R3/R4: Draft/Borrador, Published/Publicado, Locked/Bloqueado, Completed/Completado, Assignment/Asignación.

## 13. Accesibilidad

N/A — sin UI aún.

## 14. Responsive / temas

N/A — sin UI aún.

## 15. Observabilidad / errores

N/A — sin código aún.

## 16. Migraciones

N/A — sin migraciones en esta microfase.

## 17. Compatibilidad y datos existentes

La reutilización de `shifts` como destino de publicación debe ser 100% compatible con los turnos ya importados (origin actuales: import/manual). El nuevo `origin = 'schedule'` es aditivo, no reemplaza los existentes.

## 18. Tasks

### T01 — Documento de dominio Scheduling

Objetivo:
Redactar `docs/product/SCHEDULING_DOMAIN.md` con las definiciones de Schedule/ScheduleVersion/ShiftAssignment, el diagrama de relación con `shifts`, y el glosario ES/EN.

Archivos / módulos probables:
- `docs/product/SCHEDULING_DOMAIN.md` (nuevo)

Cambios:
- Documento nuevo, sin tocar código.

No hacer:
- No crear migraciones ni endpoints todavía.

Criterios de aceptación:
- [ ] Documento define las 3 entidades y su relación con `shifts`.
- [ ] Glosario ES/EN completo.
- [ ] Decisión de reutilizar `shifts` al publicar, justificada por escrito.

Tests:
- N/A — documentación.

Evidencia esperada:
- Ruta del documento commiteado.

### T02 — Diagrama de estados de ScheduleVersion

Objetivo:
Diagrama textual (mermaid o ASCII) del ciclo DRAFT → PUBLISHED → LOCKED → COMPLETED, con las transiciones permitidas y quién las dispara.

Archivos / módulos probables:
- `docs/product/SCHEDULING_DOMAIN.md` (misma sección o anexo)

Cambios:
- Añadir diagrama y tabla de transiciones válidas.

No hacer:
- No mezclar este diagrama con el de Acknowledgement o Change Request (son máquinas de estado independientes, §17 del prompt maestro).

Criterios de aceptación:
- [ ] Todas las transiciones tienen actor y precondición documentados.
- [ ] Queda explícito que LOCKED/COMPLETED no se implementan operativamente hasta que exista necesidad real (evitar over-engineering, pero el estado debe existir en el enum para no romper el esquema después).

Tests:
- N/A — documentación.

Evidencia esperada:
- Diagrama visible en el documento.

### T03 — Revisión de dependencias con R0-M05 y R2-M06/M07

Objetivo:
Confirmar por escrito que R0-M05 (routing) y R2-M06/M07 (roles/scopes) están en estado PASS antes de permitir inicio de R3-M01.

Archivos / módulos probables:
- `docs/roadmap/shiftimport-mvp-v2/R3/R3-M00-scheduling-domain-baseline.md` (este archivo, sección de evidencia)

Cambios:
- Registrar el Gate SHA/estado de R0-M05 y R2-M06/M07 en la sección 20.

No hacer:
- No avanzar si alguna dependencia está BLOCKED o FAIL.

Criterios de aceptación:
- [ ] R0-M05 confirmado PASS con commit SHA registrado.
- [ ] R2-M06/M07 confirmados PASS con commit SHA registrado.

Tests:
- N/A.

Evidencia esperada:
- SHAs de los commits de Gate PASS referenciados.

## 19. Tests obligatorios

N/A — microfase puramente documental, sin código.

## 20. Evidencias

- `docs/product/SCHEDULING_DOMAIN.md` commiteado.
- R0-M05: PASS, commit `e3753c3` (decisión de extender `src/lib/route.ts`).
- R2-M06: PASS, commit `b8754f3` (OWNER/ADMIN/PLANNER/EMPLOYEE).
- R2-M07: PASS, commit `c318dd2` (ORGANIZATION/AREA/SELF).
- R2-M12: PASS, commit `974fe68` (Gate final de R2 y regresión cross-tenant).
- Verificación de consistencia: el documento mantiene `Schedule` sin estado propio, `ScheduleVersion` como máquina de estados y `ShiftAssignment` separado de `shifts`; no introduce tablas, endpoints ni UI.

## 21. Gate

Gates requeridos: **G1** (Architecture), **G3** (Domain invariants).

- G1: el documento de dominio existe y no contradice el modelo de datos ya planeado en R3-M01/02/03.
- G3: las tres máquinas de estado (Shift lifecycle, Acknowledgement, Change Request) están explícitamente separadas, sin conflación.

Resultado: PASS / PASS_WITH_WARNINGS / FAIL / BLOCKED (§9 del prompt maestro).

Resultado ejecutado: **PASS**.

- G1 Architecture: PASS — contrato de dominio y decisión de reutilizar `shifts` documentados; el detalle físico queda reservado a R3-M01/M02/M03.
- G3 Domain invariants: PASS — ciclo de `ScheduleVersion` separado de Acknowledgement y Change Request; no existe transición de retroceso ni `CHANGE_REQUESTED` como estado de turno.

## 22. Rollback / remediación

Si el Gate falla, no hay código que revertir — se corrige el documento y se repite el Gate. Si la causa es una dependencia (R0-M05 o R2-M06/07) no cerrada, el resultado es BLOCKED, no FAIL.

## 23. Criterio de DONE

`docs/product/SCHEDULING_DOMAIN.md` commiteado, Gate G1+G3 en PASS, dependencias R0-M05/R2-M06/M07 confirmadas PASS con SHA registrado. Commit: `pending`.
