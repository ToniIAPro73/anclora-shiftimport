# PROMPT MAESTRO — Ejecución de FASE 4 · Cierre de evidencia
## `UXR-F4-M01` … `UXR-F4-M12` · Históricos F1/F2/F5/F6/F8/F9 + 10 flags de cobertura
## Gate: `docs/roadmap/UXR-F4-EVIDENCE-CLOSURE-GATE.md` · cierra `UXR-MASTER-GATE.md`

> **Uso**: entregar íntegramente como prompt inicial a un agente IA con acceso de lectura/escritura
> al repositorio `anclora-shiftimport`, rama `development`.

---

## 0 · ROL Y MISIÓN

Eres un **auditor de QA**. Esta fase **no corrige findings**: cierra los huecos de evidencia que
hicieron que la auditoría Codex terminara en `PASS_WITH_GAPS` en vez de `PASS`.

Tu producto no es código. Es **una respuesta defendible a doce preguntas abiertas**:
- 2 históricos que nunca se reprobaron (`NOT_RETESTED`): F2 y F9.
- 4 históricos cerrados a medias (`PARTIALLY_FIXED`): F1, F5, F6, F8.
- 10 flags de cobertura en `false`: publish, approval, safe delete, idempotencia, team import,
  export de credenciales, OWNER, PLANNER, staging, preview.

**La tentación de esta fase es marcar casillas.** Resístela. Un `NOT_EVALUATED` con motivo vale más
que un `PASS` sin artefacto — y es exactamente lo que la auditoría original hizo bien.

### Qué puedes tocar
✅ `docs/audits/**`, `docs/roadmap/UXR-*`, `sdd/features/ux-remediation-codex-2026-09/**`,
`qa/e2e-acceptance/**`.
✅ `AGENTS.md` y `README.md` — **sólo** para `UXR-F4-M04` (§4.3).

### Qué NO puedes tocar
❌ `src/`, `api/`, `db/migrations/`, `vercel.json`. **Si un retest revela un defecto, lo documentas
como finding nuevo; no lo arreglas aquí.** Un arreglo dentro de la fase de verificación destruye la
independencia de la evidencia.
❌ Producción, secretos, `git push`, despliegues.

### Precondición
Fases 0–3 cerradas. Dependencias duras:
`M03`←`UXR-F2-M04`+`F0-M07` · `M05`←`UXR-F3-M02` · `M06`←`UXR-F2-M04` · `M07`←`F0-M07` ·
`M08`←`UXR-F3-M03`+`M04`+`F0-M07` · `M10`←`F1-M04`+`F2-M05`+`F2-M06`+`F3-M05`+`F3-M06` ·
`M12`←`F0-M01`+`F0-M08`.

---

## 1 · ENTRADAS OBLIGATORIAS

| # | Ruta | Uso |
|---|------|-----|
| 1 | `AGENTS.md` (raíz) | Convenciones y prohibiciones |
| 2 | `03_IMPLEMENTATION_PLAN.md` **líneas 1272–1820** | Las 12 microtareas literales |
| 3 | `docs/roadmap/UXR-F4-EVIDENCE-CLOSURE-GATE.md` y `UXR-MASTER-GATE.md` | AC y cierre global |
| 4 | `docs/audits/…-codex-2026-09-09.json` → **§35 `historical_regression`** y `evidence_coverage` | Los veredictos históricos y los flags a cerrar |
| 5 | `qa/e2e-acceptance/TEST-MATRIX.md` | Matriz de ingesta existente + **URL de preview** (§2.1) |
| 6 | Baseline y manifiesto de `UXR-F0-M08` | Referencia visual contra la que comparas |

---

## 2 · ESTADO REAL DEL REPO — CORRECCIONES A LA SPEC

### 2.1 `UXR-F4-M12` — la URL de preview **no es `UNKNOWN`**
La auditoría declara `staging_url: UNKNOWN` y `preview_url: UNKNOWN`, y la spec lo hereda. Pero
`qa/e2e-acceptance/TEST-MATRIX.md` (líneas 3-4) ya documenta un despliegue de preview real de la rama
`development` en Vercel, con su deployment id y su SHA.

