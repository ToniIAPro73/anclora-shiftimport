# Checklist de validación — F4 (primera entrega) + Solicitudes, Sustituir/Añadir y consistencia calendario ↔ planificador (2026-11-02)

> Se sobrescribe en cada entrega; el historial queda en Git. El cierre de F3 se conserva en la sección «F3 (cerrada)».

**Repositorio:** anclora-shiftimport
**Rama:** development (commits `11d9605`, `b98be89`, `dd466a9` sobre `a6a4ec2`)
**Spec canónica:** `docs/specs/SPEC-SHIFTIMPORT-PLANNING-SIMPLIFICATION-MOBILE-AND-VACATIONS.md` (§4.5 y §4.5.1)
**Entorno de validación local:** runtime local con flags efímeros → Neon `main`; ninguna migración nueva; escrituras solo en tenants sintéticos `E2E-SHIFT-<runId>`.
**Datos:** sintéticos; 0 escrituras en `ShiftImport` real ni Groundforce; residuo 0.

```text
AUTOMATED_QA=PASS
HUMAN_VALIDATION=PENDING
PREVIEW_INTEGRATED_QA=PENDING
PRODUCTION_DEPLOYMENT=NOT_AUTHORIZED
F4=NOT_STARTED
```

## F4 — primera entrega (Centro de Solicitudes, bandeja unificada, contadores) — **local, sin publicar**

```text
F4_M01=IMPLEMENTED  F4_M02=IMPLEMENTED  F4_M03=IMPLEMENTED_PENDING_GATE  F4_M04=PARTIAL  F4_M05=PENDING
F4_FIX01_PLANNER_COUNTER=IMPLEMENTED
AUTOMATED_QA=PASS (focal)  HUMAN_VALIDATION=PENDING  PREVIEW_INTEGRATED_QA=PENDING
PRODUCTION_DEPLOYMENT=PROMOTED_8ad2edb (PROMOTE=FULL, 2026-11-03)  F4_GATE=PENDING_PREVIEW_VALIDATION  F5=NOT_STARTED
```

- **Centro de Solicitudes**: «Solicitudes» abre un único modal con `Pendientes del equipo (N)`, `Historial del equipo` y `Mis solicitudes` (solo con empleado vinculado); roles sin gestión, solo `Mis solicitudes`; el portal de EMPLOYEE no cambia. El badge es correcto al cargar.
- **Bandeja unificada**: cambios de turno y vacaciones, filtros (tipo, área, empleado), paginación, solape, turnos afectados, advertencia de vacaciones ya iniciadas (OD-08), motivo cuando no se puede decidir, rechazo con motivo obligatorio.
- **Aprobación masiva** (`POST /api/approval-requests/bulk-approve`, solo vacaciones, 1–50): resultado parcial por elemento; nunca aprueba lo no elegible.
- **Contador del planificador (F4-FIX-01)**: borrador `N planificadas · M desactualizadas`; versión publicada `N publicados · M excluidos` (derivado de lo realmente materializado, sin migración).
- **Comprobado**: 28 comprobaciones contra Postgres real (alcances OWNER/ADMIN/PLANNER ORG-AREAS-EMPLOYEES/EMPLOYEE, autoaprobación, fuera de alcance, otro tenant, política, parcial); contadores en Postgres real; visual 1440/412/375; axe 0 violaciones; tests focales (ver informe). Residuo 0; ninguna escritura en organizaciones reales; ninguna migración.
- **F4-M03 (decisiones OD-F4-01..04 aprobadas, implementadas en local)**:
  - **Copiar semana anterior**: copia el plan *publicado y aún vigente* de la semana anterior a un borrador existente; vista previa, confirmación, no sobrescribe, idempotente; omite con motivo (vacaciones, pasados, solapes, descanso 11 h incluido el límite de semana, obsoletas, fuera de alcance).
  - **Publicar semanas pendientes** (hasta 12): una publicación canónica por semana, resultado por semana, vista previa por ensayo, sin semanas con fechas ya pasadas, notificaciones como hoy. **Corrige un hueco previo**: ahora la publicación (individual y en lote) rechaza un horario con empleados fuera del alcance del PLANNER.
  - **PLANNER sin edición operativa directa**: `403 PLANNER_DIRECT_WRITE_FORBIDDEN` en `POST /api/calendar/changes` y en `PATCH /api/shifts` (cerrado el bypass `origin: 'IMP'`, el borrado y los `importId` inventados). Planificar en borrador, registrar histórico y reconciliar siguen permitidos.
  - **Reconciliación masiva «Mantener actual»** (≤ 50 días de un empleado, motivo común, vista previa, resultado por día) y **guardia de concurrencia `409 DAY_CHANGED`** también en la resolución individual (una sola sentencia con `FOR UPDATE`).
  - **Comprobado**: 62 comprobaciones contra Postgres real (roles, alcances ORGANIZATION/AREAS/EMPLOYEES, aislamiento de tenant, concurrencia con 3 peticiones simultáneas → 1 sola escritura, vacaciones protegidas) + regresión de F4-M01/M02 (28/28) y del contador F4-FIX-01; visual 1440/412/375 (ES, y EN claro en muestra), `axe` 0 violaciones en los diálogos nuevos, recorrido real por teclado (Tab, Espacio, Enter, Escape, foco visible y atrapado). Sin migraciones; residuo 0.
