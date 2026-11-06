# Checklist de validación — UX móvil y rebaseline G6 (2026-11-06)

> Este fichero se sobrescribe en cada entrega. El historial queda en Git (el cierre de F5, `PASS_WITH_GAPS` en `5ead23f` y ya promocionado, consta en ese commit y en los anteriores).

**Repositorio:** anclora-shiftimport
**Evidencia histórica de UX móvil:** development @ `61adca0`; las comprobaciones de las secciones 1–6 pertenecen a ese SHA.
**Cambio G6 actual:** development @ `7a64899`; local y dos commits por delante del remoto confirmado `12fdae9`. QA visual local guest; sin sesión, sin mutaciones y sin conexión/escritura en Neon.

## Rebaseline G6 — 2026-11-06

Esta actualización prevalece para el cambio G6 que sigue. El HEAD inspeccionado es `7a64899616c54c6418e23348320c7c64cbeb1c06` (`development`); `git ls-remote origin refs/heads/development` confirmó `12fdae91a15ade0d300291c269bc239d57b14a1a`. Hay dos commits locales por publicar. La evidencia histórica de la tabla siguiente sigue ligada a `61adca0` y no se reutiliza como verificación del cambio G6.

| Comprobación en el HEAD actual | Método | Resultado | Límite |
| --- | --- | --- | --- |
| MonthGrid y G6 | `npx vitest run src/components/shift-dashboard/MonthGrid.test.tsx` | PASS, 31/31 | Prueba focal local |
| Contraste AA del aviso | Test G6 de MonthGrid: texto/fondo claro, texto/fondo blanco, tema oscuro; tokens, foco visible, nombre accesible y apertura del detalle | PASS, mínimo exigido 4.5:1 | Asserts del CSS y del componente en Vitest |
| QA visual G6 | `anclora-visual-qa doctor`; Chromium con `agent-browser` a 390×844, tema oscuro y claro; aviso temporal en una celda del calendario guest para renderizar las clases/atributos reales sobre el CSS actual | PASS; capturas revisadas en `/tmp/shiftimport-g6-dark.png` y `/tmp/shiftimport-g6-light.png` | Fixture DOM local; sin sesión ni acceso/escritura en Neon. No es E2E autenticado contra QA Mirror |
| Lint | `npm run lint` | PASS | HEAD `7a64899` |
| Typecheck | `npx tsc --noEmit` | PASS | HEAD `7a64899` |
| Build | `npm run build` | PASS_WITH_WARNING; Vite avisa de chunks >500 kB | HEAD `7a64899`; warning de tamaño sin fallo de build |
| Suite completa | No ejecutada sobre este HEAD | NOT_RUN | La evidencia de `61adca0` no se presenta como evidencia del SHA actual |

**G6_VISUAL=PASS_WITH_SCOPE.** El motor visual está disponible y el CSS se revisó en ambos temas. La integración con un registro `REQUIRES_REVIEW` real de QA Mirror no se ejecutó; no se usó cuenta ni se modificaron datos de Neon. El servidor Vite temporal y el navegador se cerraron al terminar.

## 1. Qué cambia
- Menú lateral en móvil y tableta (hasta 980 px): siempre con textos, una única X de cierre abajo (donde en escritorio está contraer/expandir); la preferencia de escritorio no se toca. El botón hamburguesa ya no aparece en escritorio.
- Calendario móvil (hasta 640 px): panel del día en una línea con «Añadir», indicadores pasivos de información y aviso en cada día, tres puntos y «+N».
- Equipo en móvil, tableta vertical (hasta 900 px) y móvil apaisado: Personas, Roles y acceso, Áreas y Asignaciones como tarjetas; el panel entero se desplaza hasta el último registro; acción principal fija en Asignaciones; pestañas con borde atenuado; asistente «Paso X de 5 · Nombre»; botones de los cuadros de diálogo siempre visibles; la transferencia de propiedad cabe en una pantalla.
- Escritorio: las tablas de Roles, Áreas y Asignaciones ahora se desplazan dentro de su contenedor (antes cortaban filas sin scroll).
- Accesibilidad: contrastes del avatar, del chip neutro y del botón primario en modo claro corregidos; textos de Equipo en español e inglés (modales y marcadores incluidos).

## 2. Ya comprobado por el agente
| Comprobación | Comando o método | Resultado | SHA |
| --- | --- | --- | --- |
| Lint | `npm run lint` | PASS | 61adca0 |
| Tipos | `npx tsc --noEmit` | PASS | 61adca0 |
| Build | `npm run build` | PASS | 61adca0 |
| Suite completa | `npx vitest run` (245 ficheros, 2940 tests) | PASS | 61adca0 |
| Equipo: tarjetas, acciones, un solo CTA, asistente, cobertura de claves ES/EN | `EquipoModal.compact.test.tsx`, `EquipoModal.i18n.test.ts` | PASS | 6b8815c |
| Navegador real (Chromium): 320×720, 360×800, 390×844, 430×932, 390×480, 844×390, 834×1194, 1440×900; ES/EN; claro/oscuro; sin desbordes, último registro alcanzable | script de auditoría con tenant sintético y escrituras bloqueadas | PASS | 61adca0 |
| WebKit emulado (390 y 430): capturas inspeccionadas | idem | PASS | 61adca0 |
| axe WCAG 2.2 AA en 20 pantallas de Equipo (claro/oscuro, ES/EN) | axe-core en navegador | 0 violaciones | 61adca0 |
| Permisos: ADMIN sin «Transferir propiedad»; PLANNER y EMPLOYEE sin entrada a Equipo | navegador real por rol | PASS | 61adca0 |
| Drawer y calendario sin regresiones | medición en navegador (390, 834, 1440) | PASS | 61adca0 |
| Aislamiento: residuo 0 y huella de la organización operativa idéntica antes/después | `E2E-SHIFT-<runId>` con teardown por ID | PASS | 61adca0 |