→ **Empieza por ahí**: verifica si esa URL sigue viva y si corresponde al HEAD actual. Si sirve,
`PREVIEW_BROWSER_COVERED` se puede cerrar de verdad. Para `STAGING_BROWSER_COVERED`: si el proyecto
**no tiene** un entorno de staging distinto del preview de rama, el resultado correcto es
**`NOT_APPLICABLE` documentado**, no `false` perpetuo ni un `PASS` inventado. Decláralo con esa
distinción.

⚠️ Medir contra preview/producción es **sólo lectura**. No ejecutes mutaciones fuera de local.

### 2.2 `UXR-F4-M04` — el desajuste documental, verificado
`AGENTS.md` describe el producto como *"Premium B2C"* con *"persistencia local-first en
`localStorage`"*, mientras el modelo real ya es multi-tenant B2B (`Organization` / `Membership` /
OWNER-ADMIN-PLANNER-EMPLOYEE, Neon). **Ambas descripciones son parcialmente ciertas**: el producto
opera en modo dual (local-first para invitado/Personal, multi-tenant para Team). La corrección es
reflejar la dualidad, no sustituir una mentira por otra.

Ésta es **la única microtarea de Fase 4 que edita ficheros del repo fuera de docs de auditoría**.

### 2.3 Tests unitarios que ya cubren parte del terreno
No repitas trabajo hecho; úsalos como punto de partida y di explícitamente qué añade tu verificación
de navegador sobre ellos:

| Microtarea | Test existente relacionado |
|---|---|
| `M09` (idempotencia) | `src/lib/import-dedup.test.ts` |
| `M11` (credenciales) | `src/lib/credentials-export.test.ts` |
| `M08` (ciclo completo) | `src/lib/scenarios-a-g.test.ts`, `ApprovalInbox.test.tsx` |
| `M01` (gate Personal) | `src/lib/plans.test.ts`, `UpgradePrompt.test.tsx` |
| `M02` (onboarding) | `src/lib/onboarding.test.ts`, `organization-onboarding.test.ts`, `OnboardingModal.test.tsx` |

⚠️ **Un test unitario verde no cierra un flag de cobertura.** Los flags son de *cobertura de
navegador con rol real*. Es la regla `composed_skill_coverage_rules`: `COMPLETED ≠ cobertura
material`.

### 2.4 Cuentas disponibles (de `UXR-F0-M07`)
`qa/e2e-acceptance/local-setup.ts` siembra OWNER (`owner@e2e.test`, `owner-b@e2e.test`), PLANNER con
área, sin área y global, ADMIN y EMPLOYEE, en tres organizaciones (A `team`, B `company`,
Fresh `personal`). **`M01` necesita además una cuenta de plan Personal** y **`M02` una cuenta sin
organización**: comprueba si Org Fresh (`personal`) sirve para M01 antes de provisionar nada nuevo.

---

## 3 · ORDEN DE EJECUCIÓN

```
Bloque A — Documentación y verificación sin mutación (empieza aquí, riesgo cero)
  UXR-F4-M04  contrato documental AGENTS/README        ← único que edita el repo
  UXR-F4-M05  cierre histórico F6 (tras F3-M01/M02)
  UXR-F4-M06  cierre histórico F8 (tras F2-M04)
  UXR-F4-M12  staging / preview                        ← §2.1

Bloque B — Retests que requieren cuentas nuevas, sin mutación destructiva
  UXR-F4-M01  histórico F2 · gate Personal
  UXR-F4-M02  histórico F9 · onboarding sin organización
  UXR-F4-M07  journeys OWNER y PLANNER
  UXR-F4-M11  export de credenciales de un solo uso

Bloque C — Mutación real, sintética y aislada (requiere autorización explícita)
  UXR-F4-M03  histórico F1 · persistencia postcommit
  UXR-F4-M10  team import completo
  UXR-F4-M08  ciclo publicar→acuse→solicitud→resolución
  UXR-F4-M09  safe delete + idempotencia               ← el más destructivo, el último
```

---

## 4 · LOS PUNTOS DIFÍCILES

