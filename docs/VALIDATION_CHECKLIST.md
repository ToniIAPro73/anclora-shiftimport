# Checklist de validación — superficie del Toast en modo oscuro (2026-10-30)

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development
**Entorno de validación:** ejecución LOCAL (`npm run dev`) contra Neon Production `main`; QA solo en `ShiftImport — QA Mirror` con `qa.shiftimport@anclora.test`.
**Datos:** turnos de prueba en el QA Mirror (días pasados aleatorios); 0 escrituras en la organización `ShiftImport`.

## 1. Qué cambia
- `src/index.css`: en modo oscuro, el fondo de `.ac-toast` usa las superficies del tema sin alfa (mismo degradado). El fondo canónico del Design System (alfa 0.92→0.88, sin desenfoque) dejaba ver los controles de la cabecera a través del Toast. El modo claro conserva la superficie canónica.
- Sin cambios de posición, tamaño, ciclo de vida, accesibilidad, layout, traducciones ni lógica. El Design System no se toca (dependencia compartida).

## 2. Ya comprobado por el agente
| Comprobación | Resultado |
| --- | --- |
| Toast "turno guardado" y "ya importado" (mismo componente canónico, tono `review`), claro y oscuro: estilos computados antes/después | claro idéntico campo a campo; oscuro solo cambia el fondo (sólido) |
| Captura visual de los 4 casos | PASS |
| Test focal `App.transient-feedback` | PASS |
| `git diff --check` | PASS |

## 3. NOT_RUN
Suite completa, E2E ajenos y auditoría visual general: fuera de alcance. Lint/typecheck: el cambio es solo CSS.

## 4. Para Toni
Revisar el Toast en oscuro en tu navegador. Bloqueante: no.
