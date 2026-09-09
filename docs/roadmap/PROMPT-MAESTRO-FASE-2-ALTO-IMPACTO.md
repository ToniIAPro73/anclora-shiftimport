# PROMPT MAESTRO — Ejecución de FASE 2 · Alto impacto
## `UXR-F2-M01` … `UXR-F2-M06` · Findings: CX-F01 (P1/HIGH), CX-F04, CX-F05
## Gate: `docs/roadmap/UXR-F2-HIGH-IMPACT-GATE.md`

> **Uso**: entregar íntegramente como prompt inicial a un agente IA con acceso de lectura/escritura
> al repositorio `anclora-shiftimport`, rama `development`.

---

## 0 · ROL Y MISIÓN

Eres un **ingeniero frontend senior**. Esta es **la fase que arregla el único P1 de la auditoría**:
en móvil, la lista de revisión del importador mide 0 px — las filas existen en el DOM pero el panel
padre las recorta, así que el preview de seguridad, que es el corazón del producto, pierde su función.

Las otras dos correcciones son de **precisión informativa**: el resumen temporal anuncia borradores
que la opción efectiva excluye (CX-F04), y la preview de provisioning clasifica mal usuarios nuevos y
IDs repetidos (CX-F05). Ambas hacen que el usuario no pueda anticipar qué va a pasar al confirmar.

**El hilo común de las tres**: *el precommit miente sobre el resultado*. Esa es la frase que debe
guiar cada decisión de diseño de esta fase.

### Qué puedes tocar
✅ `src/components/shift-dashboard/ImportModal.tsx`, `src/components/shift-dashboard/MembersModal.tsx`,
`src/lib/import-temporal.ts`, `src/index.css`, y ficheros de test asociados.
✅ Extracción de lógica pura a `src/lib/` si mejora la testabilidad (ver §2.4).

### Qué NO puedes tocar
❌ `api/`, `db/`, `vercel.json`, lógica de autorización o de scope.
❌ Producción, secretos, `git push`, despliegues.
❌ **La semántica de la importación.** Reestructuras cómo se *presenta* y cómo se *cuenta*, nunca qué
se escribe. Ninguna fila que hoy no se importa pasa a importarse por un cambio de esta fase.

### Precondición
Fase 0 y Fase 1 cerradas, **ambas en `PASS_WITH_GAPS`** con sus huecos declarados. En particular:
- `UXR-F0-M08` (baseline de 8 viewports) — disponible, con `import-preview` declarada inestable
  (§2.0.2): esa parte de la baseline la arreglas tú.
- `UXR-F1-M04` (fixture cargable) — **dependencia dura de M05/M06**, cubierta por test contractual
  sobre el fichero real. Su pata de verificación en UI viva quedó `NOT_EVALUATED` (requiere
  `vercel dev` + Neon); eso **no** bloquea M05, que es lógica pura, pero sí condiciona M06 (§5.6).
- `UXR-F1-M01` (nombres accesibles por fila) — M02 debe **reconstruirlos**, no heredarlos, y además
  corregir su identificador de fila (§2.0.1).

**Entorno**: `M01`–`M04` son ejecutables en modo invitado local-first, sin `vercel dev` ni Neon.
`M05` es lógica pura, también. **Sólo `M06`** (preview de provisioning en `MembersModal`, ADMIN)
requiere sesión autenticada. Si no levantas ese entorno, cierra M06 con cobertura unitaria y declara
la verificación en UI como `NOT_EVALUATED` con motivo — no la des por hecha.

---

## 1 · ENTRADAS OBLIGATORIAS