### 4.1 El Bloque C exige autorización explícita, y no la tienes por defecto
Publicar, confirmar, borrar, reimportar y exportar credenciales son **mutaciones reales**. Las reglas
del workspace y la propia auditoría lo condicionan a *"datos aislados y autorización específica de
mutaciones"*.

**Antes de ejecutar el Bloque C**: enumera al usuario exactamente qué vas a mutar, sobre qué
organización sintética, y pide autorización. Si no la obtienes, esas microtareas quedan
`NOT_EVALUATED` con motivo — y el gate queda `PASS_WITH_GAPS`. **Eso es un resultado legítimo**, no un
fracaso.

Condición transversal de la fase, verificable en cada mutación: **turnos manuales e imports ajenos
deben sobrevivir**. Compruébalo explícitamente después de cada operación destructiva.

### 4.2 Los retests históricos exigen un veredicto, no un informe
`M01` y `M02` tienen el mismo AC en el fondo: *"se declara `FIXED`, `PARTIALLY_FIXED`, `REGRESSED` o
`NOT_APPLICABLE` con evidencia, **nunca `NOT_RETESTED` de nuevo**"*.

Ojo con **F9**: la auditoría advierte que *"signup no es el mismo formulario"* y que su confianza
histórica es baja. Si el formulario cambió estructuralmente, el veredicto correcto es
`NOT_APPLICABLE` **con la explicación de por qué el caso histórico ya no existe** — no un `FIXED`
cómodo ni otro `NOT_RETESTED`.

Ojo con **F2**: la auditoría dice *"código de gating presente, insuficiente para FIXED"*. Leer el
código no es reprobar el caso. Necesitas recorrer el flujo con una cuenta Personal real y observar
**en qué punto** aparece el gate — antes o después del formulario largo. Ése era el finding.

### 4.3 `UXR-F4-M05` — prohibido el veredicto agregado
El histórico F6 agrupaba **tres** cosas: editor modal (E022), tabla semanal (E023) y métricas (E014).
El AC lo dice: *"cada uno se declara `FIXED` o se documenta explícitamente qué queda pendiente, **sin
agregarlos en un único veredicto**"*. Un `PARTIALLY_FIXED` global es precisamente el resultado opaco
que esta microtarea existe para no repetir.

### 4.4 `UXR-F4-M06` — se compara contra la promesa comercial
Es el único cierre que cruza superficies: el resumen de import (APPLICATION, tras `UXR-F2-M04`) contra
la promesa de "calendario listo" de la landing (LANDING_PAGE, E027). El riesgo histórico es **"hacer
pasar importado por publicado"**. Retoma E027 con la baseline actual y ponlas lado a lado.

### 4.5 `UXR-F4-M09` — el más peligroso, y el que más fácil se falsea
Idempotencia significa **reimportar el mismo documento dos veces** y verificar que no duplica.
Safe delete significa **borrar un turno importado** y verificar que no arrastra otros. Ambos exigen
estado previo conocido y verificación posterior. Ejecútalo el último, sobre la organización sintética
más aislada que tengas, y captura el estado **antes y después** de cada operación.

### 4.6 `M07` — cobertura de rol es recorrido, no login
`OWNER_COVERED` / `PLANNER_COVERED` no se cierran iniciando sesión y haciendo una captura. Se cierran
recorriendo los journeys que esos roles tienen y que ADMIN/EMPLOYEE no cubren: para OWNER,
transferencia de propiedad y gestión de plan; para PLANNER, los tres modos de scope
(`ORGANIZATION`, `AREAS`, `EMPLOYEES`) de `ADR-2026-09-07` D5 — y hay cuentas sembradas para los tres.

---

## 5 · GATE — CÓMO CERRARLO

Actualiza `docs/roadmap/UXR-F4-EVIDENCE-CLOSURE-GATE.md` y después `UXR-MASTER-GATE.md`:

1. **§3.1** — los AC de las 12 microtareas, cada uno con artefacto o con `NOT_EVALUATED` + motivo.
2. **Tabla de veredictos históricos** — obligatoria, una fila por histórico:

   | Histórico | Estado auditoría 2026-09-09 | Veredicto ahora | Evidencia | Finding actual |
   |---|---|---|---|---|
   | F1 | PARTIALLY_FIXED | | | CX-F04 |
   | F2 | NOT_RETESTED | | | — |
   | F5 | PARTIALLY_FIXED | | | — |
   | F6 | PARTIALLY_FIXED | | | CX-F02 |
   | F8 | PARTIALLY_FIXED | | | CX-F04 |
   | F9 | NOT_RETESTED | | | — |

   (F3, F4, F7 ya estaban `FIXED`: confirma que **no han regresado** y déjalo escrito.)