- **Pendiente / no ejecutado**: validación humana en dispositivo físico; QA en Preview tras el push. La matriz visual 834×1112 y 844×390 **sí se ejecutó** (abajo).
- **Remediación (2026-11-03)**: **REM-01** alcance `AREAS`/`EMPLOYEES` en escrituras de planificación, borrador nuevo y copia — corregido; **REM-02** Regular + Extras el mismo día publicable (descanso solo entre días distintos) — corregido; **AUD-03** concurrencia por empleado+día — bloqueo `pg_advisory_xact_lock` + puerta explícita `set_config` (sustituye la división por cero) — corregido y verificado en Postgres real (remediación 37/37, F4-M03 62/62, F4-M01/M02 28/28, 60 peticiones/12 días ⇒ 12 escrituras, 0 duplicados).
- **QA-04 (visual, `agent-browser`)**: 834×1112 PASS y 844×390 PASS en los 10 pasos (solicitudes, bandeja, masiva, contador, copiar, publicar pendientes, reconciliación, «Mantener actual»); sin desbordamiento horizontal, botón principal alcanzable, foco atrapado/visible, `axe` 0 violaciones en diálogos nuevos. Defecto corregido: foco a `<body>` al llegar los resultados (ahora pasa a «Cerrar»). Evidencia: `qa/e2e-acceptance/artifacts/F4-MOBILE/`.
- **Cierre técnico F4 (2026-11-03)**: regresión `App.logout.test.tsx` (bfcache) **resuelta** — era una fuga de `fetch` 401 entre tests que F4-M01 (llamada al cargar) hizo visible; 9/9 ×5. **E2E móvil de Playwright** (`npm --prefix qa/e2e-acceptance run test:f4-mobile`, 375×812 táctil, datos sintéticos reales, teardown con residuo 0): **6/6** (solicitudes + masiva, copiar semana, publicar pendientes, reconciliación masiva verificada en BD, modal de turnos, sesión) + recorrido equivalente con `agent-browser`. Defectos corregidos: foco a `<body>` tras resultados, trampa de foco con foco no tabulable, Escape cerraba el modal con el selector abierto en táctil, y **auditoría de «copiar semana» perdida** (tipo fuera del CHECK; ahora `ASSIGNMENT_CREATED`). Evidencia: `qa/e2e-acceptance/artifacts/F4-MOBILE/e2e-mobile-375/`. **ANDROID_PHYSICAL=NOT_VERIFIED, IOS_PHYSICAL=NOT_VERIFIED**, WebKit no cubierto; bfcache real no provocable (se probó el manejador con `pageshow` persistido). Pruebas focalizadas finales: 1498/1498. **F4_M04 = PARTIAL (falta validación humana en dispositivo físico), F4_M05 = PENDING.**
- **QA E2E en Preview sobre QA Mirror (2026-11-04)**: Preview `8ad2edb`, sesiones reales ADMIN/EMPLOYEE QA y PLANNER sintético temporal. Funcional/seguridad 46/46 (API + BD), visual/accesibilidad en 8 viewports y escenarios A–F de 375×812 con cambios reales: PASS; teardown verificado (Mirror idéntico a su línea base, `QA_TEMP_RESIDUE=0`, 0 escrituras en la organización operativa). Defecto P2 hallado: primer fotograma del selector «Tipo de turno» fuera del viewport (≤13 ms, solo en la primera apertura tras cargar); corregido en local con `useLayoutEffect` (**LOCAL_FIX_PASS / PREVIEW_RECHECK_PENDING**: requiere nuevo despliegue). Android/iOS físicos y teclado virtual real no verificados. **F4_M05 = PENDING, validación humana NO realizada.**
- **QA focal local del código sin publicar (2026-11-04)**: 15/15 casos ejecutables PASS en Chromium emulado (selector primera apertura 0/6 en 360/375/390/412, interacciones y lista larga, modal móvil, viewport reducido, agenda móvil 5/5, historial real y bfcache real `persisted=true` con sesión muerta → `/login`), 0 incidentes de tenant, teardown único con Mirror y organización operativa idénticas a su línea base. `NOT_AVAILABLE` entonces: WebKit (cubierto después, ver la línea siguiente) y teclado virtual del SO (sin Xcode/simulador/SDK). `LOCAL_FIX_PASS`; **`DEPLOYED_PREVIEW_PASS=NOT_RUN`, F4_M05 = PENDING, validación humana NO realizada.**
- **QA focal local en WebKit (2026-11-04)**: Playwright WebKit 26.5 instalado (no es Safari ni simulador iOS). 14 PASS: selector primera apertura 0/6 fuera del viewport en 360/375/390/412, interacciones y lista larga, modal móvil, viewport reducido, historial real y sesión muerta sin datos del tenant; teardown único con Mirror y organización operativa idénticas a su línea base. Diferencia de plataforma P3 documentada (Tab nativo solo en campos; foco a `body` al cerrar el modal porque WebKit no enfoca botones al hacer clic/toque; backlog en `ModalShell`/cajón). bfcache no observable en WebKit automatizado. Teclado virtual del SO y Safari/iOS reales **no verificados**. **`DEPLOYED_PREVIEW_PASS=NOT_RUN`, F4_M05 = PENDING, validación humana NO realizada.**
- **Calendario móvil compacto (2026-11-04)**: en ≤640 px la rejilla usa celdas bajas (34 px: número y un punto por turno efectivo, máx. 3 y «+N», sin etiquetas, horarios ni iconos) y el panel del día queda justo debajo (turnos, accesos a Avisos/DCF/Comentarios/Historial solo si existen, «Añadir turno» y «Ver detalle»; un día sin turnos muestra solo el texto y «Añadir turno»); la organización pasa al menú de cuenta. Causa: el `grid-template-rows` en línea y las alturas de escritorio estiraban cada fila a 100 px (rejilla de 615 px, panel fuera de pantalla). Verificado en Chromium (360/375/390/412) y WebKit emulado (375/390), ES/EN, claro/oscuro; escritorio sin cambios; lint, build y 2673 tests. **Pendiente: revisión visual humana y validación en Galaxy A16; modales, teclado, rotación y roles no ejecutados en navegador; F4_M05 = PENDING.**
- **Limitaciones**: descanso entre semanas no comprobado al crear/publicar (solo en copiar semana); contraste 4,49:1 del botón «Revisar» en claro (preexistente); `update` solo con `employeeId` ⇒ 400 (previo); Sustituir/Añadir conserva su guardia de concurrencia original. **F4_M04 = PARTIAL, F4_M05 = PENDING, validación humana NO realizada.**
- **Hotfix UX móvil del modal de turnos (2026-11-03)**: (1) selector «Tipo de turno» ya no desplaza el modal ni queda fuera de pantalla (sin teclado forzado en táctil, posición con `visualViewport`, `Escape` cierra solo el menú); (2) Hora inicio/fin sin desbordar (rejilla `auto-fit`, una columna si no caben); (3) cabecera fija + una región de scroll + acciones en el pie; (4) etiquetas asociadas (axe 0) y error de validación visible dentro del modal. Verificado en 360/375/390/412/844×390 (muestra ES/EN y claro/oscuro) con `agent-browser`. **No verificado**: puntero táctil/teclado virtual reales y ancho del picker 12 h/iOS (emulados). **Validación humana en dispositivo real: PENDIENTE.** Evidencia: `qa/e2e-acceptance/artifacts/F4-MOBILE/shift-modal-hotfix/`.
- **Limitaciones**: la fecha de creación de cada tarjeta se muestra en ISO (comportamiento previo); en `ORGANIZATION_ADMIN` un PLANNER de área ve las solicitudes pero no puede decidirlas (política, no error).

