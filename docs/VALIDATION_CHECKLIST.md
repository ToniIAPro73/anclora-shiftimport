# Checklist de validación — adopción AOS canónica de ShiftImport (2026-10-30)

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development
**Alcance:** solo capa contractual/bootstrap (D-2026-0042). Sin cambios de código de negocio; los cambios UX previos (modal/Toast) siguen sin commit y pendientes de QA visual en otra misión.

## Validación contractual
| Comprobación | Resultado |
| --- | --- |
| `runtime_semantics.py` sobre `.anclora/PRODUCTION_RUNTIME.md` (§0: ejecución LOCAL, Neon Production `main`, credenciales `VERCEL_PROJECT_ENV` con scope `development`, QA Mirror, fuente solo lectura, Preview no requerido, Docker fallback) | PASS |
| Enlaces internos de los `.md` modificados | PASS |
| `git diff --check` | PASS |

## NOT_RUN
QA funcional, E2E y QA visual: fuera de alcance de esta entrega.