| # | Ruta | Uso |
|---|------|-----|
| 1 | `AGENTS.md` (raíz) | Convenciones y riesgos conocidos |
| 2 | `sdd/features/ux-remediation-codex-2026-09/03_IMPLEMENTATION_PLAN.md` **líneas 610–953** | Las 6 microtareas literales |
| 3 | `docs/roadmap/UXR-F2-HIGH-IMPACT-GATE.md` | AC exactos |
| 4 | `sdd/features/ux-remediation-codex-2026-09/02_DATA_API_CONTRACT.md` | Forma de `deriveEffectiveTemporalSummary` y del tipo de clasificación |
| 5 | `docs/standards/MODAL_CONTRACT.md` | **Crítico para M01**: scroll interno, foco, cierre |
| 6 | `sdd/decisions/PD-2026-09-06-P5.5-future-import-draft-scheduling.md` | Decisión vigente sobre futuros→borrador (M03/M04) |
| 7 | `sdd/decisions/PD-2026-09-06-D03-employee-self-import.md` | Scope SELF del Employee (M03/M04) |

---

## 2 · ESTADO REAL DEL REPO — ANCLAJES VERIFICADOS

He verificado línea a línea los anclajes de la spec. **Son correctos.** Detalles que necesitas:

### 2.0 Qué dejó Fase 1 en el importador (léelo antes de tocar `ImportModal.tsx`)

Fase 1 cerró en `PASS_WITH_GAPS` y **ya modificó el fichero que vas a reescribir**. No lo deshagas.
Lo que hay ahora en `src/components/shift-dashboard/ImportModal.tsx`:

- **`aria-label` por campo y fila** en fecha, origen, tipo, hora inicio, hora fin y papelera, vía
  claves i18n nuevas (`importModal.rowDateAria`, `rowOriginAria`, `rowTypeAria`, `rowStartAria`,
  `rowEndAria`, `removeRowAria`, `colActions`).
- **Gestión de foco tras borrar**: `pendingRemovalFocusIndex` (state) + `rowRemoveButtonRefs`
  (ref array) + un `useEffect` que reenfoca a `Math.min(index, parsedShifts.length - 1)`, con
  fallback al estado vacío (`emptyPreviewRef`, `tabIndex={-1}`, `role="status"`).
- El `<th>` de acciones, antes vacío, lleva ahora `<span className="sr-only">`.

**Todo eso son criterios de aceptación ya cerrados de CX-F03. Si tu layout de tarjeta los rompe, has
roto Fase 1**, y el gate de Fase 2 no puede pasar. Concretamente: al pasar de `<table>` a tarjetas,
la asociación cabecera↔celda desaparece por construcción, así que los nombres accesibles **deben
reconstruirse**, no heredarse por accidente.

### 2.0.1 ⚠️ Arrastre obligatorio de Fase 1: etiquetas por fecha, no por número de fila

Las etiquetas quedaron como `Fecha, turno {{row}}` → **"Fecha, turno 3"**, usando el índice
posicional (`index + 1`). Es un defecto real que **corriges tú**, dentro de `UXR-F2-M02`:

- **Por qué está mal**: al borrar el turno 2, lo que era «turno 3» pasa a ser «turno 2». La etiqueta
  cambia justo con la operación que se estaba haciendo accesible. La auditoría admitía
  «fecha/empleado **o índice estable**», y un índice que se renumera al borrar no es estable.
- **Por qué importa**: el AC-1 de CX-F03 pide que se anuncie «campo y **turno asociado**». Quien usa
  lector de pantalla oye «Hora de fin, turno 3» y no sabe de qué turno se trata. Con la fecha sí.
- **Qué hacer**: nombrar con el dato identificador de la fila —`shift.date` está disponible en el
  propio `map`— en vez del ordinal. P. ej. `Hora de fin, turno del 15/09/2026`. Si la fecha está
  vacía o es inválida (fila con diagnóstico), cae al ordinal como último recurso, no al revés.
- **Alcance**: cambian los valores de las claves i18n ES y EN y el argumento que se les pasa; no
  inventes claves nuevas si las existentes sirven. Actualiza los tests de Fase 1 que asertan sobre
  el texto de esas etiquetas.

Hazlo **junto con el layout de tarjeta**, no en una pasada aparte: `UXR-F2-M02` ya reconstruye el
nombrado de cada fila, así que es el momento natural y evita tocar dos veces el mismo código.

### 2.0.2 Dos señales independientes que apuntan a tu P1

Fase 0 y Fase 1 encontraron, por caminos distintos, el mismo problema de layout que describe CX-F01:

1. **`import-preview` está declarada inestable** en la baseline visual (Fase 0). Sus capturas varían
   entre procesos porque hay **líneas de 1px sobre fronteras fraccionarias** (medido: y=422,
   `maxDelta` 43) — separadores de la tabla de preview. Es distribución de alturas fraccionarias.
   Ver `qa/e2e-acceptance/compare-baseline-runs.mjs` y el procedimiento de baseline §AC-1.
2. **El `thead` sticky deriva hacia abajo** en cada borrado de fila hasta tapar el botón de papelera
   tras ~4 borrados (hallazgo de Fase 1, verificado como **preexistente**, documentado en
   `05_PROGRESS_LOG.md`). No corregido allí por estar fuera de alcance.

Ambos son tuyos. El segundo, además, **rompe el AC-2 de `UXR-F2-M01`** («las acciones no quedan
recortadas»): si la cabecera tapa la papelera, la acción está recortada. Trátalo como parte de M01,
no como un extra.

**Consecuencia sobre tu evidencia**: la baseline de `import-preview` (8 de 48 capturas) **no es
fiable** para comparación pixel-a-pixel hasta que tú arregles ese layout. `calendar` y `pricing`
(40 de 48) sí lo son. Cuando termines M01/M02, **reejecuta la doble corrida de baseline**
(`UXR_BASELINE_RUN_ID=runX npx playwright test --config playwright.uxr-f0-baseline.config.ts`, dos
veces, y `node compare-baseline-runs.mjs runA runB`): si tu arreglo es correcto, `import-preview`
debería dejar de ser inestable, y eso es evidencia de primer orden para tu gate. Si lo consigues,
**retira su entrada de `DECLARED_UNSTABLE_SCREENS`** en el comparador — es el cierre limpio.

### 2.0.3 Cambios de Fase 1 en otros ficheros que tocas

- `src/lib/plans.ts`: `priceHypothesis: string` **ya no existe**; ahora es
  `price: PlanPrice { amount: number | null; currency: 'EUR'; interval: 'month'; fromPrefix: boolean }`.
  No lo necesitas para Fase 2, pero no lo revierta si algo te lleva ahí.
- `src/lib/i18n-react.tsx`: el `I18nProvider` sincroniza `document.documentElement.lang` con el
  locale. Cualquier test tuyo que monte el provider hereda ese comportamiento.
- `src/lib/bulk-import-csv.test.ts` tiene un **test contractual** que carga la fixture real
  (`01_empleados_45.csv`, 45 filas) por `parseEmployeesCsv`. Es tu red de seguridad en M05/M06: si lo
  rompes, has cambiado el contrato del parser.
- La fixture ya tiene la cabecera correcta (`external_employee_id`). **No la vuelvas a tocar.**

### 2.0.4 La suite tiene un test intermitente

`npm test` falló 1 vez de 13 ejecuciones (~8%, 2 errores no capturados), no reproducible en 10
intentos seguidos y sin relación con los cambios de Fase 0 ni de Fase 1. Si te sale un fallo que no
guarda relación con tu cambio, **reejecuta antes de diagnosticar**; si lo reproduces, identifícalo y
repórtalo en vez de arreglarlo a ciegas. Tu gate exige cero tolerancia, así que no confundas
intermitencia conocida con regresión tuya.

### 2.1 CX-F04 — el bug está a la vista (`ImportModal.tsx` ~1734)
```tsx
{temporalSummary.future > 0 && <span data-testid="import-future-count">
  {t('importModal.temporalFutureDraft', { count: temporalSummary.future })}</span>}
```
El badge usa **`temporalSummary.future` directo** — el conteo *detectado* — y lo etiqueta como
`temporalFutureDraft`, es decir, como *destino efectivo*. Justo debajo, un bloque separado con
`data-testid="import-self-future-notice"` y `role="status"` avisa al EMPLOYEE (`identityLocked`) de
que no se creará planificación. **Ahí está la contradicción**: el badge promete N borradores y el
aviso dice que no habrá ninguno.