## 1. Qué cambia
### A. Solicitudes (`11d9605`)
- El modal «Solicitudes» se adapta al viewport (altura máxima, scroll interior solo si hace falta), lista primero las solicitudes existentes y abre «Cambio de turno» y «Vacaciones» en modales separados con «Volver a solicitudes».
- «Mis solicitudes»: un administrador/propietario con empleado vinculado puede pedir cambios de turno y vacaciones propios; la autoaprobación sigue prohibida. Las rutas `/api/me/change-requests*` exigen empleado vinculado en lugar del rol `EMPLOYEE`.
- Estado vacío con dos tarjetas (cambio de turno y vacaciones).

### B. Sustituir / Añadir turnos (`b98be89`)
- **D-01 APPROVED:** un día libre sustituido por trabajo pasa a `SUPERSEDED`, permanece en el historial y no cuenta en las estadísticas operativas (libres 0).
- **D-02 APPROVED:** si el día ya tiene turnos vigentes, un diálogo recomienda `REPLACE` o `ADD` (preseleccionado) y exige confirmación y motivo; el servidor repite todas las validaciones.
- **D-03 APPROVED:** `Regular` + `Extras` no solapados coexisten (`ADD`); cuentan una fecha trabajada.
- **D-04 DEFERRED:** descansos parciales/compensatorios, bolsas de horas y retribución quedan fuera.
- Mismo contrato `calendar_changes` (`ADD_SHIFT`/`ADD_EXTRA`, `TYPE_CHANGE`/`TIME_CHANGE`); historial y auditoría; concurrencia (`409 DAY_CHANGED`); vacaciones aprobadas protegidas (F3: `ADD` nunca; sustituirlas solo OWNER/ADMIN con auditoría).

