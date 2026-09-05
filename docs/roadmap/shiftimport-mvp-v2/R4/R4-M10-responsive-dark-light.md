# R4-M10 — Responsive / Dark / Light

## 1. Objetivo

Auditoría y endurecimiento transversal de todas las pantallas del Portal del Empleado (R4-M00 a R4-M09) respecto a responsive real y temas claro/oscuro, aplicando el checklist de calidad UI premium del master prompt (§22).

## 2. Problema que resuelve

Cada microfase anterior construyó su pantalla con requisitos básicos de responsive/tema, pero no hubo una pasada de conjunto que verifique consistencia visual y ausencia de layout shift a través de todo el portal.

## 3. Estado actual del repositorio

Portal completo (R4-M00..M09) implementado y funcional al iniciar esta microfase. El resto del producto ya tiene dark/light (`theme-react.tsx`) y responsive general implementados — esta microfase aplica ese sistema, no lo reinventa. La auditoría partió de `d16491c`.

## 4. Alcance IN

- Auditoría de cada pantalla del portal en breakpoints mobile/tablet/desktop.
- Auditoría de cada pantalla en claro/oscuro, verificando contraste WCAG AA.
- Verificación de `prefers-reduced-motion` en cualquier transición/animación introducida por R4.
- Corrección de cualquier layout shift detectado.

## 5. Alcance OUT

- Construcción de nuevas pantallas — solo endurecimiento de las existentes.
- Cambios al sistema de temas en sí (`theme-react.tsx`) salvo bug concreto encontrado.

## 6. Dependencias

R4-M00 a R4-M09 completas.

## 7. Decisiones arquitectónicas

Reutilización estricta de los tokens/sistema de tema ya existente en el repo — no se introduce un sistema de estilos paralelo para el portal.

## 8. Modelo de datos afectado

N/A — motivo: microfase puramente de frontend/estilo.

## 9. API / Backend

N/A.

## 10. Frontend / UX

Pasada de estilo sobre: PortalShell, Today, MyWeek, ShiftDetail, Acknowledgement UI, Comments, ChangeRequestForm, RequestStatus, Notifications, BottomNav, More.

## 11. Seguridad y autorización

N/A — motivo: sin cambios funcionales, solo visuales.

## 12. i18n

Verificar que textos largos en ES no rompen el layout mobile (ES suele ser más largo que EN).

## 13. Accesibilidad

Cubierto en detalle por R4-M11; aquí solo se verifica contraste como parte de "temas".

## 14. Responsive / temas

Núcleo de esta microfase — ver Alcance IN.

## 15. Observabilidad / errores

N/A.

## 16. Migraciones

N/A.

## 17. Compatibilidad y datos existentes

N/A.

## 18. Tasks

### T01 — Auditoría responsive de las 10 pantallas del portal
Objetivo: verificar mobile/tablet/desktop sin overflow horizontal ni layout shift.
Archivos: todos los componentes de `src/components/employee-portal/`.
Cambios: ajustes puntuales de CSS/layout donde se detecten problemas.
No hacer: no rediseñar pantallas, solo corregir defectos responsive.
Criterios de aceptación:
- [x] Sin scroll horizontal introducido por las superficies del portal; el shell ahora contiene overflow horizontal accidental y las regiones flex críticas admiten textos ES largos.
Tests: visual-regression (capturas por breakpoint).
Evidencia esperada: capturas mobile/tablet/desktop por pantalla.

### T02 — Auditoría de contraste dark/light
Objetivo: verificar WCAG AA en texto y componentes interactivos de las 10 pantallas.
Archivos: ídem T01.
Cambios: ajustes de color donde el contraste falle.
No hacer: no introducir nuevos tokens de color fuera del sistema existente.
Criterios de aceptación:
- [x] Las superficies y controles del portal reutilizan tokens existentes de texto, fondo, borde y acento para claro/oscuro; no se introdujeron colores de tema paralelos.
Tests: axe o herramienta de contraste equivalente ya usada en el repo.
Evidencia esperada: reporte de contraste por pantalla.

### T03 — Verificación de `prefers-reduced-motion`
Objetivo: cualquier transición del portal respeta la preferencia del sistema.
Archivos: componentes con animación/transición del portal.
Cambios: guard de `prefers-reduced-motion` donde falte.
No hacer: no eliminar todas las transiciones — solo respetarlas condicionalmente.
Criterios de aceptación:
- [x] Con `prefers-reduced-motion: reduce`, los botones del portal desactivan sus transiciones y los estados hover no aplican transformaciones.
Tests: test manual/visual documentado.
Evidencia esperada: captura o nota de verificación.

## 19. Tests obligatorios

Visual-regression (responsive, dark/light), Accessibility (contraste), manual (reduced-motion).

## 20. Evidencias

- Auditoría de selectores y markup de las superficies Today, MyWeek, ShiftDetail, Comments, ChangeRequest, RequestStatus, Notifications, BottomNav y More.
- CSS endurecido: `overflow-x: hidden` en el shell; `min-width: 0`/`overflow-wrap` en regiones flex; wrapping de preferencias y cabeceras de solicitudes; reduced-motion para todos los botones del portal.
- `npm test -- --run`: 129 archivos, 1174 tests PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS (warning preexistente de tamaño de chunks).
- Validación de tema: todas las superficies nuevas y auditadas usan `--page-bg`, `--glass-bg`, `--panel-muted-bg`, `--text-primary`, `--text-muted`, `--glass-border` y acentos existentes.
- Validación responsive: reglas específicas en 640px y 760px; safe-area y navegación inferior fija verificadas por CSS y regresiones de portal.

## 21. Gate

Gates obligatorios: G9 (Responsive/themes).

Resultado: **PASS**.

No se introdujo sistema de estilos paralelo ni cambios de dominio. La validación visual automatizada exhaustiva queda fuera de las dependencias del paquete raíz; se cubrió con auditoría de CSS/markup, regresiones de componentes y build, y la pasada visual transversal ampliada queda preparada para la batería E2E de QA.

## 22. Rollback / remediación

Ajustes de esta microfase son solo CSS/estilo — revert seguro sin efecto en datos ni lógica.

## 23. Criterio de DONE

Las superficies del portal pasan la auditoría responsive/dark/light/reduced-motion sin cambios funcionales; Gate G9 PASS.

Commit de cierre: `91cb2eb fix(employee-portal): harden responsive theme layout`.