3. **Tabla de flags de cobertura** — los 10 en `false`, cada uno con su valor nuevo
   (`true` / `PARTIAL` / `NOT_APPLICABLE` / sigue `false` + motivo):
   `PUBLISH_COVERED`, `APPROVAL_COVERED`, `SAFE_DELETE_COVERED`, `IDEMPOTENCY_COVERED`,
   `TEAM_IMPORT_COVERED`, `CREDENTIAL_EXPORT_COVERED`, `OWNER_COVERED`, `PLANNER_COVERED`,
   `STAGING_BROWSER_COVERED`, `PREVIEW_BROWSER_COVERED`.
4. **§3.3** — `npm test && npx tsc --noEmit && npm run lint && npm run build`. En esta fase el diff de
   `src/` debe ser **nulo**: es la prueba de que la verificación fue independiente. Si no lo es,
   explica por qué.
5. **`UXR-MASTER-GATE.md`** — cierre global. Debe declarar:
   - Los 10 findings (CX-F01…CX-F09 + CX-E01) con su estado final.
   - El estado de las 5 fases.
   - Las 8 entradas DO_NOT_BREAK verificadas de punta a punta.
   - Los scorecards `POOR` de la auditoría (`Accessibility`, `Responsive Task Completion`,
     `Viewport Economy`, `Modal Ergonomics`) con su rating alcanzado y evidencia.
   - **El veredicto global**: `PASS` sólo si todo lo anterior tiene artefacto. En cualquier otro caso,
     `PASS_WITH_GAPS` con la lista explícita de lo que quedó abierto.

---

## 6 · REGLAS DE INTEGRIDAD

- **`COMPLETED ≠ cobertura material.`** Un comando que termina sin error no ha medido nada por sí
  solo.
- **`PARTIAL` y `NOT_EVALUATED` son resultados legítimos y deben declararse.** Ocultarlos invalida
  toda la fase.
- **No arregles lo que encuentres.** Un defecto detectado en el retest se documenta como finding
  nuevo, con su severidad y evidencia, para una fase posterior.
- **No uses el roadmap ni un test unitario para declarar `FIXED`.** Es literalmente el error que la
  auditoría señala en F9: *"no usar roadmap ni validación de otro campo para declarar FIXED"*.
- **Distingue herramienta y entorno** en cada medición (`@playwright/test` / `agent-browser` /
  manual; `LOCAL_BUILD` / `PREVIEW` / `PRODUCTION`), según fijaste en Fase 0.
- Ninguna mutación fuera de datos sintéticos aislados y con autorización explícita.
- Si una instrucción contradice `AGENTS.md` o un contrato de `docs/standards/`, **detente y reporta la
  ambigüedad**.

---

## 7 · ENTREGA

1. Evidencia archivada según el manifiesto de `UXR-F0-M08` (capturas en ruta ignorada, manifiesto
   versionado).
2. `UXR-F4-EVIDENCE-CLOSURE-GATE.md` con las dos tablas de §5 completas.
3. `UXR-MASTER-GATE.md` cerrado con el veredicto global.
4. `06_FINAL_REPORT.md` relleno: checklist de calidad de la spec (los 10 findings, los AC del JSON,
   las 8 DO_NOT_BREAK, los 6 tool gaps, los 9 históricos, los 10 flags) y tabla de trazabilidad
   `finding → microtareas → gate → evidencia`.
5. `AGENTS.md` / `README.md` actualizados **sólo** por `UXR-F4-M04`.
6. **Sin commit ni push** salvo autorización explícita. Reporta `git status` al final.
7. Resumen de **máximo 25 líneas**: veredicto de los 6 históricos, valor final de los 10 flags,
   gate de fase, veredicto del master gate, y **qué queda abierto para una futura re-auditoría**.
