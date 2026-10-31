# Checklist de validación — F2: base de vacaciones (Time Off) y feature flags (2026-10-31)

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development (F2 sobre `d92bbb7`)
**Spec canónica:** `docs/specs/SPEC-SHIFTIMPORT-PLANNING-SIMPLIFICATION-MOBILE-AND-VACATIONS.md` (F2, §20.1)
**Entorno de validación:** runtime local (`qa:dev-runtime`) → Neon `main`; escrituras solo en tenants sintéticos `E2E-SHIFT-<runId>`; migración probada antes en PostgreSQL 16 descartable.
**Datos:** sintéticos; 0 escrituras en `ShiftImport` real ni Groundforce (huella idéntica antes/después); residuo 0; 0 promociones.

## 1. Qué cambia
- **Migración `0050`** (aplicada en Neon `main` con tu autorización; 50 aplicadas, 0 pendientes): tabla `time_off_requests` (catálogo cerrado de tipos, exclusión de solapes vivos, `applied_start_date`/`applied_days`), sobre de aprobación con sujeto exclusivo (cambio de turno XOR vacaciones), `shifts.time_off_request_id`, notificaciones y auditoría ampliadas (superconjuntos). Aditiva: el código desplegado sigue funcionando.
- **Backend** (`TIME_OFF_ENABLED`, **apagado por defecto**; apagado ⇒ 404): `GET/POST /api/me/time-off-requests`, `GET …/impact`, `POST …/:id/cancel`. SELF por construcción (empleado y organización salen de la sesión). Solo `VACATION`; `SICK_LEAVE`/`PERMISSION`/`OTHER` ⇒ `422 TIME_OFF_TYPE_NOT_ENABLED`. Dominio (`time-off.js`) con la regla OD-08 y elegibilidad de aprobadores por scope real + política (`approval-eligibility.js`), que decide a quién se avisa al crear la solicitud.
- **UI** (`VITE_TIME_OFF_ENABLED`, **apagado por defecto**): «Vacaciones y ausencias» dentro de Solicitudes del empleado: solicitar (validación en línea, impacto en el calendario), ver el año, resumen, historial y cancelar.
- **Sin cambios** para el usuario con los dos flags apagados.

## 2. Ya comprobado por el agente
| Comprobación | Resultado |
| --- | --- |
| Migración en PostgreSQL 16 descartable: de cero, idempotente, aserciones (solape, XOR, FK de tenant, catálogo, rechazo con motivo, supersets) | PASS |
| `0050` en Neon `main` con el runner canónico | aplicada: 50 aplicadas, 0 pendientes |
| Huella de `ShiftImport` real antes/después del QA | idéntica (`c404cae6ec94…`); Groundforce no existe en esta BD |
| Flags OFF: 4 rutas ⇒ 404 con sesión válida y sin escribir; UI sin sección; `qa:local:smoke` | PASS |
| Dominio + elegibilidad + rutas (`test:f2`: 13 ficheros, 252 tests) | PASS |
| 14 pruebas de integración en PostgreSQL real (scope/política, tenant, año, impacto, compatibilidad) | PASS |
| E2E real, flag ON, tenants sintéticos (`time-off.spec.ts`) | 4/4 (+1/1 con flag OFF), residuo 0 |
| QA visual con `agent-browser` en el runtime real (empleado sintético): crear, listar, cancelar | PASS en 375 y 1440, sin scroll horizontal |
| Arnés accesibilidad/responsive (API simulada) 375/412/768/1440 × ES-oscuro / EN-claro | 129/129 (axe 0 graves, teclado, foco, `role=alert`, objetivos ≥ 24 px) |
| i18n ES/EN; notificación de tipo desconocido tolerada (R-06) | PASS |
| `eslint` (0 warnings), `tsc`, `build` | PASS |
| Ninguna suite amplia ni completa ejecutada | confirmado |

## 3. NOT_RUN / gaps
- **F3** (no iniciada): aprobar/rechazar, materializar en calendario y borradores, protección en importación y el efecto OD-08 real. En F2 solo existe la función de dominio y las columnas `applied_*`.
- Los flags **no están definidos en ningún entorno de Vercel**: la funcionalidad queda apagada hasta que decidas activarla (servidor primero, luego build).
- Un OWNER/ADMIN/PLANNER que también sea empleado puede usar la API, pero su pantalla (Centro de Solicitudes) es F4.
- Suite histórica amplia de `specs-qa-mirror`: deuda técnica no bloqueante de F1; no se ejecutó.

## 4. Para Toni
- Cuando quieras verla: `TIME_OFF_ENABLED=true` y `VITE_TIME_OFF_ENABLED=true` en el entorno de desarrollo, entra como empleado → Solicitudes → «Vacaciones y ausencias».
- Confirmar que el aviso al crear la solicitud (a quién llega según política y scope) coincide con lo que esperas antes de F3.
