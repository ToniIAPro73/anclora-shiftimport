# Checklist de validación — Accesibilidad del botón de detalle de día en MonthGrid (2026-11-08)

> Este fichero se sobrescribe en cada entrega. El historial queda en Git (la entrega anterior, rebaseline G6, consta en `fc94880` y anteriores).

**Repositorio:** anclora-shiftimport
**Rama:** development
**Cambio actual:** `bdb921d` (`feat(a11y): mark the day-history button as opening a dialog`), un commit local por delante de `origin/development` según el seguimiento local (sin `ls-remote` en esta redacción). Entrega acotada: sin sesión, sin mutaciones y sin conexión ni escritura en Neon.

## 1. Qué cambia
- `src/components/shift-dashboard/MonthGrid.tsx`: el botón de detalle de día (`day-history-btn-<fecha>`) declara `aria-haspopup="dialog"`, porque abre el diálogo de detalle del día. Una línea.
- `src/components/shift-dashboard/MonthGrid.test.tsx`: una aserción nueva (`aria-haspopup` = `dialog`) en el test G6, junto a las de `data-review` y `aria-label`. Una línea.
- Sin cambios de comportamiento, de estilos, de i18n ni de datos.
- Origen: auditoría de solo lectura de MonthGrid hecha con Codex el 2026-11-08, que valoró `aria-haspopup="dialog"` como apropiado.
- **Fuera de alcance, no incluido:** incluir la fecha en el nombre accesible del aviso y añadir tests de teclado y restauración de foco (propuestas de esa auditoría).
- **No forman parte de esta entrega** siete ficheros de reglas y contratos de agentes que siguen modificados sin commit (`AGENTS.md`, `.agent/rules/*`, `.antigravity/*`). Quedan fuera del commit.

## 2. Evidencia
| Comprobación | Método | Resultado | Límite |
| --- | --- | --- | --- |
| Test focal de MonthGrid, ejecutado por el agente | `npm --prefix … exec -- vitest run … MonthGrid.test.tsx` | **29 de 31 PASS; 2 FAIL (G5 y G6) por `ENOENT … /anclora/src/index.css`** | Esos tests leen `process.cwd()/src/index.css` y el agente no pudo fijar el directorio de trabajo en el repo. Es un artefacto de ejecución, no un fallo del cambio. **G6 contiene la aserción nueva y falló antes de llegar a ella: la aserción NO se ejecutó en esta comprobación** |
| Test focal de MonthGrid, ejecutado desde el repo | `npx vitest run src/components/shift-dashboard/MonthGrid.test.tsx` | **NOT_VERIFIED** | Se le pidió a Toni ejecutarlo desde el repo antes del commit (esperado 31/31). El agente no tiene registrado su resultado |
| Lint | `npm run lint` | **NOT_RUN** | No ejecutado sobre este HEAD |
| Typecheck | `npx tsc --noEmit` | **NOT_RUN** | No ejecutado sobre este HEAD |
| Build | `npm run build` | **NOT_RUN** | No ejecutado sobre este HEAD |
| Suite completa | `npx vitest run` | **NOT_RUN** | Cambio de un atributo y una aserción; no se ejecuta suite completa por proporcionalidad |
| QA visual / navegador real | `anclora-visual-qa` | **NOT_RUN** | El atributo no tiene efecto visual. No se comprobó con lector de pantalla |
| `git diff --check` | — | **NOT_RUN** por el agente sobre este commit | — |

## 3. Pruebas no ejecutadas (NOT_RUN)
| Prueba | Motivo |
| --- | --- |
| Lector de pantalla (VoiceOver, TalkBack) | Requiere dispositivo o sesión interactiva; es tuya |
| E2E autenticado contra QA Mirror | Fuera del alcance de esta entrega; no se usó cuenta ni datos |
| Navegación por teclado y restauración de foco al cerrar el diálogo | Propuesta de la auditoría, no implementada; sin tests específicos |

## 4. Checklist para validar en la aplicación
Marca cada punto. Un fallo en un punto marcado **[BLOQUEANTE]** impide promocionar.

| # | Dónde | Pasos | Resultado esperado | Cuenta o configuración | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| 1 | Calendario, día con diferencia pendiente | Inspecciona el botón del aviso (⚠) del día en las herramientas de desarrollo. | El botón tiene `aria-haspopup="dialog"` y conserva `aria-label` «Día con diferencia pendiente — abrir detalle» | Propietario o empleado con un día con aviso | Sí |
| 2 | Calendario, mismo botón | Haz clic en el botón. | Se abre el detalle del día, igual que antes | Ídem | Sí |
| 3 | Calendario, día con historial sin aviso | Inspecciona el botón del icono de historial de un día con cambios. | El botón tiene `aria-haspopup="dialog"` y abre el detalle | Ídem | No |
| 4 | Apariencia | Compara el botón con la versión anterior. | Sin diferencias visuales | Ídem | No |

### Casos negativos y de borde
| # | Caso | Resultado esperado |
| --- | --- | --- |
| 1 | Día sin aviso ni historial | No hay botón de detalle; no cambia nada |
| 2 | Móvil (hasta 640 px) | El botón se comporta como antes |

### Estados de interfaz afectados
- [ ] Vacío · [ ] Cargando · [ ] Error · [ ] Éxito · [ ] Móvil · [ ] Escritorio · [ ] Modo oscuro

## 5. Riesgos y limitaciones
- Riesgo funcional muy bajo: un atributo ARIA y su aserción.
- La aserción nueva no consta ejecutada por el agente; depende del resultado que registres desde el repo.
- El nombre accesible del aviso sigue sin incluir la fecha (mejora propuesta, no aplicada).
- Esta entrega solo publica en `development`. Cualquier promoción es independiente y requiere `PROMOTE=FULL` con el SHA exacto.

## 6. Decisión de Toni
- [ ] Los puntos bloqueantes pasan
- [ ] El test focal de MonthGrid dio 31/31 desde el repo
- [ ] Se promociona: escribir `PROMOTE=FULL` (staging → production → main)
- [ ] No se promociona. Motivo: ______________________