## 3. Pruebas no ejecutadas (NOT_RUN)
| Prueba | Motivo concreto |
| --- | --- |
| Safari / iPhone físico y Galaxy A16 | WebKit se validó emulado; la revisión en dispositivo real es tuya |
| Teclado nativo abierto en dispositivo real | Se simuló con altura reducida (390×480); falta dispositivo |
| `test:f4-mobile` y `a11y-f1` sobre este SHA | Superficie sin cambios desde su última ejecución en verde (6/6 y 4+4 omitidas); no se repiten |
| Modales de importación CSV e invitaciones pendientes | Fuera del alcance de esta entrega |
| Pasos de escritura reales del asistente y de los modales | La UI se probó con escrituras bloqueadas; la lógica de negocio no cambia y está cubierta por tests |

## 4. Checklist para validar en la aplicación
Marca cada punto. Un fallo en un punto marcado **[BLOQUEANTE]** impide promocionar.

| # | Dónde | Pasos | Resultado esperado | Cuenta o configuración | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| 1 | Menú en móvil | 1. Abre el menú (☰). 2. Observa. 3. Cierra con la X de abajo, luego reábrelo y toca fuera, luego reábrelo y elige «Calendario». | Textos visibles desde el primer momento; sin botón de contraer; las tres formas de cerrar funcionan | Cualquiera, móvil, con el menú de escritorio contraído en una sesión previa | Sí |
| 2 | Menú en escritorio | Abre la app en escritorio. | No hay botón ☰; el sidebar conserva su estado contraído/expandido | Cualquiera | Sí |
| 3 | Calendario móvil | Selecciona un día con 4 turnos, un aviso y DCF o comentario. | Marcador de información a la izquierda del número, aviso a la derecha, tres puntos y «+1»; cabecera del día en una línea con «Añadir» | Empleado o propietario con datos | Sí |
| 4 | Equipo › Asignaciones (móvil) | Elige un área y varios empleados; desplázate hasta el final. | Tarjetas legibles; el último empleado se ve entero; «Aplicar a N empleados» fijo abajo, sin duplicar | Propietario | Sí |
| 5 | Equipo › Roles y acceso (móvil) | Revisa las tarjetas y busca por nombre. | Rol, ámbito (áreas autorizadas de un planificador) y solo las acciones permitidas | Propietario | Sí |
| 6 | Equipo › Áreas (móvil) | Revisa las tarjetas; pulsa «Editar» y «Gestionar asignaciones». | Sin desbordes; Editar abre el área; Gestionar lleva a Asignaciones con el área elegida | Propietario | Sí |
| 7 | Equipo › Personas (móvil) | Desplázate por la lista. | Filtros y lista se desplazan juntos; la paginación queda abajo | Propietario | No |
| 8 | Equipo › Añadir persona | Recorre los cinco pasos con «Atrás»/«Siguiente»; en el paso 1 prueba «Cancelar». | «Paso X de 5 · Nombre»; los datos se conservan; el pie no tapa el campo con el teclado | Propietario | Sí |
| 9 | Equipo › Roles › Transferir propiedad | Ábrelo en el móvil. | Se ve entero, incluido el check de confirmación y los botones; no se puede confirmar sin marcar | Propietario (sin confirmar la transferencia) | Sí |
| 10 | Cambiar rol, Editar área, Editar ficha, Conceder acceso | Ábrelos en el móvil. | Los botones de acción quedan visibles abajo | Propietario | No |
| 11 | Tableta vertical (834 px) | Abre Equipo. | Tarjetas de dos en dos; acciones alcanzables sin scroll lateral | Propietario | No |
| 12 | Móvil apaisado | Abre Equipo › Roles y › Asignaciones. | Sin desbordes; el botón de aplicar queda tras la lista | Propietario | No |
| 13 | Idioma y tema | Repite 4, 5 y 9 en inglés y en modo claro. | Sin claves sin traducir; texto legible | Propietario | No |

### Casos negativos y de borde
| # | Caso | Resultado esperado |
| --- | --- | --- |
| 1 | ADMIN abre Equipo › Roles | No ve «Transferir propiedad» |
| 2 | PLANNER o EMPLOYEE | No tienen entrada a Equipo en el menú |
| 3 | Tarjeta del propietario | No muestra «Cambiar rol» |
| 4 | Escritorio con muchos empleados en Asignaciones | La tabla se desplaza dentro de su contenedor y se llega al último |
| 5 | Nombre de empleado muy largo | Se muestra completo, ajustado en varias líneas |

### Estados de interfaz afectados
- [ ] Vacío · [ ] Cargando · [ ] Error · [ ] Éxito · [ ] Móvil · [ ] Escritorio · [ ] Modo oscuro

## 5. Riesgos y limitaciones
- WebKit se validó emulado; falta Safari/iPhone real y el Galaxy A16.
- En apaisado el panel útil es corto (unos 360 px): la lista se alcanza desplazando.
- En escritorio y tableta horizontal los tabs y selects mantienen su densidad original (unos 33 px).
- Los modales de importación CSV e invitaciones pendientes no se revisaron.
- La promoción es independiente y requiere `PROMOTE=FULL` con SHA exacto.

## 6. Decisión de Toni
- [ ] Todos los puntos bloqueantes pasan
- [ ] Se promociona: escribir `PROMOTE=FULL` (staging → production → main)
- [ ] No se promociona. Motivo: ______________________