`src/lib/import-temporal.ts` tiene sólo **22 líneas**: `FutureImportDecision = 'draft' |
'historical-only'` y `splitImportByOperationalDate`. No sabe nada de rol ni de decisión — por eso la
derivación efectiva es una función nueva, no un parche al split existente.
`src/lib/import-temporal.test.ts` ya existe: amplíalo.

### 2.2 CX-F05 — los dos defectos, localizados
En `MembersModal.tsx` (1897 líneas):

| Defecto | Dónde |
|---|---|
| `classifyUserRow` devuelve `'no_employee'` para un email nuevo sin vínculo | ~línea 172 |
| El resumen agrega `no_employee` bajo **`existing`** | ~línea 999: `existing: usersPreview.filter(e => e.status === 'existing_and_link' \|\| e.status === 'already_linked' \|\| e.status === 'no_employee').length` |
| Sólo hay `seenEmails` — **no hay seguimiento de `externalEmployeeId` repetido** | ~línea 137 (`seenEmails.has(row.email)` → `'duplicate_in_file'`) |

→ El primer defecto es de **presentación** (un status correcto agregado en la cubeta equivocada).
El segundo es de **lógica** (falta un eje de detección). Trátalos como tales: el primero se arregla
en el conteo, el segundo exige un status nuevo.

### 2.3 CX-F01 — el contrato de modal manda
`MODAL_CONTRACT.md` es la regla: el scroll debe quedar **contenido en el bloque de filas**, nunca en
el modal completo, y sin doble scrollbar. El precedente exacto ya existe en el repo:
`P5.7-M09-PREMIUM-UX-A11Y-GATE.md` documenta cómo se resolvió lo mismo para `EquipoModal`
(`ModalShell` en modo `workspace`, altura fija `min(86vh, 920px)`, `overflow: hidden`, scroll interno
contenido, eliminación de `min-height` artificiales). **Léelo antes de diseñar el layout** — es el
patrón de la casa para este problema.

### 2.4 Testabilidad: extraer lógica pura es legítimo
`MembersModal.tsx` tiene 1897 líneas y `ImportModal.tsx` 1806. La spec lo sugiere para
`classifyUserRow` ("extracción a `src/lib/` si facilita testeo aislado"). **Hazlo cuando la lógica
sea pura** (clasificación, conteo, derivación temporal) y déjalo en el componente cuando sea render.
Precedente: `src/lib/bulk-import-csv.ts` ya es exactamente eso — parsing extraído del componente con
su propio test.

Tests existentes que debes ampliar (no duplicar): `ImportModal.test.tsx`,
`ImportModal.areas.test.tsx`, `MembersModal.test.tsx`, `import-temporal.test.ts`,
`bulk-import-csv.test.ts`.

### 2.5 Anclajes de test ya disponibles
`ImportModal.tsx` expone `data-testid` estables — úsalos en vez de selectores frágiles:
`import-quality-state`, `import-detected-period`, `import-diagnostics`, `import-historical-count`,
`import-future-count`, `import-self-future-notice`, `import-employee-name-locked`,
`import-area-context`, `self-import-summary`.

---

## 3 · ORDEN DE EJECUCIÓN

Tres cadenas independientes; dentro de cada una el orden es obligatorio.

```
Cadena A — CX-F04 (empieza por aquí: es lógica pura, riesgo bajo, valor alto)
  UXR-F2-M03  deriveEffectiveTemporalSummary (función pura + tests)
  UXR-F2-M04  consumo en el badge de ImportModal

Cadena B — CX-F05
  UXR-F2-M05  separar existencia/vínculo + duplicado intra-fichero (lógica)
  UXR-F2-M06  conteos y motivos por fila en la preview (UI)

Cadena C — CX-F01 (el P1; la más costosa)
  UXR-F2-M01  resumen expandible + región de revisión con altura positiva
              + drift del thead sticky (§2.0.2 — rompe su propio AC-2)
  UXR-F2-M02  layout de tarjeta para lectura móvil
              + etiquetas por fecha en vez de por ordinal (§2.0.1, arrastre de Fase 1)
  ── al cerrar la cadena: reejecutar la doble corrida de baseline y, si
     import-preview deja de ser inestable, retirarla de DECLARED_UNSTABLE_SCREENS
```

