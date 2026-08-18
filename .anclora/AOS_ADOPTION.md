# AOS Adoption Declaration

Declaración de adopción AOS para `anclora-shiftimport`.

## Metadatos

- Repository Name: anclora-shiftimport
- Repository Owner: ToniIAPro73
- Adoption Status: adopted
- AOS Version: 0.2.0
- Adoption Date: 2026-08-18
- Last Reviewed: 2026-08-18
- Governance Level: Level 3 (autoridad local de producto)

## Propósito del repositorio

Anclora ShiftImport: importador inteligente de cuadrantes para trabajadores por turnos (producto Premium B2C/prosumer). Convierte cuadrantes en PDF, imagen o formatos compatibles en un calendario personal estructurado, revisable y exportable. Derivado comercial de `anclora-groundsync` con historia Git preservada; GroundSync permanece operativo como producto independiente.

## Fuentes AOS referenciadas

- Constitution: `../anclora-governance/constitution/`
- MASTER_DECISIONS: `../anclora-governance/knowledge/MASTER_DECISIONS.md`
- CURRENT_STATE: `../anclora-governance/knowledge/CURRENT_STATE.md`
- SOURCE_OF_TRUTH_REGISTRY: `../anclora-governance/knowledge/SOURCE_OF_TRUTH_REGISTRY.md`
- Standards: `../anclora-governance/standards/`
- Playbooks: `../anclora-governance/playbooks/`
- Templates: `../anclora-governance/templates/`
- Operational Registry delegado (Bóveda): `../anclora-vault/00-governance/` (censo `registry/ecosystem-repos.json`, contratos `contracts/`)

## Fuentes oficiales locales

| Tipo de conocimiento | Ruta local | Owner | Relación con AOS |
| --- | --- | --- | --- |
| Identidad y guía de agente | `AGENTS.md` | ShiftImport | Local, subordinada |
| Specs de producto (SDD) | `sdd/` | ShiftImport | PD local |
| Copias de contratos de marca | `docs/standards/` | Vault (canónico) | Copia local de referencia; el canónico vive en la vault |

## Política de decisiones locales

Decisiones de producto (PD) se registran en `sdd/`. ED → AOS `MASTER_DECISIONS`; OD → mecanismo CHG de la vault (`00-governance/decisions/`); EX → esta declaración. Una decisión, una fuente canónica.

## Excepciones y desviaciones

| ID | Regla/autoridad afectada | Razón | Owner | Status | Created | Review date o trigger | Condición de resolución |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EX-SI-001 | Contrato de ramas (default `main`) | Decisión de producto: default branch `development`; modelo development/staging/production/main desde genesis | ToniIAPro73 | ACCEPTED | 2026-08-18 | Revisar al cerrar Phase 1 | Decisión humana de promoción de modelo |

## Política de upgrade AOS

Revisar nuevas versiones de AOS al inicio de cada fase de producto (Phase 1, Phase 2, …) o cuando lo indique `CURRENT_STATE.md`.

## Historial de adopción

| Fecha | AOS Version | Cambio | Owner |
| --- | --- | --- | --- |
| 2026-08-18 | 0.2.0 | Adopción inicial en Commercial Genesis | ToniIAPro73 |

## Documentos relacionados

- `README.md`
- `sdd/`
- Dossier canónico: `../anclora-vault/20-products/shiftimport/dossier.md`