### C. Planificador y publicación (`dd466a9`)
- Una asignación de borrador contradicha por un cambio manual posterior se marca **desactualizada** (`staleAgainstCalendar`) y se conserva.
- Publicar la **excluye** (`STALE_AGAINST_CALENDAR`) y no puede reintroducirla; en una versión **publicada** se muestra como «Excluida de publicación · Desactualizada respecto al calendario».
- Una versión nueva copia la asignación como evidencia, sigue marcada y se vuelve a excluir.
- Calendario operativo: solo turnos vigentes. Historial del día: «Vigente»/«Sustituido», cambios del más reciente al más antiguo.

## 2. Ya comprobado por el agente (`AUTOMATED_QA=PASS`)
| Comprobación | Resultado |
| --- | --- |
| Modal Solicitudes: layout 1366×768 y 375×812, sin clipping | PASS |
| Sustituir/Añadir: matriz REPLACE/ADD, F3, RBAC, tenant, concurrencia (tests + E2E real en tenant sintético) | PASS |
| Estadísticas: día libre sustituido = 0, Extras 420 min, regulares 0 | PASS |
| Borrador obsoleto → publicación `created:0`, `excluded:[STALE_AGAINST_CALENDAR]`; versión publicada y nueva versión | PASS (Postgres real) |
| Visual 1366×768 y 375×812 (calendario, historial, planificador antes/después de publicar) | PASS |
| Commit B aislado: `tsc` + 38/38 tests focales; tests focales de C 76/76; `eslint` (0 warnings) y `tsc` | PASS |
| Ninguna suite amplia ni completa; ninguna migración; residuo 0 | confirmado |

## 3. NOT_RUN / gaps
- **`PREVIEW_INTEGRATED_QA=PENDING`:** QA integrada sobre el Preview de Vercel del nuevo HEAD.
- **`HUMAN_VALIDATION=PENDING`:** validación de Toni en Preview/development.
- Regular + Extras (ADD) y vacaciones protegidas con Sustituir/Añadir: cubiertos por tests y por QA previa, no repetidos en navegador en esta entrega.
- **Limitación UX conocida:** el contador «N turnos» de la cabecera del planificador aún puede incluir asignaciones excluidas/obsoletas.
- La exclusión de una versión publicada se **deriva** (no se almacena); la ruta de publicación por importación (`publishImportedPairsTx`) no se tocó.
- Falso positivo posible: un borrador planificado a propósito sobre un día con cambio manual contradictorio queda marcado y no se publica.
- F4 (no iniciada). Suite histórica `specs-qa-mirror`: deuda técnica no bloqueante, no ejecutada.

