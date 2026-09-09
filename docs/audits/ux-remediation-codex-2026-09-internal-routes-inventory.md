# UXR-F0-M03 — Inventario de rutas/superficies internas de App

Fuente: `TOOL_COMPATIBILITY_GAPS[1]` ("Vite App routes no detectadas inicialmente") de
`docs/audits/anclora-shiftimport-ux-reaudit-codex-2026-09-09.json`. Documento nuevo y separado de
`qa/e2e-acceptance/TEST-MATRIX.md` (esa matriz cubre ingesta de documentos — GS-xx/GN-xx — no
superficies de UX; instrucción explícita del prompt maestro de Fase 0 §2.7: no contaminarla).

`src/App.tsx` es una SPA con navegación por estado interno: sólo dos rutas URL reales existen.
Todo lo demás (modales, tabs, vistas) se alcanza por estado de React, invisible a un detector de
rutas por fichero/URL convencional. Este inventario es la entrada explícita que sustituye a ese
descubrimiento automático, verificado contra el código (no inferido).

## Rutas URL reales

| Ruta | Guardas | Componente |
|---|---|---|
| `/` | pública | `LandingPage` |
| `/pricing` | pública | `PricingPage` |
| `/login`, `/signup` | pública si no hay sesión; loading si sesión en vuelo | `AuthScreen` |
| `/forgot-password` | pública | `ForgotPasswordScreen` |
| `/reset-password` | pública | `ResetPasswordScreen` |
| `/privacy`, `/terms`, `/legal` | pública | `LegalPage` |
| `/app` | requiere `authResolved`; sesión opcional (invitado local-first permitido) | `AppShell` + calendario |
| `/app/schedule` | requiere `authResolved` + sesión no-EMPLOYEE (planner semanal) | `AppShell` + vista planner |

## Superficies internas por estado (no-URL) alcanzables desde `/app`

Verificado contra `src/App.tsx` y los componentes citados (rutas de fichero confirmadas con `find`).

| Superficie | Disparador (`data-testid` o prop) | Guarda de rol | Componente |
|---|---|---|---|
| Import individual | `[data-testid="sidebar-import"]` (`onImport`) | ninguna — disponible en invitado | `src/components/shift-dashboard/ImportModal.tsx` |
| Import propio (empleado) | `sidebar-self-import` (`onSelfImport`) | `session.role === 'EMPLOYEE' && session.employeeId` | `ImportModal.tsx` (modo self) |
| Añadir histórico propio | `sidebar-historical-add` (`onHistoricalAdd`) | EMPLOYEE con `employeeId` | `ImportModal.tsx` (modo histórico) |
| Solicitudes (empleado) | `sidebar-requests` (`onRequests`) | EMPLOYEE con `employeeId` | vistas `employee-portal/` |
| Planner semanal | `sidebar-planner` (`onPlanner`) → navega a `/app/schedule` | `session.role !== 'EMPLOYEE'` | vista planner en `App.tsx` |
| Añadir turno | `sidebar-add-shift` (`onAddShift`) | ninguna — disponible en invitado | modal inline en `App.tsx` |
| Aprobaciones | `sidebar-approvals` (`onApprovals`) | `PLANNER` o `isAdminRole(role)` | modal de aprobaciones |
| Equipo (bulk import) | `sidebar-team` (`onTeam`) | `isAdminRole(session.role)` — **requiere sesión autenticada** | `src/components/shift-dashboard/TeamImportModal.tsx` |
| Miembros/Usuarios | `sidebar-members` (`onMembers`) | `isAdminRole(session.role)` — **requiere sesión autenticada** | `src/components/shift-dashboard/MembersModal.tsx` (tabs `users`/`employees`) |
| Áreas | `sidebar-areas` (`onAreas`) | `isAdminRole(session.role)` — **requiere sesión autenticada** | modal de áreas |
| Historial de importaciones | `sidebar-history` | ninguna explícita revisada aquí | `src/components/shift-dashboard/ImportHistoryModal.tsx` |
| Ajustes / Tipos de turno | botón engranaje cabecera (`header.settingsAria`) | `isAdminRole(session.role)` para abrir con contexto de rol | `src/components/shift-dashboard/SettingsModal.tsx`, pestaña "Tipos de turno" |

## Consecuencia para la cobertura de Fase 2-4

Las superficies marcadas **"requiere sesión autenticada"** (Equipo, Miembros, Áreas) no son
alcanzables en modo invitado/local-first — bloquean cualquier captura de `CX-F05`/`CX-F07` que no
pase por `vercel dev` + Neon (ver `UXR-F0-M07` y el gate, sección de huecos declarados). El resto
(`ImportModal`, planner, ajustes) sí es alcanzable en invitado o requiere sólo una sesión EMPLOYEE
simple, no ADMIN+.

## Verificación de rutas de fichero citadas

Todos los ficheros de componente listados arriba se verificaron existentes con `find`/`ls` durante
la implementación de esta Fase 0 (no se citan por inferencia).
