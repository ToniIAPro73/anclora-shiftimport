# R6 — Workflow Engine (POST-MVP, macro spec)

## Propósito y alcance

Generalizar R5 (Approval Lite, 3 políticas fijas, 1 paso de decisión) hacia un motor de workflow configurable con hasta 3 pasos secuenciales. Solo se aborda después de validar el MVP en piloto — el riesgo de construir un motor genérico antes de tener evidencia real de qué políticas necesitan las organizaciones piloto es exactamente lo que el master prompt busca evitar (§1, "menos alcance + más calidad").

## Por qué es post-MVP

R5 ya cubre el caso de gobernanza mínimo viable (NO_APPROVAL / AREA_RESPONSIBLE / ORGANIZATION_ADMIN, un solo paso). Un motor de workflow completo introduce complejidad de configuración, UI de editor visual, y superficie de testing mucho mayor sin evidencia todavía de que un piloto lo necesite. Construirlo antes sería exactamente el "Workflow Builder genérico" que R5-M01 explícitamente descarta.

## Modelo de dominio sketch

```text
Workflow          — definición reutilizable de una secuencia de hasta 3 pasos
WorkflowVersion    — versión inmutable de un Workflow (análogo a ScheduleVersion de R3)
WorkflowRun        — instancia de ejecución de un WorkflowVersion sobre un evento concreto (p. ej. un Change Request)
WorkflowStepRun     — ejecución de un paso individual dentro de un WorkflowRun (estado, decisor, resultado)
```

## Relación con la base MVP

- `WorkflowRun` sustituiría o envolvería a `approval_requests` (R5-M02) como el mecanismo genérico de ruteo — la migración de R5 a R6 requeriría decidir si `approval_requests` se deprecia en favor de `WorkflowRun` de un solo paso, o coexisten.
- Reutilizaría el mecanismo de auditoría de R2-M09 (mismo patrón que R5-M06).
- Los "pasos" de un Workflow serían, inicialmente, un superconjunto de las 3 políticas fijas de R5-M01 (no builder totalmente libre desde el día uno — evolución incremental).

## Preguntas abiertas / riesgos

- ¿Necesita un editor visual, o basta con configuración estructurada (JSON/formulario) para los primeros pilotos que pidan más de 1 paso?
- ¿Cómo se migran las `approval_requests` existentes de organizaciones que ya usan R5 sin romper su historial de auditoría?
- Límite de 3 pasos es una decisión deliberada de scope — revisar si la demanda real de piloto lo confirma o lo contradice antes de implementar.
