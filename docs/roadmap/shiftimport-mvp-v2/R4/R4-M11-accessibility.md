# R4-M11 — Accessibility

## 1. Objetivo

Auditoría y endurecimiento de accesibilidad (WCAG 2.2 AA) transversal a todas las pantallas del Portal del Empleado, complementando R4-M10.

## 2. Problema que resuelve

Cada microfase individual aplicó requisitos básicos de accesibilidad; esta microfase hace una pasada de conjunto dedicada, con herramientas automatizadas y verificación manual de teclado/lector de pantalla.

## 3. Estado actual del repositorio

Portal completo (R4-M00..M10) al iniciar. El resto del producto no tiene una auditoría de accesibilidad formal documentada más allá de las capturas de `qa/` — esta microfase establece el patrón para el portal.

## 4. Alcance IN

- Auditoría automatizada (axe o equivalente ya usado en `qa/`) de las 10 pantallas del portal.
- Verificación manual de navegación completa por teclado (sin mouse) en el flujo Today → Shift Detail → Acknowledge/Comment/Change Request → Solicitudes.
- Verificación de foco visible en todos los elementos interactivos.
- Verificación de anuncios de lector de pantalla para acciones asíncronas (reconocer turno, enviar comentario, crear solicitud).

## 5. Alcance OUT

Auditoría de accesibilidad del dashboard ADMIN existente (fuera de alcance de R4, es producto ya en producción no tocado por esta release).

## 6. Dependencias

R4-M00 a R4-M10 completas.

## 7. Decisiones arquitectónicas

N/A — motivo: microfase de auditoría/corrección, no de diseño nuevo.

## 8. Modelo de datos afectado

N/A.

## 9. API / Backend

N/A.

## 10. Frontend / UX

Correcciones puntuales de markup semántico, roles ARIA, orden de foco donde la auditoría detecte fallos.

## 11. Seguridad y autorización

N/A.

## 12. i18n

N/A — motivo: cubierto en R4-M10 y en cada microfase individual.

## 13. Accesibilidad

Núcleo de esta microfase — ver Alcance IN.

## 14. Responsive / temas

N/A — motivo: cubierto en R4-M10.

## 15. Observabilidad / errores

N/A.

## 16. Migraciones

N/A.

## 17. Compatibilidad y datos existentes

N/A.

## 18. Tasks

### T01 — Auditoría automatizada axe de las 10 pantallas
Objetivo: cero violaciones críticas/serias de axe.
Archivos: todos los componentes de `src/components/employee-portal/`.
Cambios: correcciones de markup donde axe reporte violaciones.
No hacer: no silenciar reglas de axe sin justificación documentada.
Criterios de aceptación:
- [ ] Cero violaciones críticas/serias reportadas.
Tests: axe automatizado por pantalla.
Evidencia esperada: reporte axe antes/después por pantalla.

### T02 — Navegación completa por teclado del flujo principal
Objetivo: completar Today→Detail→Acknowledge/Comment/Change Request→Solicitudes sin mouse.
Archivos: componentes del flujo.
Cambios: `tabindex`/orden de foco donde falle.
No hacer: no usar `tabindex` positivo (mantener orden natural del DOM).
Criterios de aceptación:
- [ ] Flujo completo navegable solo con teclado.
Tests: verificación manual documentada.
Evidencia esperada: nota/checklist de verificación paso a paso.

### T03 — Anuncios de lector de pantalla para acciones asíncronas
Objetivo: reconocer/comentar/solicitar cambio anuncian resultado (éxito/error) vía `aria-live` o equivalente.
Archivos: componentes de acción del portal.
Cambios: región `aria-live` para feedback de acciones.
No hacer: no usar `aria-live="assertive"` de forma indiscriminada (preferir `polite` salvo error crítico).
Criterios de aceptación:
- [ ] Acción exitosa/fallida anunciada sin depender solo de cambio visual.
Tests: verificación manual con lector de pantalla.
Evidencia esperada: nota de verificación.

## 19. Tests obligatorios

Accessibility automatizada (axe), manual (teclado, lector de pantalla).

## 20. Evidencias

Reportes axe por pantalla, notas de verificación manual.

## 21. Gate

Gates obligatorios: G7 (Accessibility).

## 22. Rollback / remediación

Correcciones son de markup/atributos — revert seguro sin efecto en datos ni lógica de negocio.

## 23. Criterio de DONE

Las 10 pantallas del portal pasan auditoría axe sin violaciones críticas/serias; flujo principal completable por teclado; Gate G7 PASS.
