# R0-M02 — Domain Glossary & Boundaries

## 1. Objetivo

Formalizar en un documento único el vocabulario de dominio (Organization, Employee, Area, Import, Shift, Membership, Format Profile) y sus límites, para que R1–R5 usen términos consistentes y no reinventen conceptos ya existentes en el código.

## 2. Problema que resuelve

El vocabulario existe de forma implícita en el código (nombres de tablas, campos, componentes) pero no está documentado en un glosario canónico. Sin esto, specs futuras (especialmente R2 Organization Foundation y R3 Scheduling) corren riesgo de introducir sinónimos o conceptos solapados (p.ej. "Team" vs "Area" vs futuro "WorkCenter").

## 3. Estado actual del repositorio

Vocabulario disperso pero consistente en: `db/migrations/*.sql` (nombres de tabla/columna), `api/_lib/data.js` (funciones de acceso), `src/ingestion/*` (Import, Format Profile, structureHash), `src/components/shift-dashboard/*` (Shift, Employee). No existe glosario centralizado.

## 4. Alcance IN

- Definir entidades núcleo: Organization, Membership, Employee, Area, Import, Shift, Format Profile — con su tabla DB correspondiente y su significado de negocio.
- Definir límites explícitos: qué es y qué NO es un Area (no es Team, no es WorkCenter — eso es R9 post-MVP); qué es y qué NO es un Import (no es un Schedule — eso es R3).
- Documentar los estados de `employees.status` (`pending_access`, `active`, `inactive`) y su significado operativo.
- Documentar los estados de `imports.status` (`pending`, `completed`, `failed`) y de `format_profiles.status` (`candidate`, `validated`, `verified`, `legacy`, `deprecated`).
- Fijar terminología ES/EN paralela para uso en specs futuras (p.ej. "Area" = "Área", no "Zona"/"Departamento").

## 5. Alcance OUT

- No introducir entidades nuevas (Schedule, WorkCenter, Team) — solo documentar lo existente. Entidades futuras se glosan en sus propias microfases (R3-M00, R9).
- No modificar código ni esquema.

## 6. Dependencias

R0-M00.

## 7. Decisiones arquitectónicas

El glosario es la fuente de verdad terminológica para todas las specs posteriores; en caso de conflicto entre una spec futura y el glosario, el glosario gana salvo revisión explícita documentada.

## 8. Modelo de datos afectado

N/A — motivo: documenta el modelo existente (ver `../00-BASELINE.md` sección "Modelo DB"), no lo modifica.

## 9. API / Backend

N/A — motivo: solo documentación de vocabulario.

## 10. Frontend / UX

N/A — motivo: solo documentación de vocabulario.

## 11. Seguridad y autorización

N/A — motivo: no aplica.

## 12. i18n

Glosario debe incluir tabla de términos EN↔ES para uso consistente en specs y en `src/lib/i18n*`.

## 13. Accesibilidad

N/A — motivo: no aplica a documento de glosario.

## 14. Responsive / temas

N/A — motivo: no aplica.

## 15. Observabilidad / errores

N/A — motivo: no aplica.

## 16. Migraciones

N/A — motivo: ninguna.

## 17. Compatibilidad y datos existentes

N/A — motivo: documental.

## 18. Tasks

### T01 — Extraer vocabulario de las migraciones y `data.js`

Objetivo: Listar cada tabla, columna con enum/estado, y su significado inferido del código.

Archivos / módulos probables: `db/migrations/*.sql`, `api/_lib/data.js`.

Cambios: Ninguno en código — genera insumo para el glosario.

No hacer: No renombrar nada en código.

Criterios de aceptación:
- [ ] Tabla completa de entidades y estados extraída.

Tests: N/A.

Evidencia esperada: Tabla de entidades en el documento final.

### T02 — Redactar glosario `DOMAIN-GLOSSARY.md`

Objetivo: Producir el documento canónico de vocabulario.

Archivos / módulos probables: `docs/roadmap/shiftimport-mvp-v2/R0/DOMAIN-GLOSSARY.md` (o ubicación equivalente en `docs/product/`).

Cambios: Nuevo documento.

No hacer: No definir entidades que no existen aún en el código (Schedule, WorkCenter) como si fueran presentes — marcarlas como "futuro (R3/R9)".

Criterios de aceptación:
- [ ] Cada entidad núcleo definida con su tabla DB, estados válidos y límites (qué no es).
- [ ] Tabla de términos EN↔ES.

Tests: N/A.

Evidencia esperada: `DOMAIN-GLOSSARY.md` creado.

### T03 — Validar contra specs R1/R2 ya esbozadas en `00-ROADMAP-MASTER.md`

Objetivo: Confirmar que el vocabulario del glosario es compatible con los nombres usados en la tabla de roadmap.

Archivos / módulos probables: `../00-ROADMAP-MASTER.md`.

Cambios: Ajustes de redacción si hay discrepancia de términos.

No hacer: No reescribir el roadmap master en esta microfase salvo corrección terminológica puntual.

Criterios de aceptación:
- [ ] Sin discrepancias de término entre glosario y roadmap master.

Tests: N/A.

Evidencia esperada: Confirmación en resumen de microfase.

### T04 — Revisión final de límites de dominio

Objetivo: Confirmar explícitamente los límites Area≠Team≠WorkCenter e Import≠Schedule quedan documentados sin ambigüedad.

Archivos / módulos probables: `DOMAIN-GLOSSARY.md`.

Cambios: Sección explícita "Límites y no-conceptos".

No hacer: No dejar ambigüedad sin resolver.

Criterios de aceptación:
- [ ] Sección "qué NO es" presente para Area e Import como mínimo.

Tests: N/A.

Evidencia esperada: Sección visible en el documento.

## 19. Tests obligatorios

N/A — motivo: documento de glosario, sin código ejecutable.

## 20. Evidencias

`DOMAIN-GLOSSARY.md` (nuevo documento).

## 21. Gate

Gates requeridos: **G0**, **G14 (Documentation)**.

- G0: PASS si no hay cambios de código, solo el nuevo documento.
- G14: PASS si el glosario cubre todas las entidades núcleo listadas en Alcance IN con estados y límites.

## 22. Rollback / remediación

Si falta cobertura de alguna entidad: completar el documento y re-ejecutar Gate. No hay riesgo — es aditivo.

## 23. Criterio de DONE

`DOMAIN-GLOSSARY.md` existe, cubre las 7 entidades núcleo con estados y límites, incluye tabla EN↔ES, y es consistente con `00-ROADMAP-MASTER.md`.