**Empieza por la Cadena A.** `M03` es una función pura con test unitario: cierra rápido, valida el
enfoque y no arriesga layout. Deja la Cadena C para el final, con el resto ya verde.

---

## 4 · LOS PUNTOS DIFÍCILES

### 4.1 `UXR-F2-M01` — el AC-3 es el que se rompe
> *"Given preview editada, When se cambia orientación o se expande archivo, Then se preservan cambios
> y selección temporal."*

Colapsar el bloque de archivo/identidad tras el parse es fácil. Lo difícil es que **expandirlo y
volver a colapsarlo, o rotar el dispositivo, no destruya el estado de edición**. Si el colapso se
implementa desmontando el subárbol, pierdes los valores editados y la decisión temporal. Consérvalo
montado y oculto, o eleva el estado. **Cubre esto con un test explícito**, no sólo con una captura.

### 4.2 `UXR-F2-M01` — "altura positiva" no es "se ve algo"
El AC-2 dice *"el área de filas tiene altura positiva y las acciones no quedan recortadas"*. Mide el
`getBoundingClientRect().height` real del contenedor de filas en 390×844 y 844×390, y déjalo en la
evidencia como número. La auditoría midió **0 px**; tu evidencia debe ser un número > 0, no una
captura donde "parece que se ve".

### 4.3 `UXR-F2-M02` — el breakpoint es una decisión, no un candidato
La spec propone 768 px "a confirmar contra la matriz". **Confírmalo con datos**: la matriz de Fase 0
tiene 390, 430, 768, 844(landscape), 1024, 1366, 1440, 1728. El punto donde las columnas dejan de ser
legibles es medible. Elige, justifica con la medición, y documenta el valor en el gate.

Al pasar a tarjeta, **reconstruye los nombres accesibles de `UXR-F1-M01`**: cambiar de `<table>` a
tarjetas rompe la asociación cabecera↔celda por construcción. El nombre debe reconstruirse, nunca
desaparecer — y en la reconstrucción aplicas el arrastre de §2.0.1: **identificador por fecha, no por
ordinal**. Verifica ambas cosas con test, no sólo con axe: axe ve que hay nombre, no que el nombre
siga siendo correcto después de borrar una fila.

### 4.4 `UXR-F2-M04` — el copy condicional es parte del AC
> *"cero borradores a crear **y razón explícita**"*

No basta con mostrar `0`. Cuando `excludedByRole > 0`, el usuario debe leer *por qué* quedan excluidos
(su rol no crea planificación). Y antes de que decida, el tiempo verbal es condicional
("se crearían N borradores"), no afirmativo. Ambas cosas pasan por la capa i18n en ES y EN —
`LOCALIZATION_CONTRACT.md`.

⚠️ **DO_NOT_BREAK crítico**: *"Nunca publicar automáticamente por importar futuros"*. Estás cambiando
cómo se *cuenta* y se *anuncia* el destino. Si al terminar algún camino publica algo que antes
quedaba en borrador, has roto la invariante más importante del producto.

### 4.5 `UXR-F2-M06` — la suma debe cuadrar
> *"Given filas válidas+inválidas, When muestra conteos, Then su suma coincide con total y política de
> confirmación."*

Tres cifras deben cuadrar entre sí: la suma de las cubetas, el total de filas del fichero, y **lo que
la confirmación va a ejecutar realmente**. Ese tercer punto es el que la auditoría señala como roto.
Verifícalo con los 4 casos: nuevo sin vínculo, existente con vínculo, existente sin vínculo, y dos
filas con el mismo ID nuevo.

---

## 5 · GATE — CÓMO CERRARLO

Actualiza `docs/roadmap/UXR-F2-HIGH-IMPACT-GATE.md`:

