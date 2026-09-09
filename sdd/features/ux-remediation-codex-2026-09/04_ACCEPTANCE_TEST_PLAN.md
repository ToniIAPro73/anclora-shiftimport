# UX Remediation Codex 2026-09 — Acceptance Test Plan

## Matriz de validación

Cada celda registra: `PASS` / `FAIL` / `NOT_EVALUATED` / `PARTIAL` + ID de evidencia. **`PARTIAL` es
un valor legítimo y debe declararse, no ocultarse.** Ninguna celda se marca `PASS` sin evidencia
adjunta (captura, resultado de test automatizado, o log de verificación manual).

### Dimensiones de la matriz

- **Viewports (8)**: 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, 1728×1117, 844×390.
- **Temas (2)**: claro, oscuro.
- **Locales (2)**: ES, EN — verificando `document.documentElement.lang`, no sólo el texto visible
  (ver `UXR-F1-M02`).
- **Roles (4)**: OWNER, ADMIN, PLANNER, EMPLOYEE (+ GUEST para flujos públicos/local-first).
- **Scopes**: ORGANIZATION, AREA, SELF.
- **Entornos**: `PRODUCTION`, `LOCAL_BUILD` y, como objetivo nuevo, `STAGING` / `PREVIEW`
  (`UXR-F4-M12`, `ENVIRONMENT_BLOCKED` es un resultado válido si no hay acceso sin desplegar).
- **Estados del importador**: vacío, parse en curso, formato desconocido, diagnóstico bloqueante,
  Ready con N filas, sólo históricos, históricos+futuros, error postcommit.
- **Estados de provisioning**: email nuevo sin external ID, existente con vínculo, existente sin
  vínculo, dos filas con el mismo ID nuevo, mezcla válidas+inválidas.

Todas las mediciones que impliquen overflow/scroll usan `hide-scrollbars=false` (`UXR-F0-M05`).
Todas las rutas de subida de fixture usan rutas absolutas (`UXR-F0-M06`).

## Qué celdas exige cada fase

### Fase 0 (harness)

No exige celdas de producto — exige que el harness pueda producir la matriz completa. Salida:
baseline de 8 viewports × 2 temas × 2 locales congelada (`UXR-F0-M08`), sin celdas de rol/estado
todavía (eso es contenido de Fase 1-4).

### Fase 1 (quick wins)

| Celda | Exigido por |
|---|---|
| CX-F03: preview con ≥4 filas × {1440×900, 390×844} × {claro, oscuro} | `UXR-F1-M01` |
| CX-F08: `lang` en ES/EN × {landing, `/app`} tras cambio ES→EN→ES + recarga | `UXR-F1-M02` |
| CX-F09: pricing × {ES, EN} × {1440×900, 390×844} × {claro, oscuro} | `UXR-F1-M03` |
| CX-E01: fixture de empleados cargada por UI real, entorno `LOCAL_BUILD` | `UXR-F1-M04` |

### Fase 2 (alto impacto)

| Celda | Exigido por |
|---|---|
| CX-F01: preview 5+ filas Ready × {390×844, 844×390, 768×1024} × {claro, oscuro} | `UXR-F2-M01`, `UXR-F2-M02` |
| CX-F04: badge temporal × {EMPLOYEE, ADMIN} × {históricos-only, históricos+futuros} × {ES, EN} | `UXR-F2-M03`, `UXR-F2-M04` |
| CX-F05: preview provisioning × {nuevo sin vínculo, existente con vínculo, existente sin vínculo, ID duplicado} | `UXR-F2-M05`, `UXR-F2-M06` |

### Fase 3 (estructura)

| Celda | Exigido por |
|---|---|
| CX-F02: `StatsBar` + tabla semanal × {390×844, 768×1024} × {claro, oscuro}, navegación por teclado | `UXR-F3-M01`, `UXR-F3-M02` |
| CX-F06: ciclo publicar→consultar→acuse × {OWNER/ADMIN/PLANNER publica, EMPLOYEE acusa} | `UXR-F3-M03`, `UXR-F3-M04` |
| CX-F07: descubrimiento de bulk desde Equipo + retorno con contexto conservado | `UXR-F3-M05`, `UXR-F3-M06` |

### Fase 4 (cierre de evidencia)

| Celda | Exigido por |
|---|---|
| Retest F2 (cuenta Personal, gate de segundo acceso) | `UXR-F4-M01` |
| Retest F9 (cuenta sin org, validación de nombre en onboarding) | `UXR-F4-M02` |
| Cierre F1 (persistencia postcommit real) | `UXR-F4-M03` |
| Cierre F5 (contrato documental) | `UXR-F4-M04` |
| Cierre F6 (verificación individual de editor/tabla/métricas) | `UXR-F4-M05` |
| Cierre F8 (comparación landing vs. resumen de import) | `UXR-F4-M06` |
| `OWNER_COVERED`/`PLANNER_COVERED` | `UXR-F4-M07` |
| `PUBLISH_COVERED`/`APPROVAL_COVERED` (ciclo completo) | `UXR-F4-M08` |
| `SAFE_DELETE_COVERED`/`IDEMPOTENCY_COVERED` | `UXR-F4-M09` |
| `TEAM_IMPORT_COVERED` | `UXR-F4-M10` |
| `CREDENTIAL_EXPORT_COVERED` | `UXR-F4-M11` |
| `STAGING_BROWSER_COVERED`/`PREVIEW_BROWSER_COVERED` | `UXR-F4-M12` |

## Procedimiento de evidencia

1. Cada microtarea, al implementarse, adjunta su evidencia en la ubicación que
   `05_PROGRESS_LOG.md` registre para ese día (no se define aquí una ruta fija de artefactos —
   corresponde a la implementación real, no a esta spec).
2. Toda automatización obligatoria por microtarea: `npm test` (suite completa, no sólo el fichero
   afectado, al cerrar cada fase), `npx tsc --noEmit`, `npm run lint` (`--max-warnings 0`),
   `npm run build`.
3. Ninguna microtarea se cierra sin al menos una de: captura de pantalla, log de test automatizado,
   o registro manual explícito con cuenta sintética usada.
4. Datos: siempre sintéticos, siempre aislados. Ninguna evidencia contiene PII real (heredado de
   `AGENTS.md` §Fixtures de tests siempre sintéticos).
5. Al cerrar una fase, el gate correspondiente (`docs/roadmap/UXR-F<n>-*-GATE.md`) se actualiza con
   la tabla de evidencia — nunca se marca `PASS` sin ella; si algo no se pudo verificar, se declara
   `NOT_EVALUATED` con motivo y el gate queda `PASS_WITH_GAPS`, nunca `PASS`.

## Regresión global (todas las fases)

Antes de declarar cualquier gate `PASS`/`PASS_WITH_GAPS`, la suite completa existente debe seguir
verde: `npm test`, `npm run lint`, `npm run build`. Ningún test se elimina ni se marca `.skip` nuevo
sin justificación documentada en `05_PROGRESS_LOG.md`.