## 4. Para Toni
- Valida en Preview/development: Solicitudes (escritorio y móvil, administrador con empleado vinculado), sustituir un Día libre por Extras (calendario + historial), y publicar un borrador obsoleto.
- No se promociona ni se activa Producción sin tu orden expresa.

---

## F3 (cerrada) — histórico conservado

### F3.1 Qué cambia
- **Aprobar y rechazar vacaciones** (`/api/approval-requests`, con `kind=TIME_OFF|SHIFT_CHANGE|ALL`; sin `kind` todo igual que antes). Scope real (ORGANIZATION/AREAS/EMPLOYEES) en la consulta, anti-autoaprobación por usuario y empleado, el propietario siempre decide, la política estrecha al resto.
- **Materialización** al aprobar: los turnos previos pasan a `SUPERSEDED`, se crea `Vacaciones` por día (nunca `Baja`), con rastro en `calendar_changes`; si la solicitud ya había empezado solo se aplica de hoy en adelante y se informa de los días no aplicados.
- **Protección**: el planificador rechaza planificar un día con vacaciones aprobadas (422), la publicación las excluye y los borradores nuevos no las copian; el planificador las muestra bloqueadas.
- **Importaciones**: sobre un día con vacaciones aprobadas, una propuesta distinta queda pendiente de revisión (`APPROVED_VACATION_CONFLICT`); la ausencia sigue vigente.
- **Override auditado**: solo propietario/administrador pueden sustituir las vacaciones por la propuesta; queda registrado con quién lo hizo. Un planificador recibe 403.
- **UI**: insignia «protegida» (candado + texto) en el calendario, chip discontinuo «Vacaciones (Pendiente)» para tus solicitudes, origen y conflicto (con las cinco respuestas y dos acciones) en el detalle del día, motivo en la lista de diferencias, día bloqueado en el planificador.

### F3.2 Ya comprobado por el agente
| Comprobación | Resultado |
| --- | --- |
| 24 pruebas contra PostgreSQL real (materialización, OD-08, idempotencia/concurrencia, scope, tenant, planificador, override) | PASS |
| E2E real con flags efímeros, 5 escenarios (aprobación, rechazo, planificador, importación en conflicto + override, regresión de cambio de turno) | 5/5, residuo 0 |
| Flags apagados: rutas de vacaciones y `kind=TIME_OFF` ⇒ 404; `qa:local:smoke` | PASS |
| Huella de la organización real `ShiftImport` antes/después | idéntica; Groundforce no existe en esta BD |
| E2E real del feed unificado (`kind` × `status`, fusión ALL por resolución, cursor sin duplicados, tenant, rol, legacy sin `kind`) | PASS |
| `npm run test:f3` (35 ficheros, 510 tests; incluye regresión de aprobación de cambio de turno, estadísticas, ledger, auto-publicación F1) | PASS |
| Arnés accesibilidad/responsive (375/412/1440 × ES-oscuro / EN-claro) | 144/144 |
| `eslint` (0 warnings, incluido el spec E2E), `tsc`, `build` | PASS |
| Ninguna suite amplia ni completa ejecutada; ninguna migración nueva | confirmado |

### F3.3 NOT_RUN / gaps
- **Puerta F3 cerrada (`PASS`)** sobre Vercel Preview (rama `development`, deploy `ed1d3a0` posterior a los flags): 6/6 E2E focales de F3 contra el Preview real, QA visual 375/412/1440 (ES oscuro, EN claro) y a11y focal; residuo 0. Producción sin flags.
- QA visual y a11y sobre el runtime real (Preview): hecho; el estado de conflicto de importación se valida en el runtime real por API y en el arnés visual.
- F4 (no iniciada): Centro de Solicitudes de gestores y aprobación en bloque (el historial de cambios de turno ya está en la API unificada de F3).
- Suite histórica amplia de `specs-qa-mirror`: deuda técnica no bloqueante de F1; no se ejecutó.

### F3.4 Para Toni
- Valida F3 en Preview/development; no se promociona ni se activa Producción sin tu orden expresa.
- Decisión confirmada: el propietario siempre decide (salvo autoaprobación); la política estrecha al resto.