1. **§3.1** — los AC de las 6 microtareas, cada uno con artefacto.
2. **§3.2 No regresión** — verifica una por una las 12 entradas DO_NOT_BREAK de esta fase:
   - CX-F01: preview antes de escritura · identidad y período autoritativos · avisos de filas
     excluidas · foco y cierre seguro.
   - CX-F04: no publicar automáticamente · scope SELF · decisión explícita de futuros · conteo sin
     descarte silencioso.
   - CX-F05: revalidación backend · no crear empleado al importar usuario · aislamiento organización ·
     motivos por fila.
   - **Fase 1 no regresa** (nuevo, obligatorio): cada campo de fila conserva nombre accesible; la
     papelera conserva el suyo; el foco tras borrar sigue yendo a un destino predecible, incluida la
     última fila y el estado vacío; el `<th>` de acciones conserva su texto para lector de pantalla.
2bis. **§3.2b Arrastres cerrados** — dos casillas explícitas:
   - [ ] Las etiquetas de fila identifican el turno **por fecha**, y siguen siendo correctas después
         de borrar una fila intermedia (§2.0.1). Cubierto por test, no sólo por axe.
   - [ ] El `thead` sticky **no deriva** al borrar filas sucesivas: tras 5 borrados consecutivos la
         papelera de la última fila sigue siendo visible y clicable (§2.0.2).
3. **§3.3** — `npm test && npx tsc --noEmit && npm run lint && npm run build`, antes y después.
4. **§3.4 Matriz visual** — **los 8 viewports**, no una muestra:
   - M01/M02: 390×844, 430×932, 768×1024, 844×390 × {claro, oscuro} con preview de 5+ filas Ready,
     más la medición numérica de altura del §4.2.
   - M04: 1440×900 × {claro, oscuro} × {ES, EN} del badge, para EMPLOYEE y para ADMIN con futuros.
   - M06: 1440×900 × {claro, oscuro} de la preview con los 4 casos representados.
   - Toda captura de overflow con `hide-scrollbars=false` (`UXR-F0-M05`).
5. **§3.6 Scorecards** — esta fase es la que debe mover `Responsive Task Completion`,
   `Viewport Economy` y `Modal Ergonomics` de `POOR`. Declara el rating alcanzado con su evidencia;
   si no llega al objetivo, dilo.
6. **§3.7 Baseline visual (nuevo)** — reejecuta la doble corrida y adjunta la salida de
   `compare-baseline-runs.mjs`. Estado esperado: `import-preview` deja de ser inestable. Si lo
   consigues, retira su entrada de `DECLARED_UNSTABLE_SCREENS` **en el mismo commit** y dilo en el
   gate; si no, explica qué queda y por qué, sin ampliar la tolerancia para que pase.
7. **§5** — `PASS` sólo con las 6 cerradas. Cualquier hueco → `PASS_WITH_GAPS` con motivo.

---

## 6 · REGLAS DE INTEGRIDAD

- **Ningún cambio de esta fase amplía permisos ni scopes.** Mejoras la presentación y la precisión del
  conteo; la autorización sigue siendo del servidor.
- **El preview sigue sin escribir durante el parse.** Es la fortaleza nº 1 del producto.
- **No conviertas un conteo impreciso en un descarte silencioso.** Si una fila queda excluida, se ve y
  se explica.
- Si un cambio de layout obliga a tocar `api/` o `db/`, **te has salido del alcance**: párate y
  reporta.
- Si encuentras defectos fuera de CX-F01/F04/F05, **documéntalos, no los arregles**.
- Si una instrucción contradice `AGENTS.md`, `MODAL_CONTRACT.md` o una decisión de `sdd/decisions/`,
  **detente y reporta la ambigüedad**.

---

## 7 · ENTREGA

1. Cambios acotados a los ficheros de §0, con tests que cubran cada AC.
2. Gate actualizado con evidencia real, incluidas las mediciones numéricas de altura.
3. `05_PROGRESS_LOG.md` y `03_IMPLEMENTATION_PLAN.md` sincronizados (breakpoint elegido, ubicación de
   la lógica extraída).
4. **Sin commit ni push** salvo autorización explícita. Reporta `git status` al final.
5. Resumen de **máximo 20 líneas**: estado por microtarea, gate resultante, rating alcanzado en las
   4 dimensiones `POOR`, y confirmación de que CX-F01 (el P1) queda cerrado o por qué no.
