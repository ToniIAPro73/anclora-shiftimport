# Checklist de validación — reemplazo de turnos en publicación de planificación

**Alcance:** al publicar una nueva versión de un schedule, los turnos efectivos materializados desde versiones anteriores de ese mismo schedule pasan a `SUPERSEDED`. La nueva versión se materializa como efectiva, incluidos turnos que coincidan exactamente con los anteriores. No se tocan otros schedules ni filas que no provengan de versiones del schedule publicado. No requiere migración de esquema.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| `npx vitest run api/schedules/publish.test.js` | PASS — 6 tests |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — aviso preexistente de chunks grandes |
| `git diff --check` | PASS |

## Verificación visual

No aplica: corrección del backend de publicación de planificación.

## Promoción

No solicitada en este cambio. Push a `development` según el contrato del repositorio.
