# Checklist de validación — sincronización de contratos canónicos (2026-10-30)

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development
**Datos:** no se usaron ni modificaron datos de aplicación.

## 1. Qué cambia
- 10 copias locales de contratos AOS se refrescan desde Vault (retiran referencias a repositorios retirados e históricos). Solo ficheros de contratos.

## 2. Ya comprobado por el agente
| Comprobación | Resultado |
| --- | --- |
| `aos-propagate-contracts` (solo copias existentes), diff limitado a `docs/standards`/`sdd/contracts` | PASS |

## 3. NOT_RUN
Tests, lint, build y E2E de la aplicación: el diff es solo documentación contractual.

## 4. Para Toni
Sin pasos manuales. Bloqueante: no.
