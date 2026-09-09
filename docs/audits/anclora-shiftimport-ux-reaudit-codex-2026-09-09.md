# Anclora ShiftImport — Auditoría UX/UI Codex · 2026-09-09

STATUS: PASS_WITH_GAPS


## 01 · Evaluación ejecutiva

ShiftImport ya ofrece una base operativa más amplia que un importador individual: contexto organizativo, personas y accesos separados, planificación semanal, solicitudes e historial. La auditoría no certifica un ciclo multi-tenant completo: producción se recorrió sin sesión; Admin y Employee se verificaron con cuentas sintéticas existentes en ejecución local conectada a Neon dev. Owner y Planner como identidades independientes siguen sin cobertura. El problema más importante observado es la desaparición del área editable del importador en móvil. La seguridad declarada por el backend no equivale a confianza percibida: los resúmenes de importación temporal y provisioning necesitan precisión.


### Registro

**aspecto**: Mayor fricción

**conclusión**: La lista de cinco turnos tiene 0 px de altura a 390×844 y 844×390. F01.


### Registro

**aspecto**: Mayor simplificación

**conclusión**: Colapsar la selección de archivo después del parse y dar prioridad a la revisión.


### Registro

**aspecto**: Carga cognitiva

**conclusión**: Unificar el punto de entrada a personas, accesos y provisioning. F07.


### Registro

**aspecto**: Quick win

**conclusión**: Nombres accesibles por fila y sincronización del idioma del documento. F03/F08.


### Registro

**aspecto**: Oportunidad estructural

**conclusión**: Integrar el detalle y acuse de turno en el shell Employee activo. F06.


### Registro

**aspecto**: Superficie premium

**conclusión**: Conservar la identidad navy/verde; reducir chrome persistente y mensajes contradictorios antes de añadir decoración.


## 02 · Qué ha cambiado desde el 5 de septiembre

La referencia original declara nueve findings. El PDF disponible tiene 22 páginas y se interrumpe durante F5; F6–F9 se reconstruyen mediante referencias cruzadas explícitas del roadmap, no inventando títulos literales. Hay correcciones verificadas y otras solo parciales. No se interpreta una lista más larga de hallazgos como un empeoramiento del producto. La base comparativa de Claude es 42515c3; el HEAD actual añade documentación. No se ha demostrado qué SHA exacto está desplegado.


## 03 · Claude frente a Codex

Cambio de cobertura: Admin y Employee reales en entorno local con backend dev, ocho viewports de calendario, más estados del importador y provisioning. Cambio de método: dispatcher AOS ejecutado, rutas corregidas con evidencia real, hallazgos calibrados por condiciones y entorno. No se atribuyen diferencias al agente como capacidad personal.


### Registro

**dimensión**: HEAD

**Claude**: 42515c3

**Codex**: 42ff86995ad8a486af79d9d900ab3b069fff4a8e


### Registro

**dimensión**: Capturas browser catalogadas

**Claude**: 15

**Codex**: 62


### Registro

**dimensión**: Roles autenticados

**Claude**: Ninguno

**Codex**: ADMIN y EMPLOYEE; LOCAL_BUILD. OWNER y PLANNER no.


### Registro

**dimensión**: Viewports

**Claude**: 1440×900 y 390×844 declarados

**Codex**: 390×844; 430×932; 768×1024; 1024×768; 1366×768; 1440×900; 1728×1117; 844×390. Cobertura por pantalla desigual.


### Registro

**dimensión**: Journeys

**Claude**: No inventario equivalente de 65 fichas

**Codex**: 65 candidatos, cada uno con resultado y límite; no 65 completados.


### Registro

**dimensión**: Composición AOS

**Claude**: No ejecutada según informe

**Codex**: 7 invocaciones; visual regression bloqueada; i18n/DS sin cobertura material suficiente.


### Registro

**dimensión**: Nuevas áreas

**Claude**: AUTH_BLOCKED

**Codex**: Equipo, roles, áreas, asignaciones, wizard de persona, historial vacío, borrador semanal, solicitud Employee, bulk preview, formatos vacíos.


### Registro

**dimensión**: Desacuerdos

**Claude**: F01 CRITICAL; F02 postparse disabled

**Codex**: F01 de Claude parcialmente confirmado y recalibrado; F02 parcialmente confirmado solo en diagnóstico bloqueante.


## 04 · Delta metodológico e integridad

Talent (Codex, 2026-09-09) se utilizó como referencia de profundidad: modelo, tareas, fichas de journey, mapas, evidencia y límites. Su JSON contiene 90 evidencias y 18 findings, que no se trasplantan aquí. No se pretende equivalencia numérica. El paquete actual distingue superficie, entorno, alcance del finding y NOT_EVALUATED. El PDF histórico no permite identificar con certeza su hash de skill: HISTORICAL_SKILL=UNKNOWN. El informe de Claude usa las mismas nociones surface-aware, pero declara menor cobertura autenticada. Las diferencias presentes son principalmente COVERAGE_CHANGE, METHODOLOGY_CHANGE y EVIDENCE_RECALIBRATION; PRODUCT_CHANGE solo donde el código/historia lo sostienen.


## 05 · Contrato de la skill

CURRENT_INSTALLED_SKILL_WINS. Se leyeron SKILL.md, skill.yaml, RELEASE_NOTES y runtime/contracts relevantes; VALIDATION.md no existe. Los tests de routing, perfiles, scopes, niveles y cobertura se inspeccionaron; no se modificó ni se reejecutó la batería de la skill.


### skill_version

**campo**: skill_version

**valor**: 1.5.0 (SKILL.md); manifest/runtime envelope 1.4.0


### skill_source_path

**campo**: skill_source_path

**valor**: /Users/toni/Developer/anclora/anclora-infrastructure/skills/ux-product-experience-review


### skill_contract_sha

**campo**: skill_contract_sha

**valor**: d53718eac916e117d72ec1196a1d6ffc648fe3f842c7db9752fe9903fb7bf12c


### skill_package_version_drift

**campo**: skill_package_version_drift

**valor**: True


### validation_md

**campo**: validation_md

**valor**: ABSENT


### surface_mode_schema

**campo**: surface_mode_schema

**valor**: [
  "APPLICATION",
  "LANDING_PAGE",
  "MARKETING_SITE",
  "PUBLIC_PRODUCT_SITE",
  "DASHBOARD",
  "PORTAL",
  "ECOMMERCE"
]


### platform_mode_schema

**campo**: platform_mode_schema

**valor**: [
  "WEB",
  "MOBILE",
  "DESKTOP",
  "PWA",
  "CROSS_PLATFORM"
]


### application_profile_schema

**campo**: application_profile_schema

**valor**: Common UX/UI + Application Shell, Viewport Economy, Primary Workspace, Workflow Efficiency, Context Management; no workforce-specific extension invented.


### secondary_surface_schema

**campo**: secondary_surface_schema

**valor**: Same surface enum; separate contextual evaluation, no blended score.


### evidence_model

**campo**: evidence_model

**valor**: [
  "MEASURED_BROWSER",
  "MEASURED_CODE",
  "DECLARED_CONTRACT",
  "DECLARED_DOCS",
  "INFERRED",
  "UNKNOWN"
]


### finding_scope_schema

**campo**: finding_scope_schema

**valor**: [
  "PRODUCT_UX",
  "PRODUCT_ACCESS",
  "ENGINEERING_SUPPORT",
  "EXTERNAL_INFRASTRUCTURE",
  "COMPLIANCE_REVIEW"
]


### browser_environment_schema

**campo**: browser_environment_schema

**valor**: [
  "PRODUCTION",
  "STAGING",
  "PREVIEW",
  "LOCAL_BUILD",
  "UNKNOWN"
]


### scorecard_schema

**campo**: scorecard_schema

**valor**: [
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "POOR",
  "CRITICAL",
  "NOT_EVALUATED",
  "NOT_APPLICABLE"
]


### finding_schema

**campo**: finding_schema

**valor**: Finding Model v2, section 29; implementation-ready P1/P2 section 35. Full fields retained below.


### composed_skill_coverage_rules

**campo**: composed_skill_coverage_rules

**valor**: Execution COMPLETED is not material coverage. Unsupported framework / locales / unexecuted screenshots produce TOOL_COMPATIBILITY_GAP.


### legal_compliance_guard

**campo**: legal_compliance_guard

**valor**: No definitive legal conclusion from UX evidence. Any material legal finding would be COMPLIANCE_REVIEW / LEGAL_REVIEW_REQUIRED. No such finding established.


### routing

**campo**: routing

**valor**: Override APPLICATION/WEB. Raw file-route scanner inferred LANDING_PAGE and emitted mismatch; rerun with browser-observed /app and /app/schedule yields APPLICATION, HIGH, no mismatch. Initial warning retained as tool gap, not concealed.


### surface_mode_source

**campo**: surface_mode_source

**valor**: OVERRIDE


### surface_mode_confidence

**campo**: surface_mode_confidence

**valor**: HIGH


### surface_mode_auto_detected

**campo**: surface_mode_auto_detected

**valor**: False


### autodetection_executed

**campo**: autodetection_executed

**valor**: True


### surface_mode_confirmed_by_browser

**campo**: surface_mode_confirmed_by_browser

**valor**: True


## 06 · Superficies y provenance

APPLICATION es la superficie principal observada en /app y /app/schedule. Landing, pricing y contenido legal público se evalúan como LANDING_PAGE secundaria contextual. PORTAL no es una superficie activa distinta: PortalShell no se importa en el árbol productivo actual; el Employee usa el shell común. Esto no hace irrelevante su experiencia: se audita en APPLICATION. LOCAL_BUILD significa Vite local sobre código actual con API original y Neon dev; no un deployment ni una build optimizada certificada.


### status

**campo**: status

**valor**: PASS_WITH_GAPS


### date

**campo**: date

**valor**: 2026-09-09


### mode

**campo**: mode

**valor**: AUDIT_WITH_REPO_CONTEXT


### current_head

**campo**: current_head

**valor**: 42ff86995ad8a486af79d9d900ab3b069fff4a8e


### remote_head

**campo**: remote_head

**valor**: 42ff86995ad8a486af79d9d900ab3b069fff4a8e


### local_remote_match

**campo**: local_remote_match

**valor**: True


### branch

**campo**: branch

**valor**: development


### initial_worktree

**campo**: initial_worktree

**valor**: CLEAN


### primary_surface

**campo**: primary_surface

**valor**: APPLICATION


### secondary_surfaces

**campo**: secondary_surfaces

**valor**: [
  "LANDING_PAGE"
]


### platform_mode

**campo**: platform_mode

**valor**: WEB


### domain_profile

**campo**: domain_profile

**valor**: NONE (runtime UNSPECIFIED)


### canonical_frontend_url

**campo**: canonical_frontend_url

**valor**: https://shiftimport.anclora.com


### production_url

**campo**: production_url

**valor**: https://shiftimport.anclora.com


### staging_url

**campo**: staging_url

**valor**: UNKNOWN


### preview_url

**campo**: preview_url

**valor**: UNKNOWN


### local_build_url

**campo**: local_build_url

**valor**: http://127.0.0.1:3199


### deployed_head_match

**campo**: deployed_head_match

**valor**: UNKNOWN


### production_asset

**campo**: production_asset

**valor**: /assets/index-BZcj0Xiu.js


### product_code_modified

**campo**: product_code_modified

**valor**: False


### operational_database_modified

**campo**: operational_database_modified

**valor**: False


### database_modified

**campo**: database_modified

**valor**: AUTH_SESSION_WRITES_ONLY


### deployment_modified

**campo**: deployment_modified

**valor**: False


### audit_phase_commit_performed

**campo**: audit_phase_commit_performed

**valor**: False


### audit_phase_push_performed

**campo**: audit_phase_push_performed

**valor**: False


### post_audit_publication

**campo**: post_audit_publication

**valor**: Commit/push/promotion authorized by user; publication SHA is recorded by Git history and delivery message.


### packaging_base_head

**campo**: packaging_base_head

**valor**: 26a2ec4c06547145efac8d987c9e97bf6b7a29ce


### promotion_authorization

**campo**: promotion_authorization

**valor**: User explicitly authorized commit, push and alignment of canonical branches after audit; original read-only audit phase preserved.


## 07 · Modelo actual del producto

El objeto de acceso es User; el vínculo de seguridad es Membership; la persona que recibe turnos es Employee. Una Organization contiene áreas, personas, importaciones y planificación. Un Employee puede no tener acceso. Safe Import transforma documentos en candidatos editables: no escribe durante el parse. La confirmación separa históricos y futuros; estos últimos pueden dirigirse a borradores que requieren publicación. El Employee tiene importación histórica propia y solicitudes en el calendario común. Persistencia local-first para invitado convive con persistencia remota autenticada. La transición no debe explicarse al usuario como arquitectura: debe expresarse como qué se guardará, dónde y quién podrá verlo.


### Registro

**entidad**: Organization

**responsabilidad**: Límite de pertenencia y plan; personal/company en contrato.


### Registro

**entidad**: Membership

**responsabilidad**: OWNER/ADMIN/PLANNER/EMPLOYEE; scope organizativo, áreas o empleados según modelo vigente.


### Registro

**entidad**: User ≠ Employee

**responsabilidad**: Acceso autenticado separado de ficha operativa; vínculo opcional user_id.


### Registro

**entidad**: Shift / Import

**responsabilidad**: Turno org+employee; import_id atribuye procedencia y borrado selectivo.


### Registro

**entidad**: Schedule / version / assignment

**responsabilidad**: Planificación semanal editable/publicable, separada de turno operativo.


### Registro

**entidad**: FormatProfile

**responsabilidad**: Memoria de interpretación versionada y aislada por organización.


## 08 · Inventario de capacidades

LIVE_BROWSER_VERIFIED significa solamente la capacidad y estado descritos en la columna de evidencia. No se eleva código a observación visual. Las capacidades parcialmente verificadas conservan PARTIAL aunque una pantalla inicial funcione.


### PUBLIC_LANDING

**capability**: PUBLIC_LANDING

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### AUTH

**capability**: AUTH

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### SIGN_IN

**capability**: SIGN_IN

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### GUEST_MODE

**capability**: GUEST_MODE

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### SESSION

**capability**: SESSION

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### LIGHT_THEME

**capability**: LIGHT_THEME

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### DARK_THEME

**capability**: DARK_THEME

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### ES

**capability**: ES

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### EN

**capability**: EN

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### COOKIE

**capability**: COOKIE

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### PRIVACY

**capability**: PRIVACY

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### LEGAL

**capability**: LEGAL

**status**: LIVE_BROWSER_VERIFIED

**evidence**: Producción pública/invitada E004,E025–E043,E065; login Admin/Employee LOCAL_BUILD E003,E026. No certifica cada estado.


### SIGN_UP

**capability**: SIGN_UP

**status**: PARTIAL

**evidence**: UI/configuración y código; alta/transferencia no ejecutadas; Owner y Planner sin identidad browser. Admin y Employee sí.


### ORGANIZATIONS

**capability**: ORGANIZATIONS

**status**: PARTIAL

**evidence**: UI/configuración y código; alta/transferencia no ejecutadas; Owner y Planner sin identidad browser. Admin y Employee sí.


### OWNER

**capability**: OWNER

**status**: PARTIAL

**evidence**: UI/configuración y código; alta/transferencia no ejecutadas; Owner y Planner sin identidad browser. Admin y Employee sí.


### PLANNER

**capability**: PLANNER

**status**: PARTIAL

**evidence**: UI/configuración y código; alta/transferencia no ejecutadas; Owner y Planner sin identidad browser. Admin y Employee sí.


### ORGANIZATION_SCOPE

**capability**: ORGANIZATION_SCOPE

**status**: PARTIAL

**evidence**: UI/configuración y código; alta/transferencia no ejecutadas; Owner y Planner sin identidad browser. Admin y Employee sí.


### AREA_SCOPE

**capability**: AREA_SCOPE

**status**: PARTIAL

**evidence**: UI/configuración y código; alta/transferencia no ejecutadas; Owner y Planner sin identidad browser. Admin y Employee sí.


### ROLE_ASSIGNMENT

**capability**: ROLE_ASSIGNMENT

**status**: PARTIAL

**evidence**: UI/configuración y código; alta/transferencia no ejecutadas; Owner y Planner sin identidad browser. Admin y Employee sí.


### ROLE_CHANGE

**capability**: ROLE_CHANGE

**status**: PARTIAL

**evidence**: UI/configuración y código; alta/transferencia no ejecutadas; Owner y Planner sin identidad browser. Admin y Employee sí.


### OWNERSHIP_TRANSFER

**capability**: OWNERSHIP_TRANSFER

**status**: PARTIAL

**evidence**: UI/configuración y código; alta/transferencia no ejecutadas; Owner y Planner sin identidad browser. Admin y Employee sí.


### ADMIN

**capability**: ADMIN

**status**: LIVE_BROWSER_VERIFIED

**evidence**: LOCAL_BUILD E006–E008,E026,E038–E040,E045,E050. Listas sintéticas pequeñas; mutaciones no verificadas.


### EMPLOYEE

**capability**: EMPLOYEE

**status**: LIVE_BROWSER_VERIFIED

**evidence**: LOCAL_BUILD E006–E008,E026,E038–E040,E045,E050. Listas sintéticas pequeñas; mutaciones no verificadas.


### USERS

**capability**: USERS

**status**: LIVE_BROWSER_VERIFIED

**evidence**: LOCAL_BUILD E006–E008,E026,E038–E040,E045,E050. Listas sintéticas pequeñas; mutaciones no verificadas.


### EMPLOYEES

**capability**: EMPLOYEES

**status**: LIVE_BROWSER_VERIFIED

**evidence**: LOCAL_BUILD E006–E008,E026,E038–E040,E045,E050. Listas sintéticas pequeñas; mutaciones no verificadas.


### MEMBERSHIPS

**capability**: MEMBERSHIPS

**status**: LIVE_BROWSER_VERIFIED

**evidence**: LOCAL_BUILD E006–E008,E026,E038–E040,E045,E050. Listas sintéticas pequeñas; mutaciones no verificadas.


### AREAS

**capability**: AREAS

**status**: LIVE_BROWSER_VERIFIED

**evidence**: LOCAL_BUILD E006–E008,E026,E038–E040,E045,E050. Listas sintéticas pequeñas; mutaciones no verificadas.


### SELF_SCOPE

**capability**: SELF_SCOPE

**status**: LIVE_BROWSER_VERIFIED

**evidence**: LOCAL_BUILD E006–E008,E026,E038–E040,E045,E050. Listas sintéticas pequeñas; mutaciones no verificadas.


### SHIFT_TYPES

**capability**: SHIFT_TYPES

**status**: PARTIAL

**evidence**: E010–E013,E041,E046,E048,E049,E052,E054,E056,E059–E064. CSV/XLSX generan filas; PDF/imagen probados en estados unsupported. No confirma persistencia.


### SAFE_IMPORT

**capability**: SAFE_IMPORT

**status**: PARTIAL

**evidence**: E010–E013,E041,E046,E048,E049,E052,E054,E056,E059–E064. CSV/XLSX generan filas; PDF/imagen probados en estados unsupported. No confirma persistencia.


### INDIVIDUAL_IMPORT

**capability**: INDIVIDUAL_IMPORT

**status**: PARTIAL

**evidence**: E010–E013,E041,E046,E048,E049,E052,E054,E056,E059–E064. CSV/XLSX generan filas; PDF/imagen probados en estados unsupported. No confirma persistencia.


### IMPORT_PREVIEW

**capability**: IMPORT_PREVIEW

**status**: PARTIAL

**evidence**: E010–E013,E041,E046,E048,E049,E052,E054,E056,E059–E064. CSV/XLSX generan filas; PDF/imagen probados en estados unsupported. No confirma persistencia.


### IMPORT_VALIDATION

**capability**: IMPORT_VALIDATION

**status**: PARTIAL

**evidence**: E010–E013,E041,E046,E048,E049,E052,E054,E056,E059–E064. CSV/XLSX generan filas; PDF/imagen probados en estados unsupported. No confirma persistencia.


### FORMAT_ASSISTANT

**capability**: FORMAT_ASSISTANT

**status**: PARTIAL

**evidence**: E010–E013,E041,E046,E048,E049,E052,E054,E056,E059–E064. CSV/XLSX generan filas; PDF/imagen probados en estados unsupported. No confirma persistencia.


### CSV_IMPORT

**capability**: CSV_IMPORT

**status**: PARTIAL

**evidence**: E010–E013,E041,E046,E048,E049,E052,E054,E056,E059–E064. CSV/XLSX generan filas; PDF/imagen probados en estados unsupported. No confirma persistencia.


### XLSX_IMPORT

**capability**: XLSX_IMPORT

**status**: PARTIAL

**evidence**: E010–E013,E041,E046,E048,E049,E052,E054,E056,E059–E064. CSV/XLSX generan filas; PDF/imagen probados en estados unsupported. No confirma persistencia.


### PDF_IMPORT

**capability**: PDF_IMPORT

**status**: PARTIAL

**evidence**: E010–E013,E041,E046,E048,E049,E052,E054,E056,E059–E064. CSV/XLSX generan filas; PDF/imagen probados en estados unsupported. No confirma persistencia.


### IMAGE_IMPORT

**capability**: IMAGE_IMPORT

**status**: PARTIAL

**evidence**: E010–E013,E041,E046,E048,E049,E052,E054,E056,E059–E064. CSV/XLSX generan filas; PDF/imagen probados en estados unsupported. No confirma persistencia.


### TEAM_IMPORT

**capability**: TEAM_IMPORT

**status**: PARTIAL

**evidence**: Mes y matching individual observados. TeamImportModal y adapters inspeccionados; multi-mes, ambigüedad de equipo y matching masivo no completados en browser.


### SINGLE_MONTH_IMPORT

**capability**: SINGLE_MONTH_IMPORT

**status**: PARTIAL

**evidence**: Mes y matching individual observados. TeamImportModal y adapters inspeccionados; multi-mes, ambigüedad de equipo y matching masivo no completados en browser.


### MULTI_MONTH_IMPORT

**capability**: MULTI_MONTH_IMPORT

**status**: PARTIAL

**evidence**: Mes y matching individual observados. TeamImportModal y adapters inspeccionados; multi-mes, ambigüedad de equipo y matching masivo no completados en browser.


### EMPLOYEE_MATCHING

**capability**: EMPLOYEE_MATCHING

**status**: PARTIAL

**evidence**: Mes y matching individual observados. TeamImportModal y adapters inspeccionados; multi-mes, ambigüedad de equipo y matching masivo no completados en browser.


### AMBIGUOUS_EMPLOYEE

**capability**: AMBIGUOUS_EMPLOYEE

**status**: PARTIAL

**evidence**: Mes y matching individual observados. TeamImportModal y adapters inspeccionados; multi-mes, ambigüedad de equipo y matching masivo no completados en browser.


### UNKNOWN_EMPLOYEE

**capability**: UNKNOWN_EMPLOYEE

**status**: PARTIAL

**evidence**: Mes y matching individual observados. TeamImportModal y adapters inspeccionados; multi-mes, ambigüedad de equipo y matching masivo no completados en browser.


### LEARNED_FORMATS

**capability**: LEARNED_FORMATS

**status**: PARTIAL

**evidence**: E058 lista vacía LOCAL_BUILD; format-profile-store/profiles y API inspeccionados. Reutilización/renombre/desactivación sin registro preexistente.


### FORMAT_DEDUPLICATION

**capability**: FORMAT_DEDUPLICATION

**status**: PARTIAL

**evidence**: E058 lista vacía LOCAL_BUILD; format-profile-store/profiles y API inspeccionados. Reutilización/renombre/desactivación sin registro preexistente.


### FORMAT_VERSIONING

**capability**: FORMAT_VERSIONING

**status**: PARTIAL

**evidence**: E058 lista vacía LOCAL_BUILD; format-profile-store/profiles y API inspeccionados. Reutilización/renombre/desactivación sin registro preexistente.


### FORMAT_LIFECYCLE

**capability**: FORMAT_LIFECYCLE

**status**: PARTIAL

**evidence**: E058 lista vacía LOCAL_BUILD; format-profile-store/profiles y API inspeccionados. Reutilización/renombre/desactivación sin registro preexistente.


### IMPORT_CONFIRMATION

**capability**: IMPORT_CONFIRMATION

**status**: CODE_VERIFIED

**evidence**: App.tsx, api/_lib/data.js, api/_lib/future-import.js y tests asociados. Ninguna escritura/eliminación operativa realizada.


### IDEMPOTENCY

**capability**: IDEMPOTENCY

**status**: CODE_VERIFIED

**evidence**: App.tsx, api/_lib/data.js, api/_lib/future-import.js y tests asociados. Ninguna escritura/eliminación operativa realizada.


### CONFLICT_RESOLUTION

**capability**: CONFLICT_RESOLUTION

**status**: CODE_VERIFIED

**evidence**: App.tsx, api/_lib/data.js, api/_lib/future-import.js y tests asociados. Ninguna escritura/eliminación operativa realizada.


### DELETE_IMPORT

**capability**: DELETE_IMPORT

**status**: CODE_VERIFIED

**evidence**: App.tsx, api/_lib/data.js, api/_lib/future-import.js y tests asociados. Ninguna escritura/eliminación operativa realizada.


### AUDIT_TRAIL

**capability**: AUDIT_TRAIL

**status**: CODE_VERIFIED

**evidence**: App.tsx, api/_lib/data.js, api/_lib/future-import.js y tests asociados. Ninguna escritura/eliminación operativa realizada.


### IMPORT_HISTORY

**capability**: IMPORT_HISTORY

**status**: PARTIAL

**evidence**: E005: entrada y filtros reales, lista vacía. No ejecutor/conteos/registros eliminados con datos.


### IMPORT_FILTERING

**capability**: IMPORT_FILTERING

**status**: PARTIAL

**evidence**: E005: entrada y filtros reales, lista vacía. No ejecutor/conteos/registros eliminados con datos.


### MANUAL_SHIFT

**capability**: MANUAL_SHIFT

**status**: PARTIAL

**evidence**: E003,E012,E022,E023,E063. Borrador existente vacío y editor; no creación/edición persistida.


### PAST_SHIFT

**capability**: PAST_SHIFT

**status**: PARTIAL

**evidence**: E003,E012,E022,E023,E063. Borrador existente vacío y editor; no creación/edición persistida.


### FUTURE_SHIFT

**capability**: FUTURE_SHIFT

**status**: PARTIAL

**evidence**: E003,E012,E022,E023,E063. Borrador existente vacío y editor; no creación/edición persistida.


### SCHEDULING

**capability**: SCHEDULING

**status**: PARTIAL

**evidence**: E003,E012,E022,E023,E063. Borrador existente vacío y editor; no creación/edición persistida.


### DRAFT_SCHEDULE

**capability**: DRAFT_SCHEDULE

**status**: PARTIAL

**evidence**: E003,E012,E022,E023,E063. Borrador existente vacío y editor; no creación/edición persistida.


### WEEKLY_PLANNER

**capability**: WEEKLY_PLANNER

**status**: PARTIAL

**evidence**: E003,E012,E022,E023,E063. Borrador existente vacío y editor; no creación/edición persistida.


### PUBLISH

**capability**: PUBLISH

**status**: PARTIAL

**evidence**: Publicar visible disabled en borrador vacío; versionado inspeccionado en código. Publicación y versiones históricas pobladas no verificadas.


### PUBLISHED_SCHEDULE

**capability**: PUBLISHED_SCHEDULE

**status**: PARTIAL

**evidence**: Publicar visible disabled en borrador vacío; versionado inspeccionado en código. Publicación y versiones históricas pobladas no verificadas.


### SCHEDULE_VERSIONING

**capability**: SCHEDULE_VERSIONING

**status**: PARTIAL

**evidence**: Publicar visible disabled en borrador vacío; versionado inspeccionado en código. Publicación y versiones históricas pobladas no verificadas.


### EMPLOYEE_PORTAL

**capability**: EMPLOYEE_PORTAL

**status**: PARTIAL

**evidence**: E026,E033,E034,E045: autoservicio integrado en shell; PortalShell independiente desconectado.


### SELF_SERVICE

**capability**: SELF_SERVICE

**status**: PARTIAL

**evidence**: E026,E033,E034,E045: autoservicio integrado en shell; PortalShell independiente desconectado.


### CHANGE_REQUESTS

**capability**: CHANGE_REQUESTS

**status**: PARTIAL

**evidence**: E026,E033,E034,E045: autoservicio integrado en shell; PortalShell independiente desconectado.


### SHIFT_CONFIRMATION

**capability**: SHIFT_CONFIRMATION

**status**: PARTIAL

**evidence**: Backend y ShiftDetail implementados; ShiftDetail solo usado por PortalShell no montado. No ruta activa encontrada, F06.


### APPROVALS

**capability**: APPROVALS

**status**: CODE_VERIFIED

**evidence**: RequestStatus/RequestView y endpoints revisados; sin solicitud pendiente sintética no se evaluó una decisión en browser.


### BULK_USER_IMPORT

**capability**: BULK_USER_IMPORT

**status**: PARTIAL

**evidence**: LOCAL_BUILD E051,E053,E055,E057. Validación/previews; no confirmación ni resultados remotos.


### BULK_EMPLOYEE_IMPORT

**capability**: BULK_EMPLOYEE_IMPORT

**status**: PARTIAL

**evidence**: LOCAL_BUILD E051,E053,E055,E057. Validación/previews; no confirmación ni resultados remotos.


### TEMPORARY_CREDENTIALS

**capability**: TEMPORARY_CREDENTIALS

**status**: CODE_VERIFIED

**evidence**: MembersModal / creación de accesos y resultado de bulk. Sin generar/exportar secretos durante la auditoría.


### ONE_TIME_CREDENTIALS

**capability**: ONE_TIME_CREDENTIALS

**status**: CODE_VERIFIED

**evidence**: MembersModal / creación de accesos y resultado de bulk. Sin generar/exportar secretos durante la auditoría.


### CREDENTIAL_EXPORT

**capability**: CREDENTIAL_EXPORT

**status**: CODE_VERIFIED

**evidence**: MembersModal / creación de accesos y resultado de bulk. Sin generar/exportar secretos durante la auditoría.


### PRICING

**capability**: PRICING

**status**: PARTIAL

**evidence**: E030,E031 pública; gate invitado E064. Cuenta local Team, no retest de segundo acceso Personal.


### PLAN_GATING

**capability**: PLAN_GATING

**status**: PARTIAL

**evidence**: E030,E031 pública; gate invitado E064. Cuenta local Team, no retest de segundo acceso Personal.


## 09 · Promesa frente a experiencia

La promesa pública de «calendario listo para usar» se cumple en la legibilidad del resultado de escritorio, pero depende de pasos adicionales: identificación, revisión, sesión y, para futuros, planificación/publicación. La copia del importador explica la separación, aunque sus contadores no siempre reflejan la opción efectiva. El visitante puede explorar y editar candidatos; el botón de guardar importación exige iniciar sesión. No se denomina a eso un import end-to-end invitado completo.


### Registro

**promesa**: Recibir PDF/imagen y obtener calendario

**observado**: CSV y XLSX producen preview; dos fixtures difíciles PDF/imagen no interpretables; no muestra perdida silenciosa. E052/E056.


### Registro

**promesa**: Gestión de equipo

**observado**: Modelo Personas claro, pero CSV masivo en un segundo workspace legacy. E006/E050.


### Registro

**promesa**: Planificación futura fiable

**observado**: Borrador claramente rotulado; publicación sin probar. Contador futuro ambiguo. E012/E041/E064.


### Registro

**promesa**: Autoservicio Employee

**observado**: Calendario y solicitudes activos; detalle/acuse desconectado. E026/E045 + código.


## 10 · User types

Personas funcionales basadas en roles y tareas actuales; no perfiles demográficos inventados.


### Registro

**user_type**: ANONYMOUS_VISITOR

**primary_goal**: Entender utilidad y precio

**entry_point**: /

**primary_tasks**: Leer promesa, probar, registrarse

**frequent_tasks**: Leer promesa, probar, registrarse

**decisions**: Individual o equipo; gratis o plan

**information_needs**: Qué acepta y qué se guarda

**primary_workspace**: Landing

**permitted_scope**: Público

**recovery_needs**: Volver desde auth sin perder orientación

**next_action**: Empezar gratis


### Registro

**user_type**: GUEST_USER

**primary_goal**: Evaluar un cuadrante sin alta

**entry_point**: Continuar sin cuenta

**primary_tasks**: Seleccionar archivo, revisar candidatos

**frequent_tasks**: Seleccionar archivo, revisar candidatos

**decisions**: Formato, identidad y fechas

**information_needs**: No se guardará sin sesión

**primary_workspace**: Importador/calendario local

**permitted_scope**: Dispositivo

**recovery_needs**: Corregir formato y conservar preview

**next_action**: Revisar; decidir iniciar sesión


### Registro

**user_type**: OWNER

**primary_goal**: Gobernar organización y propiedad

**entry_point**: Sesión con ownership

**primary_tasks**: Roles, plan, transferencia

**frequent_tasks**: Roles, plan, transferencia

**decisions**: Responsable sucesor y alcance

**information_needs**: Efecto de transferencia y último Owner

**primary_workspace**: Equipo/configuración

**permitted_scope**: ORGANIZATION

**recovery_needs**: Evitar perder último propietario

**next_action**: Revisar membresías; browser no cubierto


### Registro

**user_type**: ADMIN / FIRST_TIME_ADMIN

**primary_goal**: Construir equipo operativo

**entry_point**: Equipo

**primary_tasks**: Personas, áreas, importaciones, accesos

**frequent_tasks**: Personas, áreas, importaciones, accesos

**decisions**: Acceso vs ficha; rol y vínculo

**information_needs**: Conteos y resultado de bulk

**primary_workspace**: Equipo/calendario

**permitted_scope**: ORGANIZATION

**recovery_needs**: Corregir filas y vínculos sin duplicar

**next_action**: Previsualizar altas antes de confirmar


### Registro

**user_type**: PLANNER / RETURNING_PLANNER

**primary_goal**: Preparar y publicar semana

**entry_point**: Planificar

**primary_tasks**: Editar borrador, revisar, publicar, resolver solicitudes

**frequent_tasks**: Editar borrador, revisar, publicar, resolver solicitudes

**decisions**: Semana, ámbito, versión

**information_needs**: Qué es borrador y quién lo verá

**primary_workspace**: Planificador

**permitted_scope**: ORGANIZATION / AREAS / EMPLOYEES según asignación

**recovery_needs**: Conflicto/versión obsoleta, reintento conservando edición

**next_action**: Revisar borrador; rol no autenticado en esta ejecución


### Registro

**user_type**: EMPLOYEE / FIRST_TIME_EMPLOYEE

**primary_goal**: Comprender próximos turnos

**entry_point**: Calendario común

**primary_tasks**: Ver propios, importar históricos, solicitar cambio

**frequent_tasks**: Ver propios, importar históricos, solicitar cambio

**decisions**: Turno y motivo

**information_needs**: Publicado, recepción, estado solicitud

**primary_workspace**: Calendario/solicitudes

**permitted_scope**: SELF

**recovery_needs**: Saber si una solicitud llegó y cómo corregirla

**next_action**: Seleccionar turno o nueva solicitud


### Registro

**user_type**: RETURNING_EMPLOYEE

**primary_goal**: Consultar cambios recientes

**entry_point**: Sesión conservada

**primary_tasks**: Consultar mes/solicitudes

**frequent_tasks**: Consultar mes/solicitudes

**decisions**: Cambios respecto a semana previa

**information_needs**: Estado pendiente/aprobado/rechazado

**primary_workspace**: Calendario/solicitudes

**permitted_scope**: SELF

**recovery_needs**: Recuperar sesión sin cambiar empleado

**next_action**: Abrir solicitudes


### Registro

**user_type**: MULTI_ORGANIZATION_USER

**primary_goal**: Trabajar en organización correcta

**entry_point**: Selector de contexto

**primary_tasks**: Cambiar organización y reconfirmar rol

**frequent_tasks**: Cambiar organización y reconfirmar rol

**decisions**: Destino y pertenencia

**information_needs**: Organización activa, rol y empleado

**primary_workspace**: Shell

**permitted_scope**: Membership activa

**recovery_needs**: No mezclar datos tras cambio

**next_action**: Selector; sin fixture multi-org browser


### Registro

**user_type**: MULTI_AREA_USER

**primary_goal**: Coordinar áreas asignadas

**entry_point**: Filtro Área

**primary_tasks**: Filtrar/revisar empleados y planificación

**frequent_tasks**: Filtrar/revisar empleados y planificación

**decisions**: Toda empresa o área

**information_needs**: Alcance efectivo frente a filtro visual

**primary_workspace**: Calendario/planificador

**permitted_scope**: AREAS autorizadas

**recovery_needs**: Recuperar contexto tras modal

**next_action**: Aplicar filtro; permisos multiárea solo código


## 11 · Roles y scopes

OWNER, ADMIN, PLANNER y EMPLOYEE son roles distintos. Área visible como filtro no concede permisos. El servidor calcula el contexto y valida pertenencia; este análisis de código no es una prueba de aislamiento completa. El modelo actual permite scopes más específicos que el trío simplificado ORG/AREA/SELF: las asignaciones del Planner pueden referirse a conjuntos de áreas o empleados.


### Registro

**rol**: OWNER

**browser**: AUTH_BLOCKED

**código**: Transferencia estricta, sin ofrecer Owner en dropdown Admin

**límite**: No se usó ni creó propietario QA.


### Registro

**rol**: ADMIN

**browser**: PARTIAL · LOCAL_BUILD

**código**: Gestión org, usuarios, empleados, áreas e importaciones

**límite**: Dos accesos/3personas; no mutaciones.


### Registro

**rol**: PLANNER

**browser**: AUTH_BLOCKED como identidad

**código**: Planifica/publica dentro de scope; sin gobierno global

**límite**: Admin abrió planner, lo cual no verifica RBAC Planner.


### Registro

**rol**: EMPLOYEE

**browser**: PARTIAL · LOCAL_BUILD

**código**: SELF y vínculo Employee; no Team/Planner en navegación

**límite**: Datos manuales existentes; publicación/acuse no recorridos.


## 12 · Estrategia de autenticación y seguridad

Se inspeccionaron qa/e2e-acceptance, setup/teardown, local-fixture.json, seeds y documentación de entornos. Los cuatro IDs de la fixture E2E habían sido eliminados (SELECT sin coincidencias). Se encontraron dos cuentas de demostración existentes y explícitamente 100% sintéticas en seed-manual-demo.mjs. Se comprobó el entorno dev contra docs/db-environments.md y la autenticación normal. No se ejecutaron seed, migraciones, reset de contraseña ni altas. No hay credenciales en este informe. El transporte local usa handlers reales y bloquea métodos de escritura operativa; login/logout son excepciones para la sesión. Por tanto, DATABASE_MODIFIED=FALSE solo sería correcto para datos operativos: las sesiones de autenticación sí implican escrituras técnicas. Se declara esta salvedad expresamente.


### Registro

**alternativa**: Fixture E2E existente

**resultado**: Usuarios ausentes; no resembrar para respetar no DB operacional.


### Registro

**alternativa**: Cuentas demo existentes

**resultado**: ADMIN y EMPLOYEE válidas en Neon dev; utilizadas solo lectura/previews.


### Registro

**alternativa**: Owner/Planner provisionados

**resultado**: No encontrados entre las cuentas sintéticas comprobadas; no escalar roles.


### Registro

**alternativa**: Producción autenticada

**resultado**: Sin cuenta QA autorizada identificada; no utilizar cuentas personales/reales.


### Registro

**alternativa**: Mock/estado inventado

**resultado**: No usado para afirmar cobertura real. LOCAL_BUILD conecta API original con datos dev existentes.


## 13 · Task inventory

Inventario previo de 65 candidatos, refinado tras la observación. SAFE_TO_EXECUTE describe el nivel autorizado; no asegura ejecución completa. Las operaciones de escritura se detuvieron en preview o quedaron bloqueadas por seguridad.


### T01

**id**: T01

**journey_id**: J01

**task**: Landing → empezar gratis

**user_type**: VISITOR / GUEST

**surface**: LANDING_PAGE

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**expected_route**: /

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T02

**id**: T02

**journey_id**: J02

**task**: Sign-up

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**expected_route**: /signup

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T03

**id**: T03

**journey_id**: J03

**task**: Sign-in

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**expected_route**: /app

**mutation_level**: AUTH_SESSION_ONLY

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T04

**id**: T04

**journey_id**: J04

**task**: Guest mode

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T05

**id**: T05

**journey_id**: J05

**task**: First organization

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T06

**id**: T06

**journey_id**: J06

**task**: Onboarding role choice

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T07

**id**: T07

**journey_id**: J07

**task**: Switch organization

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: AUTH_BLOCKED


### T08

**id**: T08

**journey_id**: J08

**task**: Switch area

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T09

**id**: T09

**journey_id**: J09

**task**: Switch employee context

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T10

**id**: T10

**journey_id**: J10

**task**: Calendar monthly navigation

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T11

**id**: T11

**journey_id**: J11

**task**: Add historical manual shift

**user_type**: EMPLOYEE

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T12

**id**: T12

**journey_id**: J12

**task**: Edit manual shift

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T13

**id**: T13

**journey_id**: J13

**task**: Delete manual shift

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T14

**id**: T14

**journey_id**: J14

**task**: Start individual import

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T15

**id**: T15

**journey_id**: J15

**task**: Start team import

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T16

**id**: T16

**journey_id**: J16

**task**: CSV import

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T17

**id**: T17

**journey_id**: J17

**task**: XLSX import

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T18

**id**: T18

**journey_id**: J18

**task**: PDF import

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T19

**id**: T19

**journey_id**: J19

**task**: Image import

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T20

**id**: T20

**journey_id**: J20

**task**: Unknown format recovery

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: RECOVERY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T21

**id**: T21

**journey_id**: J21

**task**: Ambiguous employee resolution

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: RECOVERY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T22

**id**: T22

**journey_id**: J22

**task**: Unknown employee handling

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: RECOVERY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T23

**id**: T23

**journey_id**: J23

**task**: Learned format reuse

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T24

**id**: T24

**journey_id**: J24

**task**: Import preview editing

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T25

**id**: T25

**journey_id**: J25

**task**: Remove row from preview

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T26

**id**: T26

**journey_id**: J26

**task**: Historical vs future routing

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T27

**id**: T27

**journey_id**: J27

**task**: Confirm import

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T28

**id**: T28

**journey_id**: J28

**task**: Re-import idempotency

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: RECOVERY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T29

**id**: T29

**journey_id**: J29

**task**: Conflict handling

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: RECOVERY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T30

**id**: T30

**journey_id**: J30

**task**: Import history

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T31

**id**: T31

**journey_id**: J31

**task**: Import history filtering

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T32

**id**: T32

**journey_id**: J32

**task**: Delete specific import

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T33

**id**: T33

**journey_id**: J33

**task**: Manual shifts survive import deletion

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: RECOVERY_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T34

**id**: T34

**journey_id**: J34

**task**: Scheduling entry

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app/schedule

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T35

**id**: T35

**journey_id**: J35

**task**: Create draft schedule

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app/schedule

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T36

**id**: T36

**journey_id**: J36

**task**: Edit draft

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app/schedule

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T37

**id**: T37

**journey_id**: J37

**task**: Publish schedule

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app/schedule

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T38

**id**: T38

**journey_id**: J38

**task**: Schedule version history

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app/schedule

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T39

**id**: T39

**journey_id**: J39

**task**: Employee Portal

**user_type**: EMPLOYEE

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T40

**id**: T40

**journey_id**: J40

**task**: Employee own schedule

**user_type**: EMPLOYEE

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T41

**id**: T41

**journey_id**: J41

**task**: Employee confirms shift

**user_type**: EMPLOYEE

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T42

**id**: T42

**journey_id**: J42

**task**: Employee requests change

**user_type**: EMPLOYEE

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T43

**id**: T43

**journey_id**: J43

**task**: Planner/Admin receives request

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T44

**id**: T44

**journey_id**: J44

**task**: Approve/reject request

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T45

**id**: T45

**journey_id**: J45

**task**: Users management

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T46

**id**: T46

**journey_id**: J46

**task**: Add user

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T47

**id**: T47

**journey_id**: J47

**task**: Link user ↔ employee

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T48

**id**: T48

**journey_id**: J48

**task**: Change role

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T49

**id**: T49

**journey_id**: J49

**task**: Owner transfer

**user_type**: OWNER

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: AUTH_BLOCKED


### T50

**id**: T50

**journey_id**: J50

**task**: Employees management

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T51

**id**: T51

**journey_id**: J51

**task**: Add employee

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T52

**id**: T52

**journey_id**: J52

**task**: Areas management

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T53

**id**: T53

**journey_id**: J53

**task**: Shift types management

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T54

**id**: T54

**journey_id**: J54

**task**: Bulk users CSV

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T55

**id**: T55

**journey_id**: J55

**task**: Bulk employees CSV

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: PRIMARY_JOURNEY

**task_criticality**: CORE

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T56

**id**: T56

**journey_id**: J56

**task**: Temporary credentials

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T57

**id**: T57

**journey_id**: J57

**task**: Export generated credentials

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: OPERATIONAL_WRITE

**safe_to_execute**: PREVIEW_ONLY

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: SAFETY_BLOCKED


### T58

**id**: T58

**journey_id**: J58

**task**: Plan gate

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /pricing

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T59

**id**: T59

**journey_id**: J59

**task**: Settings

**user_type**: ADMIN

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T60

**id**: T60

**journey_id**: J60

**task**: Language ES → EN

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T61

**id**: T61

**journey_id**: J61

**task**: Dark → Light

**user_type**: VISITOR / GUEST

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T62

**id**: T62

**journey_id**: J62

**task**: Cookie preferences

**user_type**: VISITOR / GUEST

**surface**: LANDING_PAGE

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**expected_route**: /legal

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T63

**id**: T63

**journey_id**: J63

**task**: Legal navigation

**user_type**: VISITOR / GUEST

**surface**: LANDING_PAGE

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**expected_route**: /privacy

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: COVERED


### T64

**id**: T64

**journey_id**: J64

**task**: Logout

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


### T65

**id**: T65

**journey_id**: J65

**task**: Session recovery

**user_type**: ROLE_DEPENDENT

**surface**: APPLICATION

**journey_class**: RECOVERY_JOURNEY

**task_criticality**: SUPPORTING

**expected_route**: /app

**mutation_level**: READ_OR_EPHEMERAL_UI

**safe_to_execute**: True

**expected_coverage**: BROWSER_ATTEMPT_WITH_CODE_CORRELATION

**actual_coverage**: PARTIAL


## 14 · Critical journeys

Cada ficha distingue lo observado del éxito final no ejecutado. COVERED se reserva al alcance de la tarea descrita; PARTIAL no cuenta como end-to-end. SAFETY_BLOCKED no es un defecto del producto. AUTH_BLOCKED se refiere al acceso disponible para auditoría.


### J01

**id**: J01

**name**: Landing → empezar gratis

**classification**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Landing → empezar gratis

**entry_state**: El CTA Start for free abre la tarjeta de registro

**route**: /

**steps**: [
  "El CTA Start for free abre la tarjeta de registro. La navegación móvil agrupa utilidades tras un menú y mantiene el CTA.",
  "Elegir empezar gratis desde hero; sin datos personales."
]

**decisions**: Elegir empezar gratis desde hero; sin datos personales.

**inputs**: Elegir empezar gratis desde hero; sin datos personales.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: El CTA Start for free abre la tarjeta de registro. La navegación móvil agrupa utilidades tras un menú y mantiene el CTA.

**error**: Cerrar auth permite volver; no se creó cuenta.

**recovery**: Cerrar auth permite volver; no se creó cuenta.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: El CTA Start for free abre la tarjeta de registro. La navegación móvil agrupa utilidades tras un menú y mantiene el CTA.

**viewport**: [
  "1440x900",
  "390x844"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E027",
  "E028",
  "E029",
  "E065"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/pages/LandingPage.tsx

**coverage**: COVERED

**coverage_limit**: Cerrar auth permite volver; no se creó cuenta.


### J02

**id**: J02

**name**: Sign-up

**classification**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Sign-up

**entry_state**: Registro muestra nombre, email, contraseña y confirmación

**route**: /signup

**steps**: [
  "Registro muestra nombre, email, contraseña y confirmación. Envío vacío activa validación requerida de email; nombre no marcado required.",
  "Formulario vacío; alta final excluida."
]

**decisions**: Formulario vacío; alta final excluida.

**inputs**: Formulario vacío; alta final excluida.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Registro muestra nombre, email, contraseña y confirmación. Envío vacío activa validación requerida de email; nombre no marcado required.

**error**: No se enviaron credenciales ni se completó onboarding; mismatch de contraseñas comprobado solo código.

**recovery**: No se enviaron credenciales ni se completó onboarding; mismatch de contraseñas comprobado solo código.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Registro muestra nombre, email, contraseña y confirmación. Envío vacío activa validación requerida de email; nombre no marcado required.

**viewport**: [
  "1440x900"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E065"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/AuthScreen.tsx

**coverage**: PARTIAL

**coverage_limit**: No se enviaron credenciales ni se completó onboarding; mismatch de contraseñas comprobado solo código.


### J03

**id**: J03

**name**: Sign-in

**classification**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Sign-in

**entry_state**: Login normal con cuentas sintéticas abre shell Admin y Employee en local

**route**: /app

**steps**: [
  "Login normal con cuentas sintéticas abre shell Admin y Employee en local. Login público muestra campos nombrados y recuperación de contraseña.",
  "Dos identidades ya provisionadas en dev; secretos excluidos."
]

**decisions**: Dos identidades ya provisionadas en dev; secretos excluidos.

**inputs**: Dos identidades ya provisionadas en dev; secretos excluidos.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Login normal con cuentas sintéticas abre shell Admin y Employee en local. Login público muestra campos nombrados y recuperación de contraseña.

**error**: Sesión funciona; login inválido de servidor/rate limit no inducido.

**recovery**: Sesión funciona; login inválido de servidor/rate limit no inducido.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Login normal con cuentas sintéticas abre shell Admin y Employee en local. Login público muestra campos nombrados y recuperación de contraseña.

**viewport**: [
  "1440x900",
  "390x844",
  "430x932"
]

**theme**: [
  "dark",
  "light"
]

**locale**: [
  "en",
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E003",
  "E026",
  "E035",
  "E036"
]

**browser_environment**: [
  "LOCAL_BUILD",
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: api/auth/login.js; src/components/AuthScreen.tsx

**coverage**: COVERED

**coverage_limit**: Sesión funciona; login inválido de servidor/rate limit no inducido.


### J04

**id**: J04

**name**: Guest mode

**classification**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Guest mode

**entry_state**: Continuar sin cuenta abre calendario vacío y permite preview de archivo

**route**: /app

**steps**: [
  "Continuar sin cuenta abre calendario vacío y permite preview de archivo. Guardar importación requiere sesión.",
  "Entrar invitado; archivo sintético CSV."
]

**decisions**: Entrar invitado; archivo sintético CSV.

**inputs**: Entrar invitado; archivo sintético CSV.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Continuar sin cuenta abre calendario vacío y permite preview de archivo. Guardar importación requiere sesión.

**error**: Cambios de preview son efímeros; no equivale a guardado end-to-end.

**recovery**: Cambios de preview son efímeros; no equivale a guardado end-to-end.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Continuar sin cuenta abre calendario vacío y permite preview de archivo. Guardar importación requiere sesión.

**viewport**: [
  "1280x633",
  "1440x900"
]

**theme**: [
  "dark",
  "light"
]

**locale**: [
  "en",
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E004",
  "E010",
  "E064"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/App.tsx; src/lib/storage.ts

**coverage**: COVERED

**coverage_limit**: Cambios de preview son efímeros; no equivale a guardado end-to-end.


### J05

**id**: J05

**name**: First organization

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: First organization

**entry_state**: Crear primera organización existe en onboarding, pero las cuentas disponibles ya pertenecen a una organización.

**route**: /app

**steps**: [
  "Crear primera organización existe en onboarding, pero las cuentas disponibles ya pertenecen a una organización.",
  "No se creó organización ni se alteró pertenencia existente."
]

**decisions**: No se creó organización ni se alteró pertenencia existente.

**inputs**: No se creó organización ni se alteró pertenencia existente.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Crear primera organización existe en onboarding, pero las cuentas disponibles ya pertenecen a una organización.

**error**: No hay evidencia browser del resultado de alta; requiere fixture sin org autorizada.

**recovery**: No hay evidencia browser del resultado de alta; requiere fixture sin org autorizada.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Crear primera organización existe en onboarding, pero las cuentas disponibles ya pertenecen a una organización.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/components/shift-dashboard/OnboardingChoiceModal.tsx

**coverage**: SAFETY_BLOCKED

**coverage_limit**: No hay evidencia browser del resultado de alta; requiere fixture sin org autorizada.


### J06

**id**: J06

**name**: Onboarding role choice

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Onboarding role choice

**entry_state**: El código separa cómo se usará el producto y si el creador también es empleado; rol de acceso no equivale a ficha.

**route**: /app

**steps**: [
  "El código separa cómo se usará el producto y si el creador también es empleado; rol de acceso no equivale a ficha.",
  "Modelo de elección inspeccionado sin reiniciar onboarding."
]

**decisions**: Modelo de elección inspeccionado sin reiniciar onboarding.

**inputs**: Modelo de elección inspeccionado sin reiniciar onboarding.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: El código separa cómo se usará el producto y si el creador también es empleado; rol de acceso no equivale a ficha.

**error**: Validación del nombre de empleado original F9 no retesteada.

**recovery**: Validación del nombre de empleado original F9 no retesteada.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: El código separa cómo se usará el producto y si el creador también es empleado; rol de acceso no equivale a ficha.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/components/shift-dashboard/OnboardingChoiceModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Validación del nombre de empleado original F9 no retesteada.


### J07

**id**: J07

**name**: Switch organization

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Switch organization

**entry_state**: La sesión soporta membresías múltiples y contexto activo

**route**: /app

**steps**: [
  "La sesión soporta membresías múltiples y contexto activo. Las cuentas demo comprobadas no ofrecen dos organizaciones autorizadas.",
  "No se fabricó segunda membership."
]

**decisions**: No se fabricó segunda membership.

**inputs**: No se fabricó segunda membership.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: La sesión soporta membresías múltiples y contexto activo. Las cuentas demo comprobadas no ofrecen dos organizaciones autorizadas.

**error**: Cambio y recuperación entre organizaciones no medidos; aislamiento solo código.

**recovery**: Cambio y recuperación entre organizaciones no medidos; aislamiento solo código.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: La sesión soporta membresías múltiples y contexto activo. Las cuentas demo comprobadas no ofrecen dos organizaciones autorizadas.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/App.tsx; src/lib/session.ts

**coverage**: AUTH_BLOCKED

**coverage_limit**: Cambio y recuperación entre organizaciones no medidos; aislamiento solo código.


### J08

**id**: J08

**name**: Switch area

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Switch area

**entry_state**: El calendario Admin presenta Área y la gestión lista Recepción/Cocina con conteos

**route**: /app

**steps**: [
  "El calendario Admin presenta Área y la gestión lista Recepción/Cocina con conteos. Contexto visible separado de rol.",
  "Selector presente; no se afirma cambio multiárea de permisos."
]

**decisions**: Selector presente; no se afirma cambio multiárea de permisos.

**inputs**: Selector presente; no se afirma cambio multiárea de permisos.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: El calendario Admin presenta Área y la gestión lista Recepción/Cocina con conteos. Contexto visible separado de rol.

**error**: Filtro visual no prueba seguridad de scope; comprobar con Planner limitado pendiente.

**recovery**: Filtro visual no prueba seguridad de scope; comprobar con Planner limitado pendiente.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: El calendario Admin presenta Área y la gestión lista Recepción/Cocina con conteos. Contexto visible separado de rol.

**viewport**: [
  "1440x813",
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E003",
  "E038"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/App.tsx

**coverage**: PARTIAL

**coverage_limit**: Filtro visual no prueba seguridad de scope; comprobar con Planner limitado pendiente.


### J09

**id**: J09

**name**: Switch employee context

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Switch employee context

**entry_state**: Admin muestra empleado activo Marta y catálogo de personas

**route**: /app

**steps**: [
  "Admin muestra empleado activo Marta y catálogo de personas. Employee no ofrece contexto arbitrario de otra persona.",
  "Identidad/vínculo observados; secuencia completa de cambio no catalogada."
]

**decisions**: Identidad/vínculo observados; secuencia completa de cambio no catalogada.

**inputs**: Identidad/vínculo observados; secuencia completa de cambio no catalogada.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Admin muestra empleado activo Marta y catálogo de personas. Employee no ofrece contexto arbitrario de otra persona.

**error**: No convertir disponibilidad del selector en validación de todos sus resultados.

**recovery**: No convertir disponibilidad del selector en validación de todos sus resultados.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Admin muestra empleado activo Marta y catálogo de personas. Employee no ofrece contexto arbitrario de otra persona.

**viewport**: [
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E003",
  "E006",
  "E007"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/App.tsx

**coverage**: PARTIAL

**coverage_limit**: No convertir disponibilidad del selector en validación de todos sus resultados.


### J10

**id**: J10

**name**: Calendar monthly navigation

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Calendar monthly navigation

**entry_state**: Navegador mensual y botones prev/next presentes; matriz de ocho tamaños documenta grilla y métricas

**route**: /app

**steps**: [
  "Navegador mensual y botones prev/next presentes; matriz de ocho tamaños documenta grilla y métricas. Móvil exige desplazamiento horizontal.",
  "Mes septiembre 2026; navegación sin mutar turnos."
]

**decisions**: Mes septiembre 2026; navegación sin mutar turnos.

**inputs**: Mes septiembre 2026; navegación sin mutar turnos.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Navegador mensual y botones prev/next presentes; matriz de ocho tamaños documenta grilla y métricas. Móvil exige desplazamiento horizontal.

**error**: No se verificó límite de años ni cada transición; columnas no simultáneas a 390.

**recovery**: No se verificó límite de años ni cada transición; columnas no simultáneas a 390.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Navegador mensual y botones prev/next presentes; matriz de ocho tamaños documenta grilla y métricas. Móvil exige desplazamiento horizontal.

**viewport**: [
  "1024x768",
  "1366x768",
  "1440x900",
  "1728x1117",
  "390x844",
  "430x932",
  "768x1024",
  "844x390"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E004",
  "E014",
  "E015",
  "E016",
  "E017",
  "E018",
  "E019",
  "E020",
  "E021"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/App.tsx; src/lib/week.ts

**coverage**: PARTIAL

**coverage_limit**: No se verificó límite de años ni cada transición; columnas no simultáneas a 390.


### J11

**id**: J11

**name**: Add historical manual shift

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: EMPLOYEE

**role**: EMPLOYEE

**scope**: SELF

**goal**: Add historical manual shift

**entry_state**: Employee abre Add past shift; fecha máxima anterior a hoy, hora y tipo editables, CTA visible en tablet claro.

**route**: /app

**steps**: [
  "Employee abre Add past shift; fecha máxima anterior a hoy, hora y tipo editables, CTA visible en tablet claro.",
  "Formulario abierto sin Confirm; valores por defecto conservados."
]

**decisions**: Formulario abierto sin Confirm; valores por defecto conservados.

**inputs**: Formulario abierto sin Confirm; valores por defecto conservados.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Employee abre Add past shift; fecha máxima anterior a hoy, hora y tipo editables, CTA visible en tablet claro.

**error**: Tab entra en fecha; Escape cierra y devuelve foco al disparador. Persistencia no ejecutada.

**recovery**: Tab entra en fecha; Escape cierra y devuelve foco al disparador. Persistencia no ejecutada.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Employee abre Add past shift; fecha máxima anterior a hoy, hora y tipo editables, CTA visible en tablet claro.

**viewport**: [
  "768x1024"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: Tab dentro; Escape y restauración al trigger medidos en E063

**screenshot_reference**: [
  "E063"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/ShiftModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Tab entra en fecha; Escape cierra y devuelve foco al disparador. Persistencia no ejecutada.


### J12

**id**: J12

**name**: Edit manual shift

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Edit manual shift

**entry_state**: Turnos manuales existentes abren edición mediante handleEditShift y ShiftModal; el código mantiene id y feedback al guardar.

**route**: /app

**steps**: [
  "Turnos manuales existentes abren edición mediante handleEditShift y ShiftModal; el código mantiene id y feedback al guardar.",
  "Inspección de estado y handler; no envío de cambios."
]

**decisions**: Inspección de estado y handler; no envío de cambios.

**inputs**: Inspección de estado y handler; no envío de cambios.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Turnos manuales existentes abren edición mediante handleEditShift y ShiftModal; el código mantiene id y feedback al guardar.

**error**: Error y reintento de guardado solo código; no se afirma éxito persistido.

**recovery**: Error y reintento de guardado solo código; no se afirma éxito persistido.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Turnos manuales existentes abren edición mediante handleEditShift y ShiftModal; el código mantiene id y feedback al guardar.

**viewport**: [
  "1440x900",
  "768x1024"
]

**theme**: [
  "dark",
  "light"
]

**locale**: [
  "en",
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E003",
  "E063"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/App.tsx

**coverage**: PARTIAL

**coverage_limit**: Error y reintento de guardado solo código; no se afirma éxito persistido.


### J13

**id**: J13

**name**: Delete manual shift

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Delete manual shift

**entry_state**: Eliminar manual filtra por id y persiste deleteIds, con error visible en catch.

**route**: /app

**steps**: [
  "Eliminar manual filtra por id y persiste deleteIds, con error visible en catch.",
  "No borrar turnos demo preexistentes."
]

**decisions**: No borrar turnos demo preexistentes.

**inputs**: No borrar turnos demo preexistentes.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Eliminar manual filtra por id y persiste deleteIds, con error visible en catch.

**error**: Resultado, recuperación y supervivencia de otros turnos no medidos en browser.

**recovery**: Resultado, recuperación y supervivencia de otros turnos no medidos en browser.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Eliminar manual filtra por id y persiste deleteIds, con error visible en catch.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/App.tsx

**coverage**: SAFETY_BLOCKED

**coverage_limit**: Resultado, recuperación y supervivencia de otros turnos no medidos en browser.


### J14

**id**: J14

**name**: Start individual import

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Start individual import

**entry_state**: Individual abre nombre/ID, período y archivo; guest puede parsear y Employee queda limitado por identidad propia.

**route**: /app

**steps**: [
  "Individual abre nombre/ID, período y archivo; guest puede parsear y Employee queda limitado por identidad propia.",
  "Archivo sintético; nombre QA Ready o identidad indicada."
]

**decisions**: Archivo sintético; nombre QA Ready o identidad indicada.

**inputs**: Archivo sintético; nombre QA Ready o identidad indicada.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Individual abre nombre/ID, período y archivo; guest puede parsear y Employee queda limitado por identidad propia.

**error**: Cambiar archivo permite reintentar; no escribe antes de confirmar.

**recovery**: Cambiar archivo permite reintentar; no escribe antes de confirmar.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Individual abre nombre/ID, período y archivo; guest puede parsear y Employee queda limitado por identidad propia.

**viewport**: [
  "1280x633",
  "1440x900"
]

**theme**: [
  "dark",
  "light"
]

**locale**: [
  "en",
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E010",
  "E041",
  "E064"
]

**browser_environment**: [
  "LOCAL_BUILD",
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/ImportModal.tsx

**coverage**: COVERED

**coverage_limit**: Cambiar archivo permite reintentar; no escribe antes de confirmar.


### J15

**id**: J15

**name**: Start team import

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Start team import

**entry_state**: Importador de equipo implementado con roster, matching y validación por persona

**route**: /app

**steps**: [
  "Importador de equipo implementado con roster, matching y validación por persona. No se obtuvo una captura de su flujo autenticado durante esta ejecución.",
  "Source review de modal y rutas; no equipo sintético nuevo."
]

**decisions**: Source review de modal y rutas; no equipo sintético nuevo.

**inputs**: Source review de modal y rutas; no equipo sintético nuevo.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Importador de equipo implementado con roster, matching y validación por persona. No se obtuvo una captura de su flujo autenticado durante esta ejecución.

**error**: Team parsing/confirmación quedan NOT_EVALUATED visualmente; no reutilizar evidencia individual como team.

**recovery**: Team parsing/confirmación quedan NOT_EVALUATED visualmente; no reutilizar evidencia individual como team.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Importador de equipo implementado con roster, matching y validación por persona. No se obtuvo una captura de su flujo autenticado durante esta ejecución.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/components/shift-dashboard/TeamImportModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Team parsing/confirmación quedan NOT_EVALUATED visualmente; no reutilizar evidencia individual como team.


### J16

**id**: J16

**name**: CSV import

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: CSV import

**entry_state**: CSV estructurado genera cinco filas; recuperación de código desconocido genera candidatos revisables

**route**: /app

**steps**: [
  "CSV estructurado genera cinco filas; recuperación de código desconocido genera candidatos revisables. Procesar habilitado en estado Ready.",
  "Fixtures READY y PARTIAL; nombre seleccionado; sin guardar memoria."
]

**decisions**: Fixtures READY y PARTIAL; nombre seleccionado; sin guardar memoria.

**inputs**: Fixtures READY y PARTIAL; nombre seleccionado; sin guardar memoria.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: CSV estructurado genera cinco filas; recuperación de código desconocido genera candidatos revisables. Procesar habilitado en estado Ready.

**error**: La preview conserva filas y admite edición; ruta absoluta de herramienta necesaria.

**recovery**: La preview conserva filas y admite edición; ruta absoluta de herramienta necesaria.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: CSV estructurado genera cinco filas; recuperación de código desconocido genera candidatos revisables. Procesar habilitado en estado Ready.

**viewport**: [
  "1280x633",
  "1440x900"
]

**theme**: [
  "dark",
  "light"
]

**locale**: [
  "en",
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E010",
  "E046",
  "E049",
  "E064"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/ingestion/tabular-assistant.ts

**coverage**: COVERED

**coverage_limit**: La preview conserva filas y admite edición; ruta absoluta de herramienta necesaria.


### J17

**id**: J17

**name**: XLSX import

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: XLSX import

**entry_state**: Workbook sintético multihoja produce 674 filas, con desglose histórico/futuro

**route**: /app

**steps**: [
  "Workbook sintético multihoja produce 674 filas, con desglose histórico/futuro. No se cotejó cada una de las 674 filas ni se confirmó.",
  "Cuatro hojas: dos datos, instrucciones y vacía según fixture."
]

**decisions**: Cuatro hojas: dos datos, instrucciones y vacía según fixture.

**inputs**: Cuatro hojas: dos datos, instrucciones y vacía según fixture.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: Processing file visible durante XLSX

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Workbook sintético multihoja produce 674 filas, con desglose histórico/futuro. No se cotejó cada una de las 674 filas ni se confirmó.

**error**: Lectura exitosa no certifica matching por empleado ni corrección integral de incidencias deliberadas.

**recovery**: Lectura exitosa no certifica matching por empleado ni corrección integral de incidencias deliberadas.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Workbook sintético multihoja produce 674 filas, con desglose histórico/futuro. No se cotejó cada una de las 674 filas ni se confirmó.

**viewport**: [
  "1440x900"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E054"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/ingestion/adapters/xlsx-workbook.ts

**coverage**: PARTIAL

**coverage_limit**: Lectura exitosa no certifica matching por empleado ni corrección integral de incidencias deliberadas.


### J18

**id**: J18

**name**: PDF import

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: PDF import

**entry_state**: PDF sintético de códigos desconocidos termina Unsupported, cero filas y período incierto.

**route**: /app

**steps**: [
  "PDF sintético de códigos desconocidos termina Unsupported, cero filas y período incierto.",
  "02_NEEDS_USER_INPUT_unknown_codes.pdf, producción invitado."
]

**decisions**: 02_NEEDS_USER_INPUT_unknown_codes.pdf, producción invitado.

**inputs**: 02_NEEDS_USER_INPUT_unknown_codes.pdf, producción invitado.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: PDF sintético de códigos desconocidos termina Unsupported, cero filas y período incierto.

**error**: Ofrece otro formato y no importar; PDF legible exitoso y fallback autenticado no cubiertos.

**recovery**: Ofrece otro formato y no importar; PDF legible exitoso y fallback autenticado no cubiertos.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: PDF sintético de códigos desconocidos termina Unsupported, cero filas y período incierto.

**viewport**: [
  "1440x900"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E052"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/ingestion/parsers

**coverage**: PARTIAL

**coverage_limit**: Ofrece otro formato y no importar; PDF legible exitoso y fallback autenticado no cubiertos.


### J19

**id**: J19

**name**: Image import

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Image import

**entry_state**: Imagen sintética ilegible produce Unsupported, sin excepción cruda ni turnos falsos.

**route**: /app

**steps**: [
  "Imagen sintética ilegible produce Unsupported, sin excepción cruda ni turnos falsos.",
  "E_illegible.png en invitado; sin PII."
]

**decisions**: E_illegible.png en invitado; sin PII.

**inputs**: E_illegible.png en invitado; sin PII.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Imagen sintética ilegible produce Unsupported, sin excepción cruda ni turnos falsos.

**error**: Otro archivo permite reintentar; proveedor visual autenticado no ejecutado.

**recovery**: Otro archivo permite reintentar; proveedor visual autenticado no ejecutado.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Imagen sintética ilegible produce Unsupported, sin excepción cruda ni turnos falsos.

**viewport**: [
  "1440x900"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E056"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/ingestion/vlm-trigger.ts

**coverage**: PARTIAL

**coverage_limit**: Otro archivo permite reintentar; proveedor visual autenticado no ejecutado.


### J20

**id**: J20

**name**: Unknown format recovery

**classification**: RECOVERY_JOURNEY

**task_criticality**: CORE

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Unknown format recovery

**entry_state**: CSV parcial expone asistente para clasificar código; aplicar clasificación retiene cinco filas

**route**: /app

**steps**: [
  "CSV parcial expone asistente para clasificar código; aplicar clasificación retiene cinco filas. PDF no interpretable da recuperación alternativa.",
  "Clasificar desconocido como descanso; recordar desmarcado."
]

**decisions**: Clasificar desconocido como descanso; recordar desmarcado.

**inputs**: Clasificar desconocido como descanso; recordar desmarcado.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: CSV parcial expone asistente para clasificar código; aplicar clasificación retiene cinco filas. PDF no interpretable da recuperación alternativa.

**error**: No persistió perfil aprendido; no generalizar a todas las geometrías PDF.

**recovery**: No persistió perfil aprendido; no generalizar a todas las geometrías PDF.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: CSV parcial expone asistente para clasificar código; aplicar clasificación retiene cinco filas. PDF no interpretable da recuperación alternativa.

**viewport**: [
  "1440x900"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E046",
  "E049",
  "E052"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/ingestion/assistant.ts

**coverage**: COVERED

**coverage_limit**: No persistió perfil aprendido; no generalizar a todas las geometrías PDF.


### J21

**id**: J21

**name**: Ambiguous employee resolution

**classification**: RECOVERY_JOURNEY

**task_criticality**: CORE

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Ambiguous employee resolution

**entry_state**: Modelo de matching ambiguo y resolución por empleado existe en código, pero roster disponible no permitió caso browser catalogado.

**route**: /app

**steps**: [
  "Modelo de matching ambiguo y resolución por empleado existe en código, pero roster disponible no permitió caso browser catalogado.",
  "No generar empleados homónimos para fabricar ambigüedad."
]

**decisions**: No generar empleados homónimos para fabricar ambigüedad.

**inputs**: No generar empleados homónimos para fabricar ambigüedad.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Modelo de matching ambiguo y resolución por empleado existe en código, pero roster disponible no permitió caso browser catalogado.

**error**: La elección de candidato y su persistencia no están verificadas.

**recovery**: La elección de candidato y su persistencia no están verificadas.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Modelo de matching ambiguo y resolución por empleado existe en código, pero roster disponible no permitió caso browser catalogado.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/components/shift-dashboard/TeamImportModal.tsx

**coverage**: PARTIAL

**coverage_limit**: La elección de candidato y su persistencia no están verificadas.


### J22

**id**: J22

**name**: Unknown employee handling

**classification**: RECOVERY_JOURNEY

**task_criticality**: CORE

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Unknown employee handling

**entry_state**: Self-import de QA Ready no coincide con Employee activo y bloquea; CSV de usuarios indica Empleado no encontrado en 17 filas inválidas.

**route**: /app

**steps**: [
  "Self-import de QA Ready no coincide con Employee activo y bloquea; CSV de usuarios indica Empleado no encontrado en 17 filas inválidas.",
  "ID/identidad sintética ajena; no autoalta."
]

**decisions**: ID/identidad sintética ajena; no autoalta.

**inputs**: ID/identidad sintética ajena; no autoalta.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Self-import de QA Ready no coincide con Employee activo y bloquea; CSV de usuarios indica Empleado no encontrado en 17 filas inválidas.

**error**: El bloqueo es visible antes de escritura; creación o vinculación de desconocidos no ejecutada.

**recovery**: El bloqueo es visible antes de escritura; creación o vinculación de desconocidos no ejecutada.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Self-import de QA Ready no coincide con Employee activo y bloquea; CSV de usuarios indica Empleado no encontrado en 17 filas inválidas.

**viewport**: [
  "1440x813",
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E041",
  "E051"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/ImportModal.tsx; MembersModal.tsx

**coverage**: PARTIAL

**coverage_limit**: El bloqueo es visible antes de escritura; creación o vinculación de desconocidos no ejecutada.


### J23

**id**: J23

**name**: Learned format reuse

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Learned format reuse

**entry_state**: Admin abre formatos aprendidos; organización sin perfiles guardados

**route**: /app

**steps**: [
  "Admin abre formatos aprendidos; organización sin perfiles guardados. Store separa candidato remoto y perfil local validado.",
  "Sin perfil existente para reutilizar."
]

**decisions**: Sin perfil existente para reutilizar.

**inputs**: Sin perfil existente para reutilizar.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: Cargando visible al abrir formatos

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Admin abre formatos aprendidos; organización sin perfiles guardados. Store separa candidato remoto y perfil local validado.

**error**: No renombrar/validar/desactivar/reactivar sin registro autorizado; lifecycle queda código.

**recovery**: No renombrar/validar/desactivar/reactivar sin registro autorizado; lifecycle queda código.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Admin abre formatos aprendidos; organización sin perfiles guardados. Store separa candidato remoto y perfil local validado.

**viewport**: [
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E058"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/lib/format-profile-store.ts

**coverage**: PARTIAL

**coverage_limit**: No renombrar/validar/desactivar/reactivar sin registro autorizado; lifecycle queda código.


### J24

**id**: J24

**name**: Import preview editing

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Import preview editing

**entry_state**: Desktop permite editar celdas

**route**: /app

**steps**: [
  "Desktop permite editar celdas. En 390 y landscape lista editable mide 0 px; tablet muestra campos estrechos truncados.",
  "Editar antes de confirmar; cambiar viewport manteniendo candidatos."
]

**decisions**: Editar antes de confirmar; cambiar viewport manteniendo candidatos.

**inputs**: Editar antes de confirmar; cambiar viewport manteniendo candidatos.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Desktop permite editar celdas. En 390 y landscape lista editable mide 0 px; tablet muestra campos estrechos truncados.

**error**: Datos siguen en DOM al redimensionar; inaccesibilidad visual no implica pérdida de datos.

**recovery**: Datos siguen en DOM al redimensionar; inaccesibilidad visual no implica pérdida de datos.

**data_preservation**: Preview conservada tras edición/redimensionado

**success_state**: Resultado observado anterior al límite: Desktop permite editar celdas. En 390 y landscape lista editable mide 0 px; tablet muestra campos estrechos truncados.

**viewport**: [
  "1440x900",
  "390x844",
  "430x932",
  "768x1024",
  "844x390"
]

**theme**: [
  "dark",
  "light"
]

**locale**: [
  "en",
  "es"
]

**keyboard_notes**: Controles sin nombre medidos por axe en preview

**screenshot_reference**: [
  "E011",
  "E013",
  "E059",
  "E060",
  "E061",
  "E062"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/ImportModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Datos siguen en DOM al redimensionar; inaccesibilidad visual no implica pérdida de datos.


### J25

**id**: J25

**name**: Remove row from preview

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Remove row from preview

**entry_state**: Eliminar una fila de preview reduce cinco a cuatro sin escribir turnos; las restantes permanecen.

**route**: /app

**steps**: [
  "Eliminar una fila de preview reduce cinco a cuatro sin escribir turnos; las restantes permanecen.",
  "Botón de papelera de fila, sin nombre accesible individual."
]

**decisions**: Botón de papelera de fila, sin nombre accesible individual.

**inputs**: Botón de papelera de fila, sin nombre accesible individual.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Eliminar una fila de preview reduce cinco a cuatro sin escribir turnos; las restantes permanecen.

**error**: No hay undo probado; retirar fila es cambio efímero anterior a confirmar.

**recovery**: No hay undo probado; retirar fila es cambio efímero anterior a confirmar.

**data_preservation**: Preview conservada tras edición/redimensionado

**success_state**: Resultado observado anterior al límite: Eliminar una fila de preview reduce cinco a cuatro sin escribir turnos; las restantes permanecen.

**viewport**: [
  "1280x633",
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: Controles sin nombre medidos por axe en preview

**screenshot_reference**: [
  "E010",
  "E011"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/ImportModal.tsx

**coverage**: COVERED

**coverage_limit**: No hay undo probado; retirar fila es cambio efímero anterior a confirmar.


### J26

**id**: J26

**name**: Historical vs future routing

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Historical vs future routing

**entry_state**: Badge anuncia futuros en borrador aunque históricos-only está seleccionado; Employee recibe además mensaje que excluye esos futuros.

**route**: /app

**steps**: [
  "Badge anuncia futuros en borrador aunque históricos-only está seleccionado; Employee recibe además mensaje que excluye esos futuros.",
  "Fecha actual y corte temporal; decidir históricos-only o incluir futuros si permitido."
]

**decisions**: Fecha actual y corte temporal; decidir históricos-only o incluir futuros si permitido.

**inputs**: Fecha actual y corte temporal; decidir históricos-only o incluir futuros si permitido.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Badge anuncia futuros en borrador aunque históricos-only está seleccionado; Employee recibe además mensaje que excluye esos futuros.

**error**: F04: resumen debe reflejar decisión efectiva. Destino persistido solo código.

**recovery**: F04: resumen debe reflejar decisión efectiva. Destino persistido solo código.

**data_preservation**: Preview conservada tras edición/redimensionado

**success_state**: Resultado observado anterior al límite: Badge anuncia futuros en borrador aunque históricos-only está seleccionado; Employee recibe además mensaje que excluye esos futuros.

**viewport**: [
  "1440x900"
]

**theme**: [
  "dark",
  "light"
]

**locale**: [
  "en",
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E041",
  "E054",
  "E064"
]

**browser_environment**: [
  "LOCAL_BUILD",
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/lib/import-temporal.ts

**coverage**: PARTIAL

**coverage_limit**: F04: resumen debe reflejar decisión efectiva. Destino persistido solo código.


### J27

**id**: J27

**name**: Confirm import

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Confirm import

**entry_state**: Guest ve confirmación deshabilitada y explicación de login

**route**: /app

**steps**: [
  "Guest ve confirmación deshabilitada y explicación de login. En local no se confirmó ninguna importación.",
  "No realizar escritura operativa ni simular éxito."
]

**decisions**: No realizar escritura operativa ni simular éxito.

**inputs**: No realizar escritura operativa ni simular éxito.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Guest ve confirmación deshabilitada y explicación de login. En local no se confirmó ninguna importación.

**error**: Resultados completed/partial/blocked/failed y conservación tras fallo revisados en código, no browser.

**recovery**: Resultados completed/partial/blocked/failed y conservación tras fallo revisados en código, no browser.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Guest ve confirmación deshabilitada y explicación de login. En local no se confirmó ninguna importación.

**viewport**: [
  "1440x900"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E064"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/App.tsx

**coverage**: SAFETY_BLOCKED

**coverage_limit**: Resultados completed/partial/blocked/failed y conservación tras fallo revisados en código, no browser.


### J28

**id**: J28

**name**: Re-import idempotency

**classification**: RECOVERY_JOURNEY

**task_criticality**: CORE

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Re-import idempotency

**entry_state**: Deduplicación y fingerprints org+employee están implementados

**route**: /app

**steps**: [
  "Deduplicación y fingerprints org+employee están implementados. Reimportar exige una primera escritura no autorizada para este alcance.",
  "Mismo archivo no confirmado previamente."
]

**decisions**: Mismo archivo no confirmado previamente.

**inputs**: Mismo archivo no confirmado previamente.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Deduplicación y fingerprints org+employee están implementados. Reimportar exige una primera escritura no autorizada para este alcance.

**error**: No se etiqueta idempotencia LIVE; tests/contrato no sustituyen reimportación real.

**recovery**: No se etiqueta idempotencia LIVE; tests/contrato no sustituyen reimportación real.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Deduplicación y fingerprints org+employee están implementados. Reimportar exige una primera escritura no autorizada para este alcance.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: api/_lib/data.js; src/lib/shifts.ts

**coverage**: SAFETY_BLOCKED

**coverage_limit**: No se etiqueta idempotencia LIVE; tests/contrato no sustituyen reimportación real.


### J29

**id**: J29

**name**: Conflict handling

**classification**: RECOVERY_JOURNEY

**task_criticality**: CORE

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Conflict handling

**entry_state**: El código presenta conflicto existente/entrante y opciones explícitas

**route**: /app

**steps**: [
  "El código presenta conflicto existente/entrante y opciones explícitas. Workbook incluye incidencia sintética, sin recorrido de decisión confirmado.",
  "No alterar turno existente para fabricar colisión."
]

**decisions**: No alterar turno existente para fabricar colisión.

**inputs**: No alterar turno existente para fabricar colisión.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: El código presenta conflicto existente/entrante y opciones explícitas. Workbook incluye incidencia sintética, sin recorrido de decisión confirmado.

**error**: Recuperación y elección por fila quedan pendientes en browser.

**recovery**: Recuperación y elección por fila quedan pendientes en browser.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: El código presenta conflicto existente/entrante y opciones explícitas. Workbook incluye incidencia sintética, sin recorrido de decisión confirmado.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/App.tsx; src/App.tsx

**coverage**: PARTIAL

**coverage_limit**: Recuperación y elección por fila quedan pendientes en browser.


### J30

**id**: J30

**name**: Import history

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Import history

**entry_state**: Admin encuentra Historial en navegación; carga lista vacía con filtros, sin confundirla con restablecer organización.

**route**: /app

**steps**: [
  "Admin encuentra Historial en navegación; carga lista vacía con filtros, sin confundirla con restablecer organización.",
  "Abrir historial de org sintética sin importaciones."
]

**decisions**: Abrir historial de org sintética sin importaciones.

**inputs**: Abrir historial de org sintética sin importaciones.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Admin encuentra Historial en navegación; carga lista vacía con filtros, sin confundirla con restablecer organización.

**error**: No puede verificarse legibilidad de ejecutor, fecha/conteos o estado eliminado poblado.

**recovery**: No puede verificarse legibilidad de ejecutor, fecha/conteos o estado eliminado poblado.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Admin encuentra Historial en navegación; carga lista vacía con filtros, sin confundirla con restablecer organización.

**viewport**: [
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E005"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/ImportHistoryModal.tsx

**coverage**: PARTIAL

**coverage_limit**: No puede verificarse legibilidad de ejecutor, fecha/conteos o estado eliminado poblado.


### J31

**id**: J31

**name**: Import history filtering

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Import history filtering

**entry_state**: Ámbito, tipo, formato y estado están en UI; requestId protege contra respuestas de filtros obsoletas en código.

**route**: /app

**steps**: [
  "Ámbito, tipo, formato y estado están en UI; requestId protege contra respuestas de filtros obsoletas en código.",
  "Lista vacía; paginación adaptativa en código."
]

**decisions**: Lista vacía; paginación adaptativa en código.

**inputs**: Lista vacía; paginación adaptativa en código.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Ámbito, tipo, formato y estado están en UI; requestId protege contra respuestas de filtros obsoletas en código.

**error**: Resultados filtrados, no-results distinto de empty y orden con registros no medidos.

**recovery**: Resultados filtrados, no-results distinto de empty y orden con registros no medidos.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Ámbito, tipo, formato y estado están en UI; requestId protege contra respuestas de filtros obsoletas en código.

**viewport**: [
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E005"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/ImportHistoryModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Resultados filtrados, no-results distinto de empty y orden con registros no medidos.


### J32

**id**: J32

**name**: Delete specific import

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Delete specific import

**entry_state**: Borrado exige import id y org, confirma y transacciona eliminación de turnos + soft-delete import.

**route**: /app

**steps**: [
  "Borrado exige import id y org, confirma y transacciona eliminación de turnos + soft-delete import.",
  "No hay import demo autorizada para borrar."
]

**decisions**: No hay import demo autorizada para borrar.

**inputs**: No hay import demo autorizada para borrar.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Borrado exige import id y org, confirma y transacciona eliminación de turnos + soft-delete import.

**error**: Estado deleting/deleted, recuento final y fallo concurrente no observados.

**recovery**: Estado deleting/deleted, recuento final y fallo concurrente no observados.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Borrado exige import id y org, confirma y transacciona eliminación de turnos + soft-delete import.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: api/_lib/data.js:2068; ImportHistoryModal.tsx

**coverage**: SAFETY_BLOCKED

**coverage_limit**: Estado deleting/deleted, recuento final y fallo concurrente no observados.


### J33

**id**: J33

**name**: Manual shifts survive import deletion

**classification**: RECOVERY_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Manual shifts survive import deletion

**entry_state**: DELETE limita import_id y organization_id; manual tiene import_id NULL

**route**: /app

**steps**: [
  "DELETE limita import_id y organization_id; manual tiene import_id NULL. No ejecuta reset de organización.",
  "Regla revisada en código y tests; no modificar demo."
]

**decisions**: Regla revisada en código y tests; no modificar demo.

**inputs**: Regla revisada en código y tests; no modificar demo.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: DELETE limita import_id y organization_id; manual tiene import_id NULL. No ejecuta reset de organización.

**error**: La preservación real debe retestearse con fixture aislada antes de afirmar browser PASS.

**recovery**: La preservación real debe retestearse con fixture aislada antes de afirmar browser PASS.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: DELETE limita import_id y organization_id; manual tiene import_id NULL. No ejecuta reset de organización.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: api/_lib/data.js:2090; src/App.tsx:2476

**coverage**: SAFETY_BLOCKED

**coverage_limit**: La preservación real debe retestearse con fixture aislada antes de afirmar browser PASS.


### J34

**id**: J34

**name**: Scheduling entry

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Scheduling entry

**entry_state**: Admin abre /app/schedule como workspace modal; semana visible, tres personas, borrador editable y tabla alternativa.

**route**: /app/schedule

**steps**: [
  "Admin abre /app/schedule como workspace modal; semana visible, tres personas, borrador editable y tabla alternativa.",
  "Entrar Planificar; cerrar overlay para volver a navegación global."
]

**decisions**: Entrar Planificar; cerrar overlay para volver a navegación global.

**inputs**: Entrar Planificar; cerrar overlay para volver a navegación global.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Admin abre /app/schedule como workspace modal; semana visible, tres personas, borrador editable y tabla alternativa.

**error**: Publicar vacío disabled; uso por rol PLANNER independiente no demostrado.

**recovery**: Publicar vacío disabled; uso por rol PLANNER independiente no demostrado.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Admin abre /app/schedule como workspace modal; semana visible, tres personas, borrador editable y tabla alternativa.

**viewport**: [
  "1280x633",
  "390x844"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E012",
  "E022",
  "E023"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/scheduling/WeeklyPlanner.tsx

**coverage**: COVERED

**coverage_limit**: Publicar vacío disabled; uso por rol PLANNER independiente no demostrado.


### J35

**id**: J35

**name**: Create draft schedule

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Create draft schedule

**entry_state**: Se encontró un borrador preexistente vacío de la semana 7–13 septiembre

**route**: /app/schedule

**steps**: [
  "Se encontró un borrador preexistente vacío de la semana 7–13 septiembre. No fue creado por esta auditoría.",
  "No pulsar crear ni guardar borrador."
]

**decisions**: No pulsar crear ni guardar borrador.

**inputs**: No pulsar crear ni guardar borrador.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Se encontró un borrador preexistente vacío de la semana 7–13 septiembre. No fue creado por esta auditoría.

**error**: Primera creación, error de draft duplicado y feedback de guardado no ejecutados.

**recovery**: Primera creación, error de draft duplicado y feedback de guardado no ejecutados.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Se encontró un borrador preexistente vacío de la semana 7–13 septiembre. No fue creado por esta auditoría.

**viewport**: [
  "1280x633"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E012"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/scheduling/WeeklyPlanner.tsx

**coverage**: SAFETY_BLOCKED

**coverage_limit**: Primera creación, error de draft duplicado y feedback de guardado no ejecutados.


### J36

**id**: J36

**name**: Edit draft

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Edit draft

**entry_state**: Editor futuro abre en móvil con campos y acciones alcanzables; la captura no muestra el solapamiento inline histórico.

**route**: /app/schedule

**steps**: [
  "Editor futuro abre en móvil con campos y acciones alcanzables; la captura no muestra el solapamiento inline histórico.",
  "Abrir celda editable sin guardar asignación."
]

**decisions**: Abrir celda editable sin guardar asignación.

**inputs**: Abrir celda editable sin guardar asignación.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Editor futuro abre en móvil con campos y acciones alcanzables; la captura no muestra el solapamiento inline histórico.

**error**: Cerrar conserva borrador remoto intacto; edición persistida y conflictos no probados.

**recovery**: Cerrar conserva borrador remoto intacto; edición persistida y conflictos no probados.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Editor futuro abre en móvil con campos y acciones alcanzables; la captura no muestra el solapamiento inline histórico.

**viewport**: [
  "390x844"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E022"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/scheduling/ScheduleAssignmentEditor.tsx

**coverage**: PARTIAL

**coverage_limit**: Cerrar conserva borrador remoto intacto; edición persistida y conflictos no probados.


### J37

**id**: J37

**name**: Publish schedule

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Publish schedule

**entry_state**: Publicar visible pero deshabilitado en borrador con cero turnos; hay separación visual BORRADOR EDITABLE.

**route**: /app/schedule

**steps**: [
  "Publicar visible pero deshabilitado en borrador con cero turnos; hay separación visual BORRADOR EDITABLE.",
  "No añadir asignaciones para habilitar publicación."
]

**decisions**: No añadir asignaciones para habilitar publicación.

**inputs**: No añadir asignaciones para habilitar publicación.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Publicar visible pero deshabilitado en borrador con cero turnos; hay separación visual BORRADOR EDITABLE.

**error**: Success/publishing/failure y visibilidad Employee posterior no verificados.

**recovery**: Success/publishing/failure y visibilidad Employee posterior no verificados.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Publicar visible pero deshabilitado en borrador con cero turnos; hay separación visual BORRADOR EDITABLE.

**viewport**: [
  "1280x633"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E012"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/scheduling/WeeklyPlanner.tsx

**coverage**: SAFETY_BLOCKED

**coverage_limit**: Success/publishing/failure y visibilidad Employee posterior no verificados.


### J38

**id**: J38

**name**: Schedule version history

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Schedule version history

**entry_state**: Entrada Historial de versiones visible

**route**: /app/schedule

**steps**: [
  "Entrada Historial de versiones visible. Modelo expone versión, estado, creación y publicación; no secuencia poblada catalogada.",
  "No publicar nueva versión para producir historial."
]

**decisions**: No publicar nueva versión para producir historial.

**inputs**: No publicar nueva versión para producir historial.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Entrada Historial de versiones visible. Modelo expone versión, estado, creación y publicación; no secuencia poblada catalogada.

**error**: Comparación de versiones y restauración/contexto requieren datos preparados.

**recovery**: Comparación de versiones y restauración/contexto requieren datos preparados.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Entrada Historial de versiones visible. Modelo expone versión, estado, creación y publicación; no secuencia poblada catalogada.

**viewport**: [
  "1280x633",
  "390x844"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E012",
  "E023"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/scheduling/ScheduleVersionHistory.tsx

**coverage**: PARTIAL

**coverage_limit**: Comparación de versiones y restauración/contexto requieren datos preparados.


### J39

**id**: J39

**name**: Employee Portal

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: EMPLOYEE

**role**: EMPLOYEE

**scope**: SELF

**goal**: Employee Portal

**entry_state**: Employee aterriza en shell común con calendario, importar propios, añadir pasado y solicitudes

**route**: /app

**steps**: [
  "Employee aterriza en shell común con calendario, importar propios, añadir pasado y solicitudes. PortalShell no montado.",
  "Sesión Employee existente, sin selector de otros empleados."
]

**decisions**: Sesión Employee existente, sin selector de otros empleados.

**inputs**: Sesión Employee existente, sin selector de otros empleados.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Employee aterriza en shell común con calendario, importar propios, añadir pasado y solicitudes. PortalShell no montado.

**error**: No tratar carpeta employee-portal como superficie desplegada independiente.

**recovery**: No tratar carpeta employee-portal como superficie desplegada independiente.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Employee aterriza en shell común con calendario, importar propios, añadir pasado y solicitudes. PortalShell no montado.

**viewport**: [
  "1440x900",
  "390x844"
]

**theme**: [
  "dark"
]

**locale**: [
  "en",
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E026",
  "E045"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/App.tsx; src/components/employee-portal/PortalShell.tsx

**coverage**: PARTIAL

**coverage_limit**: No tratar carpeta employee-portal como superficie desplegada independiente.


### J40

**id**: J40

**name**: Employee own schedule

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: EMPLOYEE

**role**: EMPLOYEE

**scope**: SELF

**goal**: Employee own schedule

**entry_state**: Calendario Employee muestra cinco turnos manuales propios

**route**: /app

**steps**: [
  "Calendario Employee muestra cinco turnos manuales propios. No había un conjunto publicado-vs-draft que permitiese verificar frontera de visibilidad.",
  "Persona Diego, scope SELF."
]

**decisions**: Persona Diego, scope SELF.

**inputs**: Persona Diego, scope SELF.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Calendario Employee muestra cinco turnos manuales propios. No había un conjunto publicado-vs-draft que permitiese verificar frontera de visibilidad.

**error**: No afirmar published-only browser; código de endpoints consultado por separado.

**recovery**: No afirmar published-only browser; código de endpoints consultado por separado.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Calendario Employee muestra cinco turnos manuales propios. No había un conjunto publicado-vs-draft que permitiese verificar frontera de visibilidad.

**viewport**: [
  "390x844"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E026"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/App.tsx; api/_lib/data.js

**coverage**: PARTIAL

**coverage_limit**: No afirmar published-only browser; código de endpoints consultado por separado.


### J41

**id**: J41

**name**: Employee confirms shift

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: EMPLOYEE

**role**: EMPLOYEE

**scope**: SELF

**goal**: Employee confirms shift

**entry_state**: Acuse implementado solo en ShiftDetail, usado por PortalShell desconectado; shell activo abre ShiftModal.

**route**: /app

**steps**: [
  "Acuse implementado solo en ShiftDetail, usado por PortalShell desconectado; shell activo abre ShiftModal.",
  "Sin ruta activa de Confirmar recepción encontrada."
]

**decisions**: Sin ruta activa de Confirmar recepción encontrada.

**inputs**: Sin ruta activa de Confirmar recepción encontrada.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Acuse implementado solo en ShiftDetail, usado por PortalShell desconectado; shell activo abre ShiftModal.

**error**: F06 es ausencia de integración actual, no fallo de POST probado; no acuse enviado.

**recovery**: F06 es ausencia de integración actual, no fallo de POST probado; no acuse enviado.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Acuse implementado solo en ShiftDetail, usado por PortalShell desconectado; shell activo abre ShiftModal.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/components/employee-portal/ShiftDetail.tsx

**coverage**: PARTIAL

**coverage_limit**: F06 es ausencia de integración actual, no fallo de POST probado; no acuse enviado.


### J42

**id**: J42

**name**: Employee requests change

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: EMPLOYEE

**role**: EMPLOYEE

**scope**: SELF

**goal**: Employee requests change

**entry_state**: Nueva solicitud permite motivo/tipo/turno; intento incompleto muestra validación previa, sin petición operativa.

**route**: /app

**steps**: [
  "Nueva solicitud permite motivo/tipo/turno; intento incompleto muestra validación previa, sin petición operativa.",
  "Formulario sintético incompleto; no enviar solicitud real."
]

**decisions**: Formulario sintético incompleto; no enviar solicitud real.

**inputs**: Formulario sintético incompleto; no enviar solicitud real.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Nueva solicitud permite motivo/tipo/turno; intento incompleto muestra validación previa, sin petición operativa.

**error**: Estado y campos conservados mientras se corrige; éxito/duplicado solo código.

**recovery**: Estado y campos conservados mientras se corrige; éxito/duplicado solo código.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Nueva solicitud permite motivo/tipo/turno; intento incompleto muestra validación previa, sin petición operativa.

**viewport**: [
  "1440x900",
  "390x844"
]

**theme**: [
  "dark"
]

**locale**: [
  "en",
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E033",
  "E034",
  "E045"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/employee-portal/NewChangeRequestModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Estado y campos conservados mientras se corrige; éxito/duplicado solo código.


### J43

**id**: J43

**name**: Planner/Admin receives request

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Planner/Admin receives request

**entry_state**: Bandeja y vistas para gestores implementadas; no existía solicitud pendiente sintética para observar recepción.

**route**: /app

**steps**: [
  "Bandeja y vistas para gestores implementadas; no existía solicitud pendiente sintética para observar recepción.",
  "No crear solicitud para forzar notificación."
]

**decisions**: No crear solicitud para forzar notificación.

**inputs**: No crear solicitud para forzar notificación.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Bandeja y vistas para gestores implementadas; no existía solicitud pendiente sintética para observar recepción.

**error**: Notificación y refresco entre cuentas no verificados; no confundir lista Employee con inbox Admin.

**recovery**: Notificación y refresco entre cuentas no verificados; no confundir lista Employee con inbox Admin.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Bandeja y vistas para gestores implementadas; no existía solicitud pendiente sintética para observar recepción.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/components/employee-portal/RequestStatus.tsx

**coverage**: PARTIAL

**coverage_limit**: Notificación y refresco entre cuentas no verificados; no confundir lista Employee con inbox Admin.


### J44

**id**: J44

**name**: Approve/reject request

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Approve/reject request

**entry_state**: Approve/reject con permisos y prevención de autoaprobación en código; estados aprobada/rechazada/decidida soportados.

**route**: /app

**steps**: [
  "Approve/reject con permisos y prevención de autoaprobación en código; estados aprobada/rechazada/decidida soportados.",
  "No tomar decisiones ni cambiar turnos."
]

**decisions**: No tomar decisiones ni cambiar turnos.

**inputs**: No tomar decisiones ni cambiar turnos.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Approve/reject con permisos y prevención de autoaprobación en código; estados aprobada/rechazada/decidida soportados.

**error**: Error concurrente y conservación de motivo no simulados; acceptance de aprobación pendiente.

**recovery**: Error concurrente y conservación de motivo no simulados; acceptance de aprobación pendiente.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Approve/reject con permisos y prevención de autoaprobación en código; estados aprobada/rechazada/decidida soportados.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: api/_lib/data.js; src/components/employee-portal/RequestStatus.tsx

**coverage**: SAFETY_BLOCKED

**coverage_limit**: Error concurrente y conservación de motivo no simulados; acceptance de aprobación pendiente.


### J45

**id**: J45

**name**: Users management

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Users management

**entry_state**: Equipo nuevo muestra Personas/Roles/Áreas/Asignaciones; Ajustes→Equipo→Abrir Usuarios abre segundo workspace con CSV.

**route**: /app

**steps**: [
  "Equipo nuevo muestra Personas/Roles/Áreas/Asignaciones; Ajustes→Equipo→Abrir Usuarios abre segundo workspace con CSV.",
  "Comparar ambas entradas sobre misma org sintética."
]

**decisions**: Comparar ambas entradas sobre misma org sintética.

**inputs**: Comparar ambas entradas sobre misma org sintética.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Equipo nuevo muestra Personas/Roles/Áreas/Asignaciones; Ajustes→Equipo→Abrir Usuarios abre segundo workspace con CSV.

**error**: Modelo persona/acceso claro en nuevo wizard; descubrimiento bulk fragmentado F07.

**recovery**: Modelo persona/acceso claro en nuevo wizard; descubrimiento bulk fragmentado F07.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Equipo nuevo muestra Personas/Roles/Áreas/Asignaciones; Ajustes→Equipo→Abrir Usuarios abre segundo workspace con CSV.

**viewport**: [
  "1440x813",
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E006",
  "E007",
  "E050"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/MembersModal.tsx

**coverage**: COVERED

**coverage_limit**: Modelo persona/acceso claro en nuevo wizard; descubrimiento bulk fragmentado F07.


### J46

**id**: J46

**name**: Add user

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Add user

**entry_state**: Wizard de persona llega a resumen acceso No, ficha Sí; formulario legacy de usuario dispone email/rol/contraseña/vínculo.

**route**: /app

**steps**: [
  "Wizard de persona llega a resumen acceso No, ficha Sí; formulario legacy de usuario dispone email/rol/contraseña/vínculo.",
  "Texto Audit Preview, sin Create final."
]

**decisions**: Texto Audit Preview, sin Create final.

**inputs**: Texto Audit Preview, sin Create final.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Wizard de persona llega a resumen acceso No, ficha Sí; formulario legacy de usuario dispone email/rol/contraseña/vínculo.

**error**: No credenciales generadas; resultado de alta y plan límite no verificados.

**recovery**: No credenciales generadas; resultado de alta y plan límite no verificados.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Wizard de persona llega a resumen acceso No, ficha Sí; formulario legacy de usuario dispone email/rol/contraseña/vínculo.

**viewport**: [
  "1440x813"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E044",
  "E047",
  "E050"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/MembersModal.tsx

**coverage**: PARTIAL

**coverage_limit**: No credenciales generadas; resultado de alta y plan límite no verificados.


### J47

**id**: J47

**name**: Link user ↔ employee

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Link user ↔ employee

**entry_state**: Personas muestra dos accesos y tres empleados, incluyendo persona sin acceso

**route**: /app

**steps**: [
  "Personas muestra dos accesos y tres empleados, incluyendo persona sin acceso. Wizard separa ficha de cuenta.",
  "Leer vínculo existente; no reasignar user_id."
]

**decisions**: Leer vínculo existente; no reasignar user_id.

**inputs**: Leer vínculo existente; no reasignar user_id.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Personas muestra dos accesos y tres empleados, incluyendo persona sin acceso. Wizard separa ficha de cuenta.

**error**: Recuperación de vínculo ocupado solo código y errores bulk E051.

**recovery**: Recuperación de vínculo ocupado solo código y errores bulk E051.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Personas muestra dos accesos y tres empleados, incluyendo persona sin acceso. Wizard separa ficha de cuenta.

**viewport**: [
  "1440x813",
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E006",
  "E007",
  "E047"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/MembersModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Recuperación de vínculo ocupado solo código y errores bulk E051.


### J48

**id**: J48

**name**: Change role

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Change role

**entry_state**: Admin abre diálogo de rol con Employee/Planner/Admin; Owner no ofrecido.

**route**: /app

**steps**: [
  "Admin abre diálogo de rol con Employee/Planner/Admin; Owner no ofrecido.",
  "Consultar opciones y cerrar sin guardar."
]

**decisions**: Consultar opciones y cerrar sin guardar.

**inputs**: Consultar opciones y cerrar sin guardar.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Admin abre diálogo de rol con Employee/Planner/Admin; Owner no ofrecido.

**error**: Cambios de permisos efectivos y actualización de sesión no comprobados.

**recovery**: Cambios de permisos efectivos y actualización de sesión no comprobados.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Admin abre diálogo de rol con Employee/Planner/Admin; Owner no ofrecido.

**viewport**: [
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E008"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/MembersModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Cambios de permisos efectivos y actualización de sesión no comprobados.


### J49

**id**: J49

**name**: Owner transfer

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: OWNER

**role**: OWNER

**scope**: ORGANIZATION

**goal**: Owner transfer

**entry_state**: Transferencia de propiedad implementada con restricciones; Admin no puede asignar Owner en diálogo observado.

**route**: /app

**steps**: [
  "Transferencia de propiedad implementada con restricciones; Admin no puede asignar Owner en diálogo observado.",
  "No cuenta Owner QA disponible; no escalar privilegios."
]

**decisions**: No cuenta Owner QA disponible; no escalar privilegios.

**inputs**: No cuenta Owner QA disponible; no escalar privilegios.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Transferencia de propiedad implementada con restricciones; Admin no puede asignar Owner en diálogo observado.

**error**: Pérdida de propiedad, último Owner y rollback no recorridos.

**recovery**: Pérdida de propiedad, último Owner y rollback no recorridos.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Transferencia de propiedad implementada con restricciones; Admin no puede asignar Owner en diálogo observado.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: api/memberships; src/lib/session.ts

**coverage**: AUTH_BLOCKED

**coverage_limit**: Pérdida de propiedad, último Owner y rollback no recorridos.


### J50

**id**: J50

**name**: Employees management

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Employees management

**entry_state**: Ficha empleado y estado de acceso diferenciados

**route**: /app

**steps**: [
  "Ficha empleado y estado de acceso diferenciados. En legacy, filtros sin/con acceso y acciones por persona.",
  "Tres fichas sintéticas; catálogo pequeño."
]

**decisions**: Tres fichas sintéticas; catálogo pequeño.

**inputs**: Tres fichas sintéticas; catálogo pequeño.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Ficha empleado y estado de acceso diferenciados. En legacy, filtros sin/con acceso y acciones por persona.

**error**: Escala de lista grande y búsqueda con centenares de personas no evaluada.

**recovery**: Escala de lista grande y búsqueda con centenares de personas no evaluada.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Ficha empleado y estado de acceso diferenciados. En legacy, filtros sin/con acceso y acciones por persona.

**viewport**: [
  "1440x813",
  "1440x900"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E006",
  "E050",
  "E055"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/MembersModal.tsx

**coverage**: COVERED

**coverage_limit**: Escala de lista grande y búsqueda con centenares de personas no evaluada.


### J51

**id**: J51

**name**: Add employee

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Add employee

**entry_state**: Resumen de nueva persona permite empleado sin acceso

**route**: /app

**steps**: [
  "Resumen de nueva persona permite empleado sin acceso. No se envía el alta final.",
  "Identidad sintética y separación de acceso/ficha."
]

**decisions**: Identidad sintética y separación de acceso/ficha.

**inputs**: Identidad sintética y separación de acceso/ficha.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Resumen de nueva persona permite empleado sin acceso. No se envía el alta final.

**error**: No asumir que el estado final tiene los vínculos correctos hasta verificar persistencia.

**recovery**: No asumir que el estado final tiene los vínculos correctos hasta verificar persistencia.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Resumen de nueva persona permite empleado sin acceso. No se envía el alta final.

**viewport**: [
  "1440x813"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E047"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/MembersModal.tsx

**coverage**: PARTIAL

**coverage_limit**: No asumir que el estado final tiene los vínculos correctos hasta verificar persistencia.


### J52

**id**: J52

**name**: Areas management

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Areas management

**entry_state**: Dos áreas, conteos y asignaciones con fecha efectiva visibles; cambios no aplicados.

**route**: /app

**steps**: [
  "Dos áreas, conteos y asignaciones con fecha efectiva visibles; cambios no aplicados.",
  "Inspección de Recepción/Cocina y formulario de asignación."
]

**decisions**: Inspección de Recepción/Cocina y formulario de asignación.

**inputs**: Inspección de Recepción/Cocina y formulario de asignación.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Dos áreas, conteos y asignaciones con fecha efectiva visibles; cambios no aplicados.

**error**: Crear/archivar/mover personas y aislamiento posterior no ejecutados.

**recovery**: Crear/archivar/mover personas y aislamiento posterior no ejecutados.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Dos áreas, conteos y asignaciones con fecha efectiva visibles; cambios no aplicados.

**viewport**: [
  "1440x813"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E038",
  "E039"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/App.tsx; api/areas

**coverage**: PARTIAL

**coverage_limit**: Crear/archivar/mover personas y aislamiento posterior no ejecutados.


### J53

**id**: J53

**name**: Shift types management

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Shift types management

**entry_state**: Tipos Regular/Libre/Vacaciones/Extras configurables

**route**: /app

**steps**: [
  "Tipos Regular/Libre/Vacaciones/Extras configurables. Inputs color tienen nombres por tipo; F4 histórico corregido.",
  "Abrir Ajustes→Tipos, sin cambiar colores ni archivar."
]

**decisions**: Abrir Ajustes→Tipos, sin cambiar colores ni archivar.

**inputs**: Abrir Ajustes→Tipos, sin cambiar colores ni archivar.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Tipos Regular/Libre/Vacaciones/Extras configurables. Inputs color tienen nombres por tipo; F4 histórico corregido.

**error**: Creación y alias persistidos solo código; contraste de cada color libre no certificado.

**recovery**: Creación y alias persistidos solo código; contraste de cada color libre no certificado.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Tipos Regular/Libre/Vacaciones/Extras configurables. Inputs color tienen nombres por tipo; F4 histórico corregido.

**viewport**: [
  "1440x813"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E048"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/SettingsModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Creación y alias persistidos solo código; contraste de cada color libre no certificado.


### J54

**id**: J54

**name**: Bulk users CSV

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Bulk users CSV

**entry_state**: 18 filas: errores email/rol/empleado/duplicado visibles

**route**: /app

**steps**: [
  "18 filas: errores email/rol/empleado/duplicado visibles. Usuario nuevo sin vínculo contado como ya miembro, F05.",
  "CSV sintético existente 04_usuarios_45, que en realidad contiene 18 filas."
]

**decisions**: CSV sintético existente 04_usuarios_45, que en realidad contiene 18 filas.

**inputs**: CSV sintético existente 04_usuarios_45, que en realidad contiene 18 filas.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: 18 filas: errores email/rol/empleado/duplicado visibles. Usuario nuevo sin vínculo contado como ya miembro, F05.

**error**: Atrás permite corregir archivo; no confirmar ni generar contraseña.

**recovery**: Atrás permite corregir archivo; no confirmar ni generar contraseña.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: 18 filas: errores email/rol/empleado/duplicado visibles. Usuario nuevo sin vínculo contado como ya miembro, F05.

**viewport**: [
  "1440x813"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E051"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/MembersModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Atrás permite corregir archivo; no confirmar ni generar contraseña.


### J55

**id**: J55

**name**: Bulk employees CSV

**classification**: PRIMARY_JOURNEY

**task_criticality**: CORE

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Bulk employees CSV

**entry_state**: Fixture camelCase rechazada

**route**: /app

**steps**: [
  "Fixture camelCase rechazada. CSV con headers válidos identifica existente y sin ID, pero dos filas con mismo ID nuevo se cuentan ambas nuevas.",
  "Cuatro filas sintéticas de auditoría, ninguna persistida."
]

**decisions**: Cuatro filas sintéticas de auditoría, ninguna persistida.

**inputs**: Cuatro filas sintéticas de auditoría, ninguna persistida.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Fixture camelCase rechazada. CSV con headers válidos identifica existente y sin ID, pero dos filas con mismo ID nuevo se cuentan ambas nuevas.

**error**: Mensaje de headers permite reintento; duplicado intrafichero requiere mejor preview F05.

**recovery**: Mensaje de headers permite reintento; duplicado intrafichero requiere mejor preview F05.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Fixture camelCase rechazada. CSV con headers válidos identifica existente y sin ID, pero dos filas con mismo ID nuevo se cuentan ambas nuevas.

**viewport**: [
  "1440x813",
  "390x844"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E053",
  "E055",
  "E057"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/lib/bulk-import-csv.ts

**coverage**: PARTIAL

**coverage_limit**: Mensaje de headers permite reintento; duplicado intrafichero requiere mejor preview F05.


### J56

**id**: J56

**name**: Temporary credentials

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Temporary credentials

**entry_state**: Generación y resultado de accesos temporales implementados

**route**: /app

**steps**: [
  "Generación y resultado de accesos temporales implementados. No se concedió acceso a la persona demo sin cuenta.",
  "No crear credenciales para observar un resultado de un solo uso."
]

**decisions**: No crear credenciales para observar un resultado de un solo uso.

**inputs**: No crear credenciales para observar un resultado de un solo uso.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Generación y resultado de accesos temporales implementados. No se concedió acceso a la persona demo sin cuenta.

**error**: One-time visibility y recuperación de pérdida solo inspección de código.

**recovery**: One-time visibility y recuperación de pérdida solo inspección de código.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Generación y resultado de accesos temporales implementados. No se concedió acceso a la persona demo sin cuenta.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/components/shift-dashboard/MembersModal.tsx

**coverage**: SAFETY_BLOCKED

**coverage_limit**: One-time visibility y recuperación de pérdida solo inspección de código.


### J57

**id**: J57

**name**: Export generated credentials

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Export generated credentials

**entry_state**: Export de credenciales está unido al resultado de provisión; no hay resultado autorizado generado en esta auditoría.

**route**: /app

**steps**: [
  "Export de credenciales está unido al resultado de provisión; no hay resultado autorizado generado en esta auditoría.",
  "No exportar secretos existentes/reales."
]

**decisions**: No exportar secretos existentes/reales.

**inputs**: No exportar secretos existentes/reales.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Export de credenciales está unido al resultado de provisión; no hay resultado autorizado generado en esta auditoría.

**error**: La semántica de cerrar sin descargar y reintento necesita ejecución con datos aislados.

**recovery**: La semántica de cerrar sin descargar y reintento necesita ejecución con datos aislados.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Export de credenciales está unido al resultado de provisión; no hay resultado autorizado generado en esta auditoría.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: src/components/shift-dashboard/MembersModal.tsx

**coverage**: SAFETY_BLOCKED

**coverage_limit**: La semántica de cerrar sin descargar y reintento necesita ejecución con datos aislados.


### J58

**id**: J58

**name**: Plan gate

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Plan gate

**entry_state**: Precios Free/Personal/Team visibles

**route**: /pricing

**steps**: [
  "Precios Free/Personal/Team visibles. Guest import gate claro; cuenta autenticada Team no reproduce gate de segundo usuario Personal.",
  "Leer pricing y aviso de login."
]

**decisions**: Leer pricing y aviso de login.

**inputs**: Leer pricing y aviso de login.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Precios Free/Personal/Team visibles. Guest import gate claro; cuenta autenticada Team no reproduce gate de segundo usuario Personal.

**error**: F2 histórico Personal no retesteado; no fingir límite con CSS/mocks.

**recovery**: F2 histórico Personal no retesteado; no fingir límite con CSS/mocks.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Precios Free/Personal/Team visibles. Guest import gate claro; cuenta autenticada Team no reproduce gate de segundo usuario Personal.

**viewport**: [
  "1440x900",
  "390x844"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E030",
  "E031",
  "E064"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/lib/plans.ts

**coverage**: PARTIAL

**coverage_limit**: F2 histórico Personal no retesteado; no fingir límite con CSS/mocks.


### J59

**id**: J59

**name**: Settings

**classification**: SUPPORTING_JOURNEY

**task_criticality**: IMPORTANT

**user_type**: ADMIN

**role**: ADMIN

**scope**: ORGANIZATION

**goal**: Settings

**entry_state**: Settings separa perfil/equipo/tipos; equipo ofrece abrir usuarios y zona de peligro distinta del historial.

**route**: /app

**steps**: [
  "Settings separa perfil/equipo/tipos; equipo ofrece abrir usuarios y zona de peligro distinta del historial.",
  "Navegar pestañas sin guardar ajustes."
]

**decisions**: Navegar pestañas sin guardar ajustes.

**inputs**: Navegar pestañas sin guardar ajustes.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Settings separa perfil/equipo/tipos; equipo ofrece abrir usuarios y zona de peligro distinta del historial.

**error**: Reset visible no ejecutado; configuraciones de organización no modificadas.

**recovery**: Reset visible no ejecutado; configuraciones de organización no modificadas.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Settings separa perfil/equipo/tipos; equipo ofrece abrir usuarios y zona de peligro distinta del historial.

**viewport**: [
  "1440x813"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E048",
  "E050"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components/shift-dashboard/SettingsModal.tsx

**coverage**: PARTIAL

**coverage_limit**: Reset visible no ejecutado; configuraciones de organización no modificadas.


### J60

**id**: J60

**name**: Language ES → EN

**classification**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Language ES → EN

**entry_state**: ES→EN actualiza controles principales

**route**: /app

**steps**: [
  "ES→EN actualiza controles principales. Pricing conserva mes/Desde y html lang permanece es; F08/F09.",
  "Cambio de locale público y Employee; variantes visibles."
]

**decisions**: Cambio de locale público y Employee; variantes visibles.

**inputs**: Cambio de locale público y Employee; variantes visibles.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: ES→EN actualiza controles principales. Pricing conserva mes/Desde y html lang permanece es; F08/F09.

**error**: No se auditó todo el catálogo TS ni errores autenticados; scanner reporta locales vacíos.

**recovery**: No se auditó todo el catálogo TS ni errores autenticados; scanner reporta locales vacíos.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: ES→EN actualiza controles principales. Pricing conserva mes/Desde y html lang permanece es; F08/F09.

**viewport**: [
  "1440x900",
  "768x1024"
]

**theme**: [
  "dark",
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E025",
  "E031",
  "E045",
  "E049",
  "E063"
]

**browser_environment**: [
  "LOCAL_BUILD",
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/lib/use-i18n.ts; index.html

**coverage**: PARTIAL

**coverage_limit**: No se auditó todo el catálogo TS ni errores autenticados; scanner reporta locales vacíos.


### J61

**id**: J61

**name**: Dark → Light

**classification**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Dark → Light

**entry_state**: Ciclo oscuro→sistema→claro comprobado; claro real distinto de sistema con apariencia oscura.

**route**: /app

**steps**: [
  "Ciclo oscuro→sistema→claro comprobado; claro real distinto de sistema con apariencia oscura.",
  "Preferencia local; calendario/import/auth/manual en claro, gestión en oscuro."
]

**decisions**: Preferencia local; calendario/import/auth/manual en claro, gestión en oscuro.

**inputs**: Preferencia local; calendario/import/auth/manual en claro, gestión en oscuro.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Ciclo oscuro→sistema→claro comprobado; claro real distinto de sistema con apariencia oscura.

**error**: No matriz completa de todas las pantallas/estados; contrastes de gradiente no resueltos por axe.

**recovery**: No matriz completa de todas las pantallas/estados; contrastes de gradiente no resueltos por axe.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Ciclo oscuro→sistema→claro comprobado; claro real distinto de sistema con apariencia oscura.

**viewport**: [
  "1440x900",
  "390x844",
  "768x1024"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E025",
  "E027",
  "E059",
  "E063"
]

**browser_environment**: [
  "LOCAL_BUILD",
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/lib/theme.ts; src/index.css

**coverage**: PARTIAL

**coverage_limit**: No matriz completa de todas las pantallas/estados; contrastes de gradiente no resueltos por axe.


### J62

**id**: J62

**name**: Cookie preferences

**classification**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Cookie preferences

**entry_state**: Panel de cookies nombra categorías, necesarias fijas y opcionales apagadas.

**route**: /legal

**steps**: [
  "Panel de cookies nombra categorías, necesarias fijas y opcionales apagadas.",
  "Abrir preferencias, inspeccionar sin activar tracking."
]

**decisions**: Abrir preferencias, inspeccionar sin activar tracking.

**inputs**: Abrir preferencias, inspeccionar sin activar tracking.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Panel de cookies nombra categorías, necesarias fijas y opcionales apagadas.

**error**: No conclusión jurídica ni verificación de todos los scripts de terceros.

**recovery**: No conclusión jurídica ni verificación de todos los scripts de terceros.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Panel de cookies nombra categorías, necesarias fijas y opcionales apagadas.

**viewport**: [
  "430x932"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E043"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/components

**coverage**: COVERED

**coverage_limit**: No conclusión jurídica ni verificación de todos los scripts de terceros.


### J63

**id**: J63

**name**: Legal navigation

**classification**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**user_type**: VISITOR / GUEST

**role**: VISITOR / GUEST

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Legal navigation

**entry_state**: Privacy y Terms accesibles desde superficies públicas a 430px, con contenido EN.

**route**: /privacy

**steps**: [
  "Privacy y Terms accesibles desde superficies públicas a 430px, con contenido EN.",
  "Abrir enlaces legales y volver."
]

**decisions**: Abrir enlaces legales y volver.

**inputs**: Abrir enlaces legales y volver.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Privacy y Terms accesibles desde superficies públicas a 430px, con contenido EN.

**error**: Legibilidad visual evaluada; suficiencia legal no certificada.

**recovery**: Legibilidad visual evaluada; suficiencia legal no certificada.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Privacy y Terms accesibles desde superficies públicas a 430px, con contenido EN.

**viewport**: [
  "430x932"
]

**theme**: [
  "light"
]

**locale**: [
  "en"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E037",
  "E042"
]

**browser_environment**: [
  "PRODUCTION"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/App.tsx

**coverage**: COVERED

**coverage_limit**: Legibilidad visual evaluada; suficiencia legal no certificada.


### J64

**id**: J64

**name**: Logout

**classification**: SUPPORTING_JOURNEY

**task_criticality**: SUPPORTING

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Logout

**entry_state**: Menú de cuenta y logout existen; no se catalogó cierre de sesión al terminar cada recorrido.

**route**: /app

**steps**: [
  "Menú de cuenta y logout existen; no se catalogó cierre de sesión al terminar cada recorrido.",
  "Sesiones de auditoría aisladas; no cambiar cuenta de usuario real."
]

**decisions**: Sesiones de auditoría aisladas; no cambiar cuenta de usuario real.

**inputs**: Sesiones de auditoría aisladas; no cambiar cuenta de usuario real.

**context_switches**: Landing/auth/app según ruta; sin cambio operativo de tenant

**scroll**: NOT_EVALUATED

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Menú de cuenta y logout existen; no se catalogó cierre de sesión al terminar cada recorrido.

**error**: Logout end-to-end y limpieza de copia local/estado remoto quedan código.

**recovery**: Logout end-to-end y limpieza de copia local/estado remoto quedan código.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Menú de cuenta y logout existen; no se catalogó cierre de sesión al terminar cada recorrido.

**viewport**: [
  "NOT_EVALUATED"
]

**theme**: [
  "NOT_EVALUATED"
]

**locale**: [
  "NOT_EVALUATED"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: []

**browser_environment**: [
  "UNKNOWN"
]

**evidence_level**: MEASURED_CODE

**code_reference**: api/auth/logout.js; src/App.tsx

**coverage**: PARTIAL

**coverage_limit**: Logout end-to-end y limpieza de copia local/estado remoto quedan código.


### J65

**id**: J65

**name**: Session recovery

**classification**: RECOVERY_JOURNEY

**task_criticality**: SUPPORTING

**user_type**: ROLE_DEPENDENT

**role**: ROLE_DEPENDENT

**scope**: Según sesión; no inferir scope desde filtro

**goal**: Session recovery

**entry_state**: Sesión existente soportó navegación y apertura de múltiples modales

**route**: /app

**steps**: [
  "Sesión existente soportó navegación y apertura de múltiples modales. No se indujo expiración ni revocación de membership.",
  "Mantener cuenta durante revisión; reabrir tras interrupciones de herramienta no es prueba de recovery del producto."
]

**decisions**: Mantener cuenta durante revisión; reabrir tras interrupciones de herramienta no es prueba de recovery del producto.

**inputs**: Mantener cuenta durante revisión; reabrir tras interrupciones de herramienta no es prueba de recovery del producto.

**context_switches**: Overlay sobre /app; conserva contexto de fondo

**scroll**: Medición específica en evidencias asociadas

**wait_states**: Parse/carga observada cuando se describe; latencias no cronometradas sistemáticamente

**loading**: No se evaluaron todos los transitorios

**disabled**: Condición concreta descrita en observación/evidencia; no inferir acción permitida desde apariencia

**success**: Sesión existente soportó navegación y apertura de múltiples modales. No se indujo expiración ni revocación de membership.

**error**: Caducidad, cambio de org y migración local→remota one-shot no verificados en browser.

**recovery**: Caducidad, cambio de org y migración local→remota one-shot no verificados en browser.

**data_preservation**: No cambios operativos realizados; persistencia de recovery no afirmada

**success_state**: Resultado observado anterior al límite: Sesión existente soportó navegación y apertura de múltiples modales. No se indujo expiración ni revocación de membership.

**viewport**: [
  "1440x900",
  "390x844"
]

**theme**: [
  "dark"
]

**locale**: [
  "es"
]

**keyboard_notes**: No prueba exhaustiva de teclado en este journey

**screenshot_reference**: [
  "E003",
  "E026"
]

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence_level**: MEASURED_BROWSER

**code_reference**: src/lib/session.ts; src/lib/storage.ts

**coverage**: PARTIAL

**coverage_limit**: Caducidad, cambio de org y migración local→remota one-shot no verificados en browser.


## 15 · Screen map y experience map

Las rutas no describen por sí solas el producto: gran parte de la operación vive en modales sobre /app. Abrir Planificar crea un workspace modal en /app/schedule. La navegación lateral visible detrás no debe tratarse como accionable mientras el overlay está abierto.


### Registro

**pantalla**: Landing / pricing / legal

**entrada**: / y enlaces públicos

**respuesta**: Promesa, planes, confianza y acceso

**fricción**: Precio EN mezclado; expectativas de publicación

**evidencia**: E027–E043


### Registro

**pantalla**: Auth

**entrada**: Start free / Sign in

**respuesta**: Registro/login/guest

**fricción**: Alta completa y recovery no ejecutados

**evidencia**: E035,E036,E065


### Registro

**pantalla**: Calendario

**entrada**: /app

**respuesta**: Mes, métricas, contexto por rol

**fricción**: Doble desplazamiento horizontal móvil

**evidencia**: E003,E014–E026


### Registro

**pantalla**: Importador

**entrada**: Importar turnos

**respuesta**: Archivo→parse→preview→decisión→confirmación

**fricción**: Lista móvil colapsada; resumen temporal; nombres accesibles

**evidencia**: E010–E013,E041,E046,E049,E052–E064


### Registro

**pantalla**: Equipo / usuarios

**entrada**: Equipo y Ajustes→Equipo→Abrir Usuarios

**respuesta**: Personas/roles/áreas y gestión legacy

**fricción**: Dos puntos de gestión; conteos bulk

**evidencia**: E006–E008,E038–E057


### Registro

**pantalla**: Planificación

**entrada**: /app/schedule

**respuesta**: Semana→borrador→editor→publicación

**fricción**: Tabla móvil requiere desplazamiento; no versión publicada probada

**evidencia**: E012,E022,E023


### Registro

**pantalla**: Solicitudes

**entrada**: Shell Employee

**respuesta**: Lista→formulario→validación

**fricción**: Recepción/decisión y acuse no completados

**evidencia**: E033,E034,E045


### Registro

**pantalla**: Historial / formatos

**entrada**: Navegación Admin

**respuesta**: Carga→lista vacía/filtros

**fricción**: Sin datos para evaluar resultados y lifecycle

**evidencia**: E005,E058


## 16 · Safe Import: análisis de estados

El flujo separa selección y lectura de escritura. CSV válido produce cinco candidatos; quitar una fila conserva cuatro. La clasificación de código desconocido permite recuperar candidatos sin persistir un formato (recordar desmarcado). El workbook multihoja llega a 674 filas; eso prueba procesamiento, no equivalencia exacta de cada fila. PDF/imagen difíciles terminan en Unsupported con cero filas y guía. No se ha demostrado un PDF legible exitoso ni el fallback VLM autenticado. La mayor rotura es espacial: READY existe, pero no se puede revisar visualmente en móvil.


### Registro

**estado**: FILE_SELECTION / PARSE

**observado**: Archivo seleccionado, formato, Processing file y duración final; selección no escribe. E054.


### Registro

**estado**: MATCHING

**observado**: Employee ajeno bloquea self-import; ambiguos de equipo no retesteados. E041.


### Registro

**estado**: PARTIAL / UNKNOWN

**observado**: Asistente de clasificación y posterior recuperación; no desaparecen todas las filas. E046/E049.


### Registro

**estado**: READY / PREVIEW

**observado**: Edición y retirada precommit funcionan desktop; lista móvil h=0. E011/E059.


### Registro

**estado**: TEMPORAL / SUMMARY

**observado**: Decisión históricos-only no se refleja en badge futuro. E064.


### Registro

**estado**: CONFIRM / SUCCESS

**observado**: Gate invitado explícito. Guardado autenticado y resultado no ejecutados.


### Registro

**estado**: IDEMPOTENCY / CONFLICT

**observado**: Código org+employee+fingerprint; no reimportación persistida ni resolución browser.


## 17 · Memoria y ciclo de formatos

El modelo vigente usa candidate, validated, verified, legacy y deprecated. «Previous» y «Disabled» son vocabulario de presentación, no nuevos estados de almacenamiento. La store local puede tratar perfiles enseñados como validated; la remota gestiona candidatos y validación. La lista Admin está vacía. Existen acciones de renombrar, confirmar y desactivar/reactivar en código, además de familias/versiones y firmas para deduplicación. No se equipara su presencia en código con descubrimiento, reutilización exacta o aislamiento comprobado en navegador. Próxima prueba necesaria: dos organizaciones sintéticas con un perfil validado, duplicado exacto y variante, sin datos personales.


## 18 · Historial y auditabilidad

El historial tiene entrada propia, filtros de ámbito/tipo/formato/estado y paginación adaptativa. La organización sintética no tenía importaciones: fecha, ejecutor, período, personas, turnos fuente/creados/existentes y estado eliminado solo se verifican en implementación. El DELETE revisado limita import_id y organization_id y transacciona borrado de turnos con soft-delete del registro. Los manuales con import_id NULL quedan fuera del predicado. Esta es una garantía de diseño revisada, no una eliminación browser observada. Reset de organización es otra acción en Settings y no se ejecutó.


## 19 · Calendario y turnos manuales

Desktop mantiene el mes como contenido dominante y la identidad organizativa visible. En móvil, grilla y métricas requieren desplazamientos horizontales separados. La barra puede ser visible cuando la herramienta no la oculta, por lo que no se sostiene una inaccesibilidad absoluta de jueves a domingo. El formulario de pasado ofrece fecha limitada, hora y tipo; Escape devuelve foco al disparador. No se guardó ni eliminó un turno manual. La distinción de pasado/futuro aparece en los nombres de las acciones, aunque no sustituye la prueba de publicación posterior.


## 20 · Planificación, publicación y versiones

La semana 7–13 septiembre muestra BORRADOR EDITABLE y cero turnos; Publicar está deshabilitado. Este borrador era preexistente. El editor móvil aparece como modal con acciones visibles, corrigiendo la superposición inline histórica. La tabla alternativa conserva filas de empleado/fecha pero deja parte del horario fuera del viewport. No se crearon asignaciones ni versiones: el paso publicar→turnos visibles por Employee no puede darse por verificado. La etiqueta de borrador es una fortaleza que debe conservarse; la certeza sobre destino efectivo debe extenderse al resumen del importador.


## 21 · Employee, solicitudes y aprobaciones

Employee accede a calendario común, importación propia, pasado y solicitudes. No ve gestión de equipo ni Planificar. Las solicitudes tienen filtros de estado y formulario con validación previa; se inspeccionaron ES/EN y móvil. Sin solicitudes pendientes no se midieron recepción Admin, aprobación, rechazo ni estado final. El acuse de recepción tiene implementación en ShiftDetail, pero solo se monta desde PortalShell, que no está conectado al App actual. Este gap no se resuelve declarando PORTAL como superficie secundaria: hay que recuperar la acción en el shell que el Employee realmente utiliza.


## 22 · Personas, accesos, roles y áreas

La nueva gestión distingue tres personas de dos accesos, permite una ficha sin cuenta y explicita scope y rol. El wizard llega a un resumen que separa Acceso No / Ficha Sí. Admin no recibe Owner como opción ordinaria. Las áreas muestran conteos y las asignaciones incluyen fecha efectiva. Son buenas decisiones para evitar equiparar User y Employee. El catálogo es pequeño: no se midieron latencias, búsqueda o selección con cientos de personas. Los flujos legacy y nuevo deben dar acceso coherente a acciones masivas sin obligar a conocer su historia de implementación.


## 23 · Provisioning masivo y credenciales

Se probaron previews sin confirmar. El CSV de usuarios detecta rol inválido, email inválido, empleado inexistente y duplicado de email. Sin embargo, no_employee agrega tanto un miembro existente sin vínculo como un nuevo usuario sin vínculo; el resumen cuenta ambos como ya miembros. En empleados, dos filas con el mismo ID nuevo se presentan ambas como nuevas. La validación backend posterior no corrige la expectativa anterior a confirmar. Generación, visibilidad única y exportación de credenciales quedaron sin ejecutar; el informe no incluye secretos. Debe comprobarse con fixture aislada qué sucede al cerrar sin descargar y si el usuario puede recuperar acceso sin recuperar la contraseña en texto claro.


## 24 · Shell y workspaces por rol

La navegación agrupa Operación, Gestión y Configuración en Admin; Employee elimina controles de gestión. El contexto persistente comunica organización/rol/empleado/área. El calendario es el workspace de consulta, el planner el de preparación, el importador el de revisión y Equipo el de identidades. La economía visual depende del estado: el mismo uploader útil al inicio compite con la tabla después del parse. No se recomienda eliminar controles de scope necesarios ni convertir la herramienta operativa en una landing.


### Registro

**workspace**: Employee calendar

**dominante**: Mes y turnos propios

**acción**: Consultar / solicitar cambio

**chrome**: Shell reducido, métricas todavía densas

**evidencia**: E026


### Registro

**workspace**: Admin calendar

**dominante**: Mes y contexto empleado

**acción**: Importar / planificar

**chrome**: Nav lateral y contexto

**evidencia**: E003


### Registro

**workspace**: Planner

**dominante**: Semana de empleados

**acción**: Editar / publicar

**chrome**: Semana, filtros, estado, vista

**evidencia**: E012/E023


### Registro

**workspace**: Import

**dominante**: Debería ser preview tras parse

**acción**: Revisar / confirmar

**chrome**: Uploader y formulario retienen espacio

**evidencia**: E059/E061


### Registro

**workspace**: Team

**dominante**: Personas/accesos/áreas

**acción**: Añadir persona

**chrome**: Tabs y búsqueda

**evidencia**: E006/E040


### Registro

**workspace**: History

**dominante**: Registros/filtros

**acción**: Consultar / borrar uno

**chrome**: Modal; lista vacía

**evidencia**: E005


## 25 · Viewport economy

Medidas DOM en las capturas, no porcentajes estéticos inventados. La cinta de métricas mantiene un ancho de contenido de aproximadamente 1135px y calendario 780px a 390px; clientWidth medido varía con la barra del navegador. En E059, panel de resultados h=167px y scrollHeight=443, overflow hidden; lista interior h=0 y scrollHeight=285. En landscape también h=0. No se midieron sistemáticamente todos los ACTION_COUNT, PERSISTENT_ROWS y alturas de chrome de cada pantalla: esos campos quedan NOT_EVALUATED.


### Registro

**evidence**: E003

**viewport**: 1440x900

**element**: app-shell__topbar

**start_y**: 0

**height**: 63

**client_width**: 1176

**scroll_width**: 1176

**scroll_height**: 62

**overflow**: visible/visible


### Registro

**evidence**: E003

**viewport**: 1440x900

**element**: app-shell__main

**start_y**: 63

**height**: 837

**client_width**: 1176

**scroll_width**: 1176

**scroll_height**: 837

**overflow**: visible/visible


### Registro

**evidence**: E003

**viewport**: 1440x900

**element**: totals-ribbon

**start_y**: 163

**height**: 49

**client_width**: 1128

**scroll_width**: 1169

**scroll_height**: 49

**overflow**: auto/hidden


### Registro

**evidence**: E003

**viewport**: 1440x900

**element**: month-grid-shell

**start_y**: 218

**height**: 662

**client_width**: 1128

**scroll_width**: 1128

**scroll_height**: 662

**overflow**: auto/hidden


### Registro

**evidence**: E014

**viewport**: 390x844

**element**: app-shell__topbar

**start_y**: 0

**height**: 62

**client_width**: 375

**scroll_width**: 375

**scroll_height**: 61

**overflow**: visible/visible


### Registro

**evidence**: E014

**viewport**: 390x844

**element**: app-shell__main

**start_y**: 62

**height**: 782

**client_width**: 375

**scroll_width**: 375

**scroll_height**: 782

**overflow**: visible/visible


### Registro

**evidence**: E014

**viewport**: 390x844

**element**: totals-ribbon

**start_y**: 232

**height**: 69

**client_width**: 355

**scroll_width**: 1135

**scroll_height**: 58

**overflow**: auto/hidden


### Registro

**evidence**: E014

**viewport**: 390x844

**element**: month-grid-shell

**start_y**: 307

**height**: 521

**client_width**: 355

**scroll_width**: 780

**scroll_height**: 510

**overflow**: auto/hidden


### Registro

**evidence**: E016

**viewport**: 768x1024

**element**: app-shell__topbar

**start_y**: 0

**height**: 63

**client_width**: 768

**scroll_width**: 768

**scroll_height**: 62

**overflow**: visible/visible


### Registro

**evidence**: E016

**viewport**: 768x1024

**element**: app-shell__main

**start_y**: 63

**height**: 961

**client_width**: 768

**scroll_width**: 768

**scroll_height**: 961

**overflow**: visible/visible


### Registro

**evidence**: E016

**viewport**: 768x1024

**element**: totals-ribbon

**start_y**: 207

**height**: 66

**client_width**: 736

**scroll_width**: 1137

**scroll_height**: 55

**overflow**: auto/hidden


### Registro

**evidence**: E016

**viewport**: 768x1024

**element**: month-grid-shell

**start_y**: 279

**height**: 725

**client_width**: 736

**scroll_width**: 760

**scroll_height**: 714

**overflow**: auto/hidden


### Registro

**evidence**: E019

**viewport**: 1440x900

**element**: app-shell__topbar

**start_y**: 0

**height**: 63

**client_width**: 1176

**scroll_width**: 1176

**scroll_height**: 62

**overflow**: visible/visible


### Registro

**evidence**: E019

**viewport**: 1440x900

**element**: app-shell__main

**start_y**: 63

**height**: 837

**client_width**: 1176

**scroll_width**: 1176

**scroll_height**: 837

**overflow**: visible/visible


### Registro

**evidence**: E019

**viewport**: 1440x900

**element**: totals-ribbon

**start_y**: 207

**height**: 60

**client_width**: 1128

**scroll_width**: 1141

**scroll_height**: 49

**overflow**: auto/hidden


### Registro

**evidence**: E019

**viewport**: 1440x900

**element**: month-grid-shell

**start_y**: 273

**height**: 607

**client_width**: 1128

**scroll_width**: 1128

**scroll_height**: 607

**overflow**: auto/hidden


### Registro

**evidence**: E021

**viewport**: 844x390

**element**: app-shell__topbar

**start_y**: 0

**height**: 63

**client_width**: 829

**scroll_width**: 829

**scroll_height**: 62

**overflow**: visible/visible


### Registro

**evidence**: E021

**viewport**: 844x390

**element**: app-shell__main

**start_y**: 63

**height**: 512

**client_width**: 829

**scroll_width**: 829

**scroll_height**: 512

**overflow**: visible/visible


### Registro

**evidence**: E021

**viewport**: 844x390

**element**: totals-ribbon

**start_y**: 207

**height**: 54

**client_width**: 797

**scroll_width**: 1137

**scroll_height**: 43

**overflow**: auto/hidden


### Registro

**evidence**: E021

**viewport**: 844x390

**element**: month-grid-shell

**start_y**: 267

**height**: 288

**client_width**: 797

**scroll_width**: 797

**scroll_height**: 288

**overflow**: auto/auto


### Registro

**evidence**: E023

**viewport**: 390x844

**element**: app-shell__topbar

**start_y**: 0

**height**: 62

**client_width**: 390

**scroll_width**: 390

**scroll_height**: 61

**overflow**: visible/visible


### Registro

**evidence**: E023

**viewport**: 390x844

**element**: app-shell__main

**start_y**: 62

**height**: 782

**client_width**: 390

**scroll_width**: 390

**scroll_height**: 782

**overflow**: visible/visible


### Registro

**evidence**: E023

**viewport**: 390x844

**element**: modal-content modal-content--workspace modal-content--fullscreen

**start_y**: 0

**height**: 844

**client_width**: 388

**scroll_width**: 388

**scroll_height**: 842

**overflow**: hidden/hidden


### Registro

**evidence**: E023

**viewport**: 390x844

**element**: weekly-planner__header

**start_y**: 17

**height**: 102

**client_width**: 364

**scroll_width**: 364

**scroll_height**: 102

**overflow**: visible/visible


### Registro

**evidence**: E059

**viewport**: 390x844

**element**: app-shell__topbar

**start_y**: 0

**height**: 62

**client_width**: 375

**scroll_width**: 375

**scroll_height**: 61

**overflow**: visible/visible


### Registro

**evidence**: E059

**viewport**: 390x844

**element**: app-shell__main

**start_y**: 62

**height**: 782

**client_width**: 375

**scroll_width**: 375

**scroll_height**: 782

**overflow**: visible/visible


### Registro

**evidence**: E059

**viewport**: 390x844

**element**: totals-ribbon

**start_y**: 232

**height**: 69

**client_width**: 355

**scroll_width**: 1130

**scroll_height**: 58

**overflow**: auto/hidden


### Registro

**evidence**: E059

**viewport**: 390x844

**element**: month-grid-shell

**start_y**: 307

**height**: 521

**client_width**: 355

**scroll_width**: 780

**scroll_height**: 510

**overflow**: auto/hidden


### Registro

**evidence**: E059

**viewport**: 390x844

**element**: modal-content import-modal

**start_y**: 10

**height**: 824

**client_width**: 368

**scroll_width**: 475

**scroll_height**: 822

**overflow**: hidden/hidden


### Registro

**evidence**: E060

**viewport**: 430x932

**element**: app-shell__topbar

**start_y**: 0

**height**: 62

**client_width**: 415

**scroll_width**: 415

**scroll_height**: 61

**overflow**: visible/visible


### Registro

**evidence**: E060

**viewport**: 430x932

**element**: app-shell__main

**start_y**: 62

**height**: 870

**client_width**: 415

**scroll_width**: 415

**scroll_height**: 870

**overflow**: visible/visible


### Registro

**evidence**: E060

**viewport**: 430x932

**element**: totals-ribbon

**start_y**: 232

**height**: 69

**client_width**: 395

**scroll_width**: 1130

**scroll_height**: 58

**overflow**: auto/hidden


### Registro

**evidence**: E060

**viewport**: 430x932

**element**: month-grid-shell

**start_y**: 307

**height**: 609

**client_width**: 395

**scroll_width**: 780

**scroll_height**: 598

**overflow**: auto/hidden


### Registro

**evidence**: E060

**viewport**: 430x932

**element**: modal-content import-modal

**start_y**: 10

**height**: 912

**client_width**: 408

**scroll_width**: 475

**scroll_height**: 910

**overflow**: hidden/hidden


### Registro

**evidence**: E061

**viewport**: 768x1024

**element**: app-shell__topbar

**start_y**: 0

**height**: 63

**client_width**: 768

**scroll_width**: 768

**scroll_height**: 62

**overflow**: visible/visible


### Registro

**evidence**: E061

**viewport**: 768x1024

**element**: app-shell__main

**start_y**: 63

**height**: 961

**client_width**: 768

**scroll_width**: 768

**scroll_height**: 961

**overflow**: visible/visible


### Registro

**evidence**: E061

**viewport**: 768x1024

**element**: totals-ribbon

**start_y**: 207

**height**: 66

**client_width**: 736

**scroll_width**: 1132

**scroll_height**: 55

**overflow**: auto/hidden


### Registro

**evidence**: E061

**viewport**: 768x1024

**element**: month-grid-shell

**start_y**: 279

**height**: 725

**client_width**: 736

**scroll_width**: 760

**scroll_height**: 714

**overflow**: auto/hidden


### Registro

**evidence**: E061

**viewport**: 768x1024

**element**: modal-content import-modal

**start_y**: 61

**height**: 901

**client_width**: 735

**scroll_width**: 735

**scroll_height**: 899

**overflow**: hidden/hidden


### Registro

**evidence**: E062

**viewport**: 844x390

**element**: app-shell__topbar

**start_y**: 0

**height**: 63

**client_width**: 829

**scroll_width**: 829

**scroll_height**: 62

**overflow**: visible/visible


### Registro

**evidence**: E062

**viewport**: 844x390

**element**: app-shell__main

**start_y**: 63

**height**: 512

**client_width**: 829

**scroll_width**: 829

**scroll_height**: 512

**overflow**: visible/visible


### Registro

**evidence**: E062

**viewport**: 844x390

**element**: totals-ribbon

**start_y**: 207

**height**: 54

**client_width**: 797

**scroll_width**: 1132

**scroll_height**: 43

**overflow**: auto/hidden


### Registro

**evidence**: E062

**viewport**: 844x390

**element**: month-grid-shell

**start_y**: 267

**height**: 288

**client_width**: 797

**scroll_width**: 797

**scroll_height**: 288

**overflow**: auto/auto


### Registro

**evidence**: E062

**viewport**: 844x390

**element**: modal-content import-modal

**start_y**: 23

**height**: 343

**client_width**: 803

**scroll_width**: 803

**scroll_height**: 341

**overflow**: hidden/hidden


## 26 · Jerarquía de acciones y densidad

Procesar sigue siendo una acción dorada incluso después de Ready, pero no está universalmente disabled. El CTA de confirmación bloqueado por login repite una frase larga que se corta en móvil. Archivo/controles deberían convertirse en resumen compacto cuando la tarea pasa a revisar. En Equipo, añadir persona y acceso masivo tienen modelos de entrada diferentes; en historial el borrado debe seguir ligado al registro y nunca acercarse al reset global. En planner, Publicar se entiende como acción final gracias al badge de borrador. No se recomienda ocultar restricciones de seguridad para reducir clics.


## 27 · Estados y recuperación

Los estados siguientes se evalúan por cuatro preguntas: qué ocurre, por qué, siguiente acción y conservación. No todos los transitorios se capturaron.


### Registro

**estado**: FIRST_USE / AUTH

**qué**: Registro/login y guest

**siguiente**: Datos requeridos o continuar sin cuenta

**preservación**: Alta final no ejecutada; validación cliente vista


### Registro

**estado**: EMPTY

**qué**: Historial, formatos y solicitudes vacíos

**siguiente**: Importar/enseñar/crear solicitud según contexto

**preservación**: No se confunde con error de red; datos inexistentes en fixture


### Registro

**estado**: NO_RESULTS

**qué**: Búsqueda de personas sin coincidencias

**siguiente**: Cambiar término

**preservación**: Catálogo permanece; E040


### Registro

**estado**: PARSING

**qué**: Processing file

**siguiente**: Esperar resultado

**preservación**: Archivo sigue identificado; tiempo final visible


### Registro

**estado**: UNSUPPORTED

**qué**: No interpretable; cero filas

**siguiente**: Otro formato/archivo

**preservación**: No turnos guardados, no éxito falso


### Registro

**estado**: PARTIAL / BLOCKED

**qué**: Código o identidad requieren decisión

**siguiente**: Asistente o corrección

**preservación**: Preview recuperada en E049


### Registro

**estado**: READY

**qué**: Candidatos preparados

**siguiente**: Revisar y confirmar con sesión

**preservación**: En móvil inaccesible visualmente, F01


### Registro

**estado**: BULK INVALID

**qué**: Motivo por fila

**siguiente**: Atrás y corregir CSV

**preservación**: No alta hasta confirmar; conteos inexactos F05


### Registro

**estado**: SAVING / IMPORTING / PUBLISHING / DELETING

**qué**: Implementación inspeccionada

**siguiente**: NOT_EVALUATED browser

**preservación**: No inducir mutaciones para fabricar evidencia


### Registro

**estado**: PERMISSION_DENIED / PLAN_LIMIT

**qué**: Contrato backend y gates UI

**siguiente**: Solo gate invitado observado

**preservación**: No pruebas de elevación ni usuarios reales


### Registro

**estado**: APPROVED / REJECTED / DELETED

**qué**: Modelo y filtros presentes

**siguiente**: NOT_EVALUATED con registros reales

**preservación**: No conclusiones visuales desde código


## 28 · Responsive

La matriz obligatoria de ocho tamaños se cubrió para calendario; esto no significa ocho tamaños por cada pantalla. Import preview se amplió a 390,430,768 y landscape; auth a430; planner y editor a390; bulk a390; manual a768. History/Team/áreas/tipos tienen cobertura desktop principal. La equivalencia móvil del producto completo no está demostrada. E061 muestra tabla tablet con campos estrechos: ver cuatro cifras de fecha no basta para revisar la fecha completa. El bloqueo móvil de importador y la densidad de calendario/planner son materiales, aunque bulk preview sí conserva un footer accesible a390.


## 29 · Temas e i18n

Dark y Light reales se distinguen de la preferencia System. Calendario, landing, auth y preview tienen muestras claras; gestión autenticada se revisó principalmente dark. EN está presente en import, solicitudes, auth y superficies públicas. Dos fallos distintos: el documento sigue lang=es al mostrar EN; pricing concatena precios españoles con /mo. Hay controles Close en algunas pantallas ES. El scanner i18n terminó, pero no encontró locales por estar en un catálogo TypeScript: MATERIAL_COVERAGE=FALSE. No se certifica el catálogo completo ni se marca accesibilidad lingüística PASS.


## 30 · Accesibilidad

Se combinó skill estática, árbol browser, DOM, axe y teclado. Axe 4.12.1 en preview: 3 reglas con violaciones, 45 passes y 2 incomplete. Los controles de fila sin nombre se corroboran en DOM y código. Contrast quedó incompleto por gradientes; no equivale a buen contraste. Tab entra en formulario manual, Escape cierra y restaura foco a Add past shift. No se completó un ciclo de focus trap por cada modal, lector de pantalla, reduced-motion en browser ni medición de todos los touch targets. Los selectores de color actuales sí están nombrados por tipo, corrección puntual de F4 histórico.


## 31 · Superficie premium y sistema visual

La paleta navy, verde y dorado, las superficies claras/oscuras y la tipografía editorial mantienen identidad Anclora. Desktop transmite estructura operativa más que una colección arbitraria de tarjetas. En estados complejos, la calidad cae por reparto espacial y precisión de feedback: uploader dominante, doble mensaje de login, métricas anchas y gestión duplicada. La mejora premium necesaria es sobriedad funcional: jerarquizar el paso actual, exponer destinos efectivos y mantener densidad legible. No hay evidencia suficiente para declarar toda la interfaz GENERIC_SAAS, AI_SLOP o brand erasure; esos rótulos no se usan como findings decorativos.


## 32 · Landing secundaria

La landing presenta promesa, explicación, equipos, planes y CTA. El menú móvil actual agrupa idioma/tema/enlaces; se confirma la mejora frente a F7. La promesa todavía simplifica el camino desde documento hasta calendario operativo y debe convivir con publicación de futuros. El contenido legal es navegable, sin evaluación de suficiencia jurídica. Pricing EN tiene un defecto de formato/copy; su scorecard se mantiene separado de APPLICATION.


## 33 · Findings de producto

Nueve findings PRODUCT_UX; ninguna limitación de cuenta QA se convierte en PRODUCT_ACCESS. Severidad máxima HIGH. La lista incluye un hallazgo de integración MEASURED_CODE explícito, no presentado como fallo visual probado. Las estimaciones de frecuencia son condicionales al estado, no analítica de uso.


### CX-F01

**id**: CX-F01

**title**: La revisión de turnos desaparece en móvil

**category**: RESPONSIVE

**finding_scope**: PRODUCT_UX

**surface**: APPLICATION

**journey**: J24

**screen**: [
  "Importar",
  "import"
]

**user_type**: EMPLOYEE / GUEST / ADMIN

**task_criticality**: CORE

**friction_type**: TASK_FRICTION

**severity**: HIGH

**priority**: P1

**evidence_level**: MEASURED_BROWSER

**browser_environment**: [
  "PRODUCTION"
]

**evidence**: {
  "screenshots": [
    "E013",
    "E059",
    "E060",
    "E061",
    "E062"
  ],
  "code": "src/components/shift-dashboard/ImportModal.tsx; src/index.css",
  "qualification": "Condiciones observadas descritas; sin inferir frecuencia analítica ni éxito de escrituras."
}

**frequency**: RECURRING

**current_behavior**: A390×844 y 844×390 hay cinco filas en DOM, pero su lista mide 0px; el panel padre recorta su contenido. A768 los campos quedan estrechos.

**root_ux_cause**: Altura de workspace fija repartida entre uploader, formulario y resúmenes que no ceden espacio tras parse.

**why_it_matters**: Impide revisar fechas/horas antes de confirmar en el flujo central; la seguridad de preview pierde su función práctica.

**user_impact**: Impide revisar fechas/horas antes de confirmar en el flujo central; la seguridad de preview pierde su función práctica.

**recommended_change**: Tras parse, compactar archivo/identidad en resumen expandible y dar a la revisión una región visible mínima; permitir scroll vertical accesible cuando no quepa; adaptar filas a lectura móvil.

**why_this_change**: Actúa sobre la causa observada y conserva el modelo de seguridad existente.

**expected_benefit**: El usuario puede ver cada fecha/hora, corregir y retirar filas en todos los tamaños sin perder el archivo.

**effort**: MEDIUM

**risk**: MEDIUM

**quick_win**: False

**dependencies**: [
  "Validar con fixtures sintéticas y roles autorizados; no cambiar permisos implícitamente."
]

**do_not_break**: [
  "Preview antes de escritura",
  "Identidad y período autoritativos",
  "Avisos de filas excluidas",
  "Focus y cierre seguro"
]

**implementation_guidance**: Tras parse, compactar archivo/identidad en resumen expandible y dar a la revisión una región visible mínima; permitir scroll vertical accesible cuando no quepa; adaptar filas a lectura móvil. Aplicar en src/components/shift-dashboard/ImportModal.tsx; src/index.css.

**affected_screens**: [
  "Importar",
  "import"
]

**affected_components**: [
  "src/components/shift-dashboard/ImportModal.tsx",
  "src/index.css"
]

**behavior_before**: A390×844 y 844×390 hay cinco filas en DOM, pero su lista mide 0px; el panel padre recorta su contenido. A768 los campos quedan estrechos.

**behavior_after**: El usuario puede ver cada fecha/hora, corregir y retirar filas en todos los tamaños sin perder el archivo.

**acceptance_criteria**: [
  "Given cinco filas Ready a390×844, When termina parse, Then al menos una fila completa es visible y todas son alcanzables.",
  "Given 844×390, When se abre revisión, Then el área de filas tiene altura positiva y las acciones no quedan recortadas.",
  "Given preview editada, When se cambia orientación o se expande archivo, Then se preservan cambios y selección temporal."
]

**ux_regression_risks**: [
  "Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.",
  "Confundir una mejora de presentación con permiso para realizar nuevas operaciones."
]


### CX-F02

**id**: CX-F02

**title**: Calendario, métricas y tabla semanal dependen de desplazamientos horizontales poco evidentes

**category**: RESPONSIVE

**finding_scope**: PRODUCT_UX

**surface**: APPLICATION

**journey**: J10/J34

**screen**: [
  "Calendario",
  "Planificador"
]

**user_type**: EMPLOYEE / GUEST / ADMIN

**task_criticality**: IMPORTANT

**friction_type**: TASK_FRICTION

**severity**: MEDIUM

**priority**: P2

**evidence_level**: MEASURED_BROWSER

**browser_environment**: [
  "LOCAL_BUILD",
  "PRODUCTION"
]

**evidence**: {
  "screenshots": [
    "E014",
    "E015",
    "E021",
    "E023"
  ],
  "code": "src/components/shift-dashboard/StatsBar.tsx; src/components/scheduling/AccessibleScheduleTable.tsx; src/index.css",
  "qualification": "Condiciones observadas descritas; sin inferir frecuencia analítica ni éxito de escrituras."
}

**frequency**: RECURRING

**current_behavior**: Calendario780px y métricas1135px sobre teléfono; planner deja horario fuera. Las barras pueden ser visibles con hide-scrollbars=false.

**root_ux_cause**: Densidad desktop mantenida en varios contenedores independientes.

**why_it_matters**: Aumenta el esfuerzo de encontrar todos los días/métricas; no se ha probado imposibilidad absoluta ni se justifica CRITICAL.

**user_impact**: Aumenta el esfuerzo de encontrar todos los días/métricas; no se ha probado imposibilidad absoluta ni se justifica CRITICAL.

**recommended_change**: Ofrecer agenda/semana móvil o indicación persistente de más contenido; mostrar total principal sin desplazamiento; mantener scroll de tabla nombrado y por teclado.

**why_this_change**: Actúa sobre la causa observada y conserva el modelo de seguridad existente.

**expected_benefit**: Todos los días/horarios se descubren sin ensayo y se conserva densidad de escritorio.

**effort**: MEDIUM

**risk**: MEDIUM

**quick_win**: False

**dependencies**: [
  "Validar con fixtures sintéticas y roles autorizados; no cambiar permisos implícitamente."
]

**do_not_break**: [
  "Siete días y detalle completo",
  "Tabla alternativa accesible",
  "Contexto de empleado",
  "Métricas desktop"
]

**implementation_guidance**: Ofrecer agenda/semana móvil o indicación persistente de más contenido; mostrar total principal sin desplazamiento; mantener scroll de tabla nombrado y por teclado. Aplicar en src/components/shift-dashboard/StatsBar.tsx; src/components/scheduling/AccessibleScheduleTable.tsx; src/index.css.

**affected_screens**: [
  "Calendario",
  "Planificador"
]

**affected_components**: [
  "src/components/shift-dashboard/StatsBar.tsx",
  "src/components/scheduling/AccessibleScheduleTable.tsx",
  "src/index.css"
]

**behavior_before**: Calendario780px y métricas1135px sobre teléfono; planner deja horario fuera. Las barras pueden ser visibles con hide-scrollbars=false.

**behavior_after**: Todos los días/horarios se descubren sin ensayo y se conserva densidad de escritorio.

**acceptance_criteria**: [
  "Given390px, When se abre mes, Then la interfaz indica cómo alcanzar los siete días.",
  "Given tabla semanal, When se navega por teclado, Then horario y acciones se alcanzan sin mover horizontalmente toda la página."
]

**ux_regression_risks**: [
  "Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.",
  "Confundir una mejora de presentación con permiso para realizar nuevas operaciones."
]


### CX-F03

**id**: CX-F03

**title**: Campos y papeleras de preview no tienen nombre accesible por fila

**category**: ACCESSIBILITY

**finding_scope**: PRODUCT_UX

**surface**: APPLICATION

**journey**: J24

**screen**: [
  "Importar"
]

**user_type**: EMPLOYEE / GUEST / ADMIN

**task_criticality**: IMPORTANT

**friction_type**: TASK_FRICTION

**severity**: MEDIUM

**priority**: P2

**evidence_level**: MEASURED_BROWSER

**browser_environment**: [
  "PRODUCTION"
]

**evidence**: {
  "screenshots": [
    "E011"
  ],
  "code": "src/components/shift-dashboard/ImportModal.tsx",
  "qualification": "Condiciones observadas descritas; sin inferir frecuencia analítica ni éxito de escrituras."
}

**frequency**: RECURRING

**current_behavior**: Axe y DOM identifican cuatro papeleras sin nombre y campos de tabla sin label asociado en preview de cuatro filas.

**root_ux_cause**: Cabeceras visuales no se vinculan como nombres programáticos de cada control.

**why_it_matters**: Quien usa lector de pantalla no puede identificar con confianza qué valor edita o qué turno elimina.

**user_impact**: Quien usa lector de pantalla no puede identificar con confianza qué valor edita o qué turno elimina.

**recommended_change**: Nombrar campo+fila con fecha/empleado o índice estable, asociar cabeceras y dar aria-label contextual a eliminar; anunciar nuevo conteo.

**why_this_change**: Actúa sobre la causa observada y conserva el modelo de seguridad existente.

**expected_benefit**: Edición y retirada de candidatos comprensibles sin depender de posición visual.

**effort**: LOW

**risk**: LOW

**quick_win**: True

**dependencies**: [
  "Validar con fixtures sintéticas y roles autorizados; no cambiar permisos implícitamente."
]

**do_not_break**: [
  "Edición precommit",
  "Borrado de una sola fila",
  "Orden de tabulación",
  "Sin añadir texto visual repetitivo"
]

**implementation_guidance**: Nombrar campo+fila con fecha/empleado o índice estable, asociar cabeceras y dar aria-label contextual a eliminar; anunciar nuevo conteo. Aplicar en src/components/shift-dashboard/ImportModal.tsx.

**affected_screens**: [
  "Importar"
]

**affected_components**: [
  "src/components/shift-dashboard/ImportModal.tsx"
]

**behavior_before**: Axe y DOM identifican cuatro papeleras sin nombre y campos de tabla sin label asociado en preview de cuatro filas.

**behavior_after**: Edición y retirada de candidatos comprensibles sin depender de posición visual.

**acceptance_criteria**: [
  "Given preview de varias filas, When foco entra en hora final, Then se anuncia campo y turno asociado.",
  "Given papelera, When recibe foco, Then su nombre identifica la fila; al borrar el foco queda en un destino predecible."
]

**ux_regression_risks**: [
  "Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.",
  "Confundir una mejora de presentación con permiso para realizar nuevas operaciones."
]


### CX-F04

**id**: CX-F04

**title**: El resumen temporal anuncia borradores que la opción efectiva excluye

**category**: SYSTEM_STATE

**finding_scope**: PRODUCT_UX

**surface**: APPLICATION

**journey**: J26

**screen**: [
  "Importar",
  "import"
]

**user_type**: EMPLOYEE / GUEST / ADMIN

**task_criticality**: IMPORTANT

**friction_type**: COGNITIVE_FRICTION

**severity**: MEDIUM

**priority**: P2

**evidence_level**: MEASURED_BROWSER

**browser_environment**: [
  "LOCAL_BUILD",
  "PRODUCTION"
]

**evidence**: {
  "screenshots": [
    "E041",
    "E064"
  ],
  "code": "src/components/shift-dashboard/ImportModal.tsx:1735; src/lib/import-temporal.ts",
  "qualification": "Condiciones observadas descritas; sin inferir frecuencia analítica ni éxito de escrituras."
}

**frequency**: RECURRING

**current_behavior**: Badge muestra cinco futuros→borrador con históricos-only; Employee recibe además mensaje de que no se creará planificación.

**root_ux_cause**: Conteo de fechas detectadas expresado como destino efectivo antes de aplicar rol/decisión.

**why_it_matters**: El usuario no sabe qué se guardará y puede esperar planificación que no se producirá.

**user_impact**: El usuario no sabe qué se guardará y puede esperar planificación que no se producirá.

**recommended_change**: Separar detectados, incluidos y excluidos; derivar resumen de rol+decisión efectiva y usar futuro condicional antes de elegir.

**why_this_change**: Actúa sobre la causa observada y conserva el modelo de seguridad existente.

**expected_benefit**: El precommit comunica exactamente cuántos históricos, borradores y excluidos resultarán.

**effort**: LOW

**risk**: MEDIUM

**quick_win**: False

**dependencies**: [
  "Validar con fixtures sintéticas y roles autorizados; no cambiar permisos implícitamente."
]

**do_not_break**: [
  "No publicar automáticamente",
  "Self scope",
  "Decisión explícita de futuros",
  "Conteo sin descarte silencioso"
]

**implementation_guidance**: Separar detectados, incluidos y excluidos; derivar resumen de rol+decisión efectiva y usar futuro condicional antes de elegir. Aplicar en src/components/shift-dashboard/ImportModal.tsx:1735; src/lib/import-temporal.ts.

**affected_screens**: [
  "Importar",
  "import"
]

**affected_components**: [
  "src/components/shift-dashboard/ImportModal.tsx:1735",
  "src/lib/import-temporal.ts"
]

**behavior_before**: Badge muestra cinco futuros→borrador con históricos-only; Employee recibe además mensaje de que no se creará planificación.

**behavior_after**: El precommit comunica exactamente cuántos históricos, borradores y excluidos resultarán.

**acceptance_criteria**: [
  "Given Employee con futuros, When revisa resumen, Then cero borradores a crear y razón explícita.",
  "Given Admin con históricos-only, When cambia a incluir futuros, Then conteos/destinos se actualizan de forma consistente."
]

**ux_regression_risks**: [
  "Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.",
  "Confundir una mejora de presentación con permiso para realizar nuevas operaciones."
]


### CX-F05

**id**: CX-F05

**title**: La preview de provisioning clasifica incorrectamente nuevos usuarios y IDs repetidos

**category**: FEEDBACK

**finding_scope**: PRODUCT_UX

**surface**: APPLICATION

**journey**: J54/J55

**screen**: [
  "bulk-employees",
  "bulk-users"
]

**user_type**: ADMIN / OWNER

**task_criticality**: IMPORTANT

**friction_type**: COGNITIVE_FRICTION

**severity**: MEDIUM

**priority**: P2

**evidence_level**: MEASURED_BROWSER

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence**: {
  "screenshots": [
    "E051",
    "E055",
    "E057"
  ],
  "code": "src/components/shift-dashboard/MembersModal.tsx:999; src/lib/bulk-import-csv.ts",
  "qualification": "Condiciones observadas descritas; sin inferir frecuencia analítica ni éxito de escrituras."
}

**frequency**: RECURRING

**current_behavior**: Usuario nuevo sin empleado se cuenta como ya miembro; dos empleados con mismo ID nuevo se cuentan ambos como nuevos.

**root_ux_cause**: Estados mezclan existencia de cuenta y vínculo; empleados no simulan duplicación intrafichero en preflight.

**why_it_matters**: Admin no puede anticipar correctamente altas, duplicados y credenciales antes de confirmar.

**user_impact**: Admin no puede anticipar correctamente altas, duplicados y credenciales antes de confirmar.

**recommended_change**: Separar existencia y vínculo; clasificar cada fila contra catálogo y filas anteriores; mostrar nuevos/sin vínculo/duplicados y conteos consistentes con resultado esperado.

**why_this_change**: Actúa sobre la causa observada y conserva el modelo de seguridad existente.

**expected_benefit**: El resumen anticipa cambios reales sin confundir acceso con ficha.

**effort**: MEDIUM

**risk**: MEDIUM

**quick_win**: False

**dependencies**: [
  "Validar con fixtures sintéticas y roles autorizados; no cambiar permisos implícitamente."
]

**do_not_break**: [
  "Revalidación backend",
  "No crear empleado al importar usuario",
  "Aislamiento organización",
  "Motivos por fila"
]

**implementation_guidance**: Separar existencia y vínculo; clasificar cada fila contra catálogo y filas anteriores; mostrar nuevos/sin vínculo/duplicados y conteos consistentes con resultado esperado. Aplicar en src/components/shift-dashboard/MembersModal.tsx:999; src/lib/bulk-import-csv.ts.

**affected_screens**: [
  "bulk-employees",
  "bulk-users"
]

**affected_components**: [
  "src/components/shift-dashboard/MembersModal.tsx:999",
  "src/lib/bulk-import-csv.ts"
]

**behavior_before**: Usuario nuevo sin empleado se cuenta como ya miembro; dos empleados con mismo ID nuevo se cuentan ambos como nuevos.

**behavior_after**: El resumen anticipa cambios reales sin confundir acceso con ficha.

**acceptance_criteria**: [
  "Given email nuevo sin external ID, When preview, Then se clasifica nuevo sin vínculo, no ya miembro.",
  "Given dos filas con mismo ID nuevo, When preview, Then segunda fila indica duplicado/conflicto con referencia a primera.",
  "Given filas válidas+inválidas, When muestra conteos, Then su suma coincide con total y política de confirmación."
]

**ux_regression_risks**: [
  "Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.",
  "Confundir una mejora de presentación con permiso para realizar nuevas operaciones."
]


### CX-F06

**id**: CX-F06

**title**: El acuse de turno no tiene una entrada en el shell Employee activo

**category**: DISCOVERABILITY

**finding_scope**: PRODUCT_UX

**surface**: APPLICATION

**journey**: J41

**screen**: [
  "src/App.tsx; src/components/employee-portal/PortalShell.tsx; src/components/employee-portal/ShiftDetail.tsx"
]

**user_type**: EMPLOYEE / GUEST / ADMIN

**task_criticality**: IMPORTANT

**friction_type**: COGNITIVE_FRICTION

**severity**: MEDIUM

**priority**: P2

**evidence_level**: MEASURED_CODE

**browser_environment**: [
  "UNKNOWN"
]

**evidence**: {
  "screenshots": [],
  "code": "src/App.tsx; src/components/employee-portal/PortalShell.tsx; src/components/employee-portal/ShiftDetail.tsx",
  "qualification": "Condiciones observadas descritas; sin inferir frecuencia analítica ni éxito de escrituras."
}

**frequency**: RECURRING

**current_behavior**: ShiftDetail ofrece acknowledgeRemoteShift, pero solo lo utiliza PortalShell, sin importación productiva en App. El calendario activo abre ShiftModal.

**root_ux_cause**: Migración al shell común dejó la capacidad de recepción fuera de la navegación alcanzable.

**why_it_matters**: El Employee puede consultar/solicitar cambios, pero no encuentra cómo confirmar recepción; no se probó un fallo de API.

**user_impact**: El Employee puede consultar/solicitar cambios, pero no encuentra cómo confirmar recepción; no se probó un fallo de API.

**recommended_change**: Conectar detalle de turno operativo con acuse y estado en shell actual; no reinstaurar un segundo portal entero solo para recuperar una acción.

**why_this_change**: Actúa sobre la causa observada y conserva el modelo de seguridad existente.

**expected_benefit**: Consulta, recepción y solicitud de cambio forman una secuencia localizable.

**effort**: MEDIUM

**risk**: MEDIUM

**quick_win**: False

**dependencies**: [
  "Validar con fixtures sintéticas y roles autorizados; no cambiar permisos implícitamente."
]

**do_not_break**: [
  "Scope SELF",
  "Publicado frente a borrador",
  "Solicitudes existentes",
  "No permitir editar planificación con acuse"
]

**implementation_guidance**: Conectar detalle de turno operativo con acuse y estado en shell actual; no reinstaurar un segundo portal entero solo para recuperar una acción. Aplicar en src/App.tsx; src/components/employee-portal/PortalShell.tsx; src/components/employee-portal/ShiftDetail.tsx.

**affected_screens**: [
  "src/App.tsx; src/components/employee-portal/PortalShell.tsx; src/components/employee-portal/ShiftDetail.tsx"
]

**affected_components**: [
  "src/App.tsx",
  "src/components/employee-portal/PortalShell.tsx",
  "src/components/employee-portal/ShiftDetail.tsx"
]

**behavior_before**: ShiftDetail ofrece acknowledgeRemoteShift, pero solo lo utiliza PortalShell, sin importación productiva en App. El calendario activo abre ShiftModal.

**behavior_after**: Consulta, recepción y solicitud de cambio forman una secuencia localizable.

**acceptance_criteria**: [
  "Given Employee con turno publicado, When abre su detalle desde calendario, Then ve estado de recepción y acción autorizada.",
  "Given fallo de acuse, When reintenta, Then conserva turno y muestra estado sin duplicar acción.",
  "Given borrador no publicado, When Employee consulta, Then no se expone como turno operativo."
]

**ux_regression_risks**: [
  "Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.",
  "Confundir una mejora de presentación con permiso para realizar nuevas operaciones."
]


### CX-F07

**id**: CX-F07

**title**: Provisioning se descubre en un segundo workspace de gestión

**category**: INFORMATION_ARCHITECTURE

**finding_scope**: PRODUCT_UX

**surface**: APPLICATION

**journey**: J45/J54

**screen**: [
  "Equipo",
  "Usuarios",
  "bulk-users"
]

**user_type**: EMPLOYEE / GUEST / ADMIN

**task_criticality**: IMPORTANT

**friction_type**: COGNITIVE_FRICTION

**severity**: MEDIUM

**priority**: P2

**evidence_level**: MEASURED_BROWSER

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence**: {
  "screenshots": [
    "E006",
    "E050",
    "E051"
  ],
  "code": "src/App.tsx; src/components/shift-dashboard/MembersModal.tsx",
  "qualification": "Condiciones observadas descritas; sin inferir frecuencia analítica ni éxito de escrituras."
}

**frequency**: RECURRING

**current_behavior**: Equipo nuevo expone Personas/Roles/Áreas/Asignaciones; CSV aparece en Ajustes→Equipo→Abrir Usuarios.

**root_ux_cause**: Coexistencia de entradas con vocabulario y acciones diferentes para el mismo dominio.

**why_it_matters**: Un Admin que empieza en Equipo debe conocer la ruta legacy para cargar muchas personas/accesos.

**user_impact**: Un Admin que empieza en Equipo debe conocer la ruta legacy para cargar muchas personas/accesos.

**recommended_change**: Añadir acciones masivas explícitas en Equipo y mantener una navegación coherente a la herramienta de preview; consolidar gradualmente sin perder capacidades.

**why_this_change**: Actúa sobre la causa observada y conserva el modelo de seguridad existente.

**expected_benefit**: Alta individual y masiva son localizables desde el workspace de personas.

**effort**: MEDIUM

**risk**: MEDIUM

**quick_win**: False

**dependencies**: [
  "Validar con fixtures sintéticas y roles autorizados; no cambiar permisos implícitamente."
]

**do_not_break**: [
  "Separación acceso/ficha",
  "Opciones de scope",
  "Preview de errores",
  "Credenciales de un solo uso"
]

**implementation_guidance**: Añadir acciones masivas explícitas en Equipo y mantener una navegación coherente a la herramienta de preview; consolidar gradualmente sin perder capacidades. Aplicar en src/App.tsx; src/components/shift-dashboard/MembersModal.tsx.

**affected_screens**: [
  "Equipo",
  "Usuarios",
  "bulk-users"
]

**affected_components**: [
  "src/App.tsx",
  "src/components/shift-dashboard/MembersModal.tsx"
]

**behavior_before**: Equipo nuevo expone Personas/Roles/Áreas/Asignaciones; CSV aparece en Ajustes→Equipo→Abrir Usuarios.

**behavior_after**: Alta individual y masiva son localizables desde el workspace de personas.

**acceptance_criteria**: [
  "Given Admin en Equipo, When necesita importar CSV, Then descubre la acción sin pasar por configuración general.",
  "Given vuelta desde preview, When cancela, Then conserva pestaña/filtro/contexto de personas."
]

**ux_regression_risks**: [
  "Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.",
  "Confundir una mejora de presentación con permiso para realizar nuevas operaciones."
]


### CX-F08

**id**: CX-F08

**title**: La interfaz EN mantiene el idioma del documento en español

**category**: ACCESSIBILITY

**finding_scope**: PRODUCT_UX

**surface**: APPLICATION

**journey**: J60

**screen**: [
  "import",
  "manual-shift"
]

**user_type**: EMPLOYEE / GUEST / ADMIN

**task_criticality**: IMPORTANT

**friction_type**: TASK_FRICTION

**severity**: MEDIUM

**priority**: P2

**evidence_level**: MEASURED_BROWSER

**browser_environment**: [
  "LOCAL_BUILD",
  "PRODUCTION"
]

**evidence**: {
  "screenshots": [
    "E063",
    "E064"
  ],
  "code": "index.html:2; src/lib/use-i18n.ts",
  "qualification": "Condiciones observadas descritas; sin inferir frecuencia analítica ni éxito de escrituras."
}

**frequency**: RECURRING

**current_behavior**: document.documentElement.lang permanece es mientras botones y contenidos muestran EN; también medido en producción.

**root_ux_cause**: Locale visual no sincroniza el atributo raíz del documento.

**why_it_matters**: Tecnologías de asistencia pueden pronunciar inglés con reglas españolas; traducción visible no implica integridad lingüística.

**user_impact**: Tecnologías de asistencia pueden pronunciar inglés con reglas españolas; traducción visible no implica integridad lingüística.

**recommended_change**: Actualizar lang al cambiar y restaurar locale; conservar valor inicial coherente; retestear páginas públicas y modales.

**why_this_change**: Actúa sobre la causa observada y conserva el modelo de seguridad existente.

**expected_benefit**: Idioma programático y visible coinciden en navegación y sesión.

**effort**: LOW

**risk**: LOW

**quick_win**: True

**dependencies**: [
  "Validar con fixtures sintéticas y roles autorizados; no cambiar permisos implícitamente."
]

**do_not_break**: [
  "Persistencia de locale",
  "Traducciones existentes",
  "SSR/default si se incorpora posteriormente"
]

**implementation_guidance**: Actualizar lang al cambiar y restaurar locale; conservar valor inicial coherente; retestear páginas públicas y modales. Aplicar en index.html:2; src/lib/use-i18n.ts.

**affected_screens**: [
  "import",
  "manual-shift"
]

**affected_components**: [
  "index.html:2",
  "src/lib/use-i18n.ts"
]

**behavior_before**: document.documentElement.lang permanece es mientras botones y contenidos muestran EN; también medido en producción.

**behavior_after**: Idioma programático y visible coinciden en navegación y sesión.

**acceptance_criteria**: [
  "Given interfaz EN, When se inspecciona html, Then lang=en.",
  "Given cambio ES→EN→ES y recarga, When cada vista se renderiza, Then idioma del documento coincide con preferencia efectiva."
]

**ux_regression_risks**: [
  "Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.",
  "Confundir una mejora de presentación con permiso para realizar nuevas operaciones."
]


### CX-F09

**id**: CX-F09

**title**: Pricing EN mezcla unidades y texto español

**category**: CONTENT_UX

**finding_scope**: PRODUCT_UX

**surface**: LANDING_PAGE

**journey**: J58

**screen**: [
  "Precios"
]

**user_type**: EMPLOYEE / GUEST / ADMIN

**task_criticality**: IMPORTANT

**friction_type**: COGNITIVE_FRICTION

**severity**: LOW

**priority**: P3

**evidence_level**: MEASURED_BROWSER

**browser_environment**: [
  "PRODUCTION"
]

**evidence**: {
  "screenshots": [
    "E030",
    "E031"
  ],
  "code": "src/lib/plans.ts; src/pages/PricingPage.tsx",
  "qualification": "Condiciones observadas descritas; sin inferir frecuencia analítica ni éxito de escrituras."
}

**frequency**: RECURRING

**current_behavior**: Se muestra 4,99 €/mes/mo y Desde 19 €/mes/mo; comparación conserva Manager frente a rol Planner del producto.

**root_ux_cause**: Precio/copy español hardcodeado se concatena con sufijo localizado y vocabulario heredado.

**why_it_matters**: Reduce claridad comercial y confianza en planes y roles ofrecidos.

**user_impact**: Reduce claridad comercial y confianza en planes y roles ofrecidos.

**recommended_change**: Separar importe, moneda, intervalo y desde en datos/localización; usar terminología de roles vigente sin duplicar unidades.

**why_this_change**: Actúa sobre la causa observada y conserva el modelo de seguridad existente.

**expected_benefit**: Precio EN con una sola unidad temporal y roles consistentes.

**effort**: LOW

**risk**: LOW

**quick_win**: True

**dependencies**: [
  "Validar con fixtures sintéticas y roles autorizados; no cambiar permisos implícitamente."
]

**do_not_break**: [
  "Distinción Free/Personal/Team",
  "No cambiar precios comerciales sin decisión de producto"
]

**implementation_guidance**: Separar importe, moneda, intervalo y desde en datos/localización; usar terminología de roles vigente sin duplicar unidades. Aplicar en src/lib/plans.ts; src/pages/PricingPage.tsx.

**affected_screens**: [
  "Precios"
]

**affected_components**: [
  "src/lib/plans.ts",
  "src/pages/PricingPage.tsx"
]

**behavior_before**: Se muestra 4,99 €/mes/mo y Desde 19 €/mes/mo; comparación conserva Manager frente a rol Planner del producto.

**behavior_after**: Precio EN con una sola unidad temporal y roles consistentes.

**acceptance_criteria**: [
  "Given EN, When abre pricing, Then no aparecen Desde ni /mes/mo.",
  "Given comparación de roles, When se lee planificación, Then coincide con Planner vigente."
]

**ux_regression_risks**: [
  "Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.",
  "Confundir una mejora de presentación con permiso para realizar nuevas operaciones."
]


## 34 · Acceso, ingeniería y revisión legal

PRODUCT_ACCESS=0; no se confunde ausencia de cuentas de auditoría con un defecto de acceso del producto. ENGINEERING_SUPPORT=1, separado del score UX. COMPLIANCE_REVIEW=0; no se ha emitido conclusión jurídica. El drift de la skill se trata como limitación metodológica, no como defecto de ShiftImport.


### CX-E01

**id**: CX-E01

**title**: Fixture sintética de empleados incompatible con el header aceptado por provisioning

**category**: CONSISTENCY

**finding_scope**: ENGINEERING_SUPPORT

**surface**: APPLICATION

**journey**: J55

**screen**: [
  "bulk-employees"
]

**user_type**: EMPLOYEE / GUEST / ADMIN

**task_criticality**: IMPORTANT

**friction_type**: COGNITIVE_FRICTION

**severity**: LOW

**priority**: P3

**evidence_level**: MEASURED_BROWSER

**browser_environment**: [
  "LOCAL_BUILD"
]

**evidence**: {
  "screenshots": [
    "E053"
  ],
  "code": "test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv; src/lib/bulk-import-csv.ts",
  "qualification": "Condiciones observadas descritas; sin inferir frecuencia analítica ni éxito de escrituras."
}

**frequency**: RECURRING

**current_behavior**: Fixture ofrece externalEmployeeId y parser exige external_employee_id. Se rechaza en la UI de importación masiva.

**root_ux_cause**: Contrato de fixture de escenario y parser de provisioning han divergido.

**why_it_matters**: QA/manuales pueden diagnosticar un fallo o sembrar por otra ruta sin cubrir el flujo de usuario correcto.

**user_impact**: QA/manuales pueden diagnosticar un fallo o sembrar por otra ruta sin cubrir el flujo de usuario correcto.

**recommended_change**: Alinear fixture o documentar explícitamente su importador destino; mantener prueba contractual por cabecera.

**why_this_change**: Actúa sobre la causa observada y conserva el modelo de seguridad existente.

**expected_benefit**: Escenario QA ejecutable por el mismo camino que utiliza Admin.

**effort**: LOW

**risk**: LOW

**quick_win**: True

**dependencies**: [
  "Validar con fixtures sintéticas y roles autorizados; no cambiar permisos implícitamente."
]

**do_not_break**: [
  "Dataset sintético",
  "Casos de incidencia deliberados"
]

**implementation_guidance**: Alinear fixture o documentar explícitamente su importador destino; mantener prueba contractual por cabecera. Aplicar en test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv; src/lib/bulk-import-csv.ts.

**affected_screens**: [
  "bulk-employees"
]

**affected_components**: [
  "test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv",
  "src/lib/bulk-import-csv.ts"
]

**behavior_before**: Fixture ofrece externalEmployeeId y parser exige external_employee_id. Se rechaza en la UI de importación masiva.

**behavior_after**: Escenario QA ejecutable por el mismo camino que utiliza Admin.

**acceptance_criteria**: [
  "Given fixture designada para bulk empleados, When se carga, Then alcanza preview y no falla por headers."
]

**ux_regression_risks**: [
  "Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.",
  "Confundir una mejora de presentación con permiso para realizar nuevas operaciones."
]


## 35 · Matriz de regresión histórica

HISTORICAL_FINDING_COUNT_VERIFIED=9 IDs. No implica nueve fichas originales completas recuperadas. FIXED exige evidencia del caso concreto. Resultado: 3 FIXED, 4 PARTIALLY_FIXED, 2 NOT_RETESTED, 0 STILL_PRESENT aislados y 0 REGRESSED demostrados. Los subproblemas todavía presentes se incluyen en los cuatro parcialmente corregidos.


### Registro

**old_finding_id**: F1

**old_title**: Import bloqueado sin resultado persistente y recuperación suficiente

**old_severity**: HIGH

**old_priority**: P1

**old_evidence**: PDF original, ficha completa; empleado desconocido/native dialogs/historial vacío

**current_status**: PARTIALLY_FIXED

**current_evidence**: E041,E046,E049: diagnóstico y recuperación; resultado postcommit no ejecutado

**current_finding_id**: CX-F04

**change**: Mejor preview y diagnóstico; no prueba de persistencia completa

**regression_risk**: No perder filas/resultados cuando falla confirmación


### Registro

**old_finding_id**: F2

**old_title**: Gate Personal tardío al añadir segundo acceso

**old_severity**: HIGH

**old_priority**: P1

**old_evidence**: PDF original, ficha completa

**current_status**: NOT_RETESTED

**current_evidence**: Solo cuenta Team disponible; pricing no retestea gate

**current_finding_id**: None

**change**: Código de gating presente, insuficiente para FIXED

**regression_risk**: Formulario largo antes de límite comercial


### Registro

**old_finding_id**: F3

**old_title**: Empty state de personas habla de organizaciones

**old_severity**: MEDIUM

**old_priority**: P2

**old_evidence**: PDF original, ficha completa

**current_status**: FIXED

**current_evidence**: E040: búsqueda sin resultados específica de personas; i18n actualizado

**current_finding_id**: None

**change**: Texto contextual correcto observado

**regression_risk**: Reutilizar clave de otra entidad


### Registro

**old_finding_id**: F4

**old_title**: Selectores de color sin nombre accesible

**old_severity**: MEDIUM

**old_priority**: P2

**old_evidence**: PDF original, ficha completa; Settings color inputs

**current_status**: FIXED

**current_evidence**: E048 y DOM: Color de tipo; nombres específicos

**current_finding_id**: None

**change**: Corrección puntual, no accesibilidad global PASS

**regression_risk**: Controles nuevos sin nombre; preview tiene otro problema CX-F03


### Registro

**old_finding_id**: F5

**old_title**: Documentación de roles/tipos desalineada

**old_severity**: MEDIUM

**old_priority**: P2

**old_evidence**: PDF ficha interrumpida; título/caso reconstruible

**current_status**: PARTIALLY_FIXED

**current_evidence**: AGENTS ahora documenta tipos y OWNER/ADMIN/PLANNER/EMPLOYEE, pero resumen B2C/local-first diverge de README B2B actual

**current_finding_id**: None

**change**: Casos específicos corregidos, contrato documental aún mixto

**regression_risk**: Agentes derivan modelo obsoleto


### Registro

**old_finding_id**: F6

**old_title**: Recorte móvil de planner/estadísticas y editor solapado (reconstruido)

**old_severity**: MEDIUM

**old_priority**: P2

**old_evidence**: Roadmap P4-M02/M03/M04, screen map original; ficha completa no disponible

**current_status**: PARTIALLY_FIXED

**current_evidence**: E022 editor modal visible; E023 tabla aún desborda; E014 métricas

**current_finding_id**: CX-F02

**change**: No reducir finding compuesto histórico a calendario únicamente

**regression_risk**: Scroll interno y teclado al adaptar tabla


### Registro

**old_finding_id**: F7

**old_title**: Navegación landing no colapsada en móvil (reconstruido)

**old_severity**: LOW

**old_priority**: P3

**old_evidence**: Roadmap P4-M05; referencia histórica

**current_status**: FIXED

**current_evidence**: E028/E029: menú móvil y CTA

**current_finding_id**: None

**change**: Menú desplegable observado en producción

**regression_risk**: CTA escondido dentro del menú


### Registro

**old_finding_id**: F8

**old_title**: Promesa calendario listo vs futuros en borrador (reconstruido)

**old_severity**: OPPORTUNITY

**old_priority**: P3

**old_evidence**: Roadmap P7, driver F8 explícito

**current_status**: PARTIALLY_FIXED

**current_evidence**: E012 draft explícito; E041/E064 resumen aún contradictorio; E027 promesa

**current_finding_id**: CX-F04

**change**: Distinción visible añadida, destino efectivo impreciso

**regression_risk**: Hacer pasar importado por publicado


### Registro

**old_finding_id**: F9

**old_title**: Validación de nombre de empleado en onboarding (reconstruido)

**old_severity**: LOW

**old_priority**: P4

**old_evidence**: Roadmap P4-M06; confianza histórica baja, exige reproducir

**current_status**: NOT_RETESTED

**current_evidence**: No cuenta sin org para recorrer onboarding; signup no es mismo formulario

**current_finding_id**: None

**change**: No usar roadmap ni validación de otro campo para declarar FIXED

**regression_risk**: Condición de carrera de automatización histórica no descartada


## 36 · Retest independiente de Claude

Dos candidatos retesteados, ninguno confirmado íntegramente ni descartado íntegramente: ambos PARTIALLY_CONFIRMED. El criterio no es reproducir su número de findings, sino las condiciones y el impacto. El informe anterior también declara siete históricos aunque su tabla enumera F1–F7 y F9 (ocho filas) y deja F8 fuera; esta auditoría reconstruye nueve IDs.


### CLAUDE-F01

**id**: CLAUDE-F01

**title**: Mobile calendar/stats hidden horizontal overflow

**status**: PARTIALLY_CONFIRMED

**evidence**: E014–E021, E023

**reason**: Anchos/desplazamiento confirmados. La ausencia universal de scrollbar no: agent-browser puede ocultarla; con hide-scrollbars=false se ve. MEDIUM P2, no CRITICAL sin imposibilidad demostrada.

**current_finding**: CX-F02

**delta_type**: EVIDENCE_RECALIBRATION


### CLAUDE-F02

**id**: CLAUDE-F02

**title**: Procesar archivo disabled después de parse

**status**: PARTIALLY_CONFIRMED

**evidence**: E046,E049,E064; ImportModal disabled por diagnosisBlocking

**reason**: Disabled puede darse con diagnóstico bloqueante aunque existan filas. En Ready queda habilitado. No se establece defecto universal ni nuevo finding independiente solo por estado disabled.

**current_finding**: None

**delta_type**: EVIDENCE_RECALIBRATION


## 37 · Scorecards por superficie

Evaluaciones cualitativas con base y límite; sin promedio global que mezcle producto, ingeniería y superficies. GOOD se refiere a las muestras indicadas, no a todo estado no probado. PORTAL independiente no se puntúa porque no está activo.


### Task Completion

**surface**: APPLICATION

**dimension**: Task Completion

**rating**: NOT_EVALUATED

**evidence_basis**: No confirmación/publicación/borrado/provisioning end-to-end.


### Clarity

**surface**: APPLICATION

**dimension**: Clarity

**rating**: FAIR

**evidence_basis**: E041,E051,E064: destinos/conteos ambiguos.


### Efficiency

**surface**: APPLICATION

**dimension**: Efficiency

**rating**: FAIR

**evidence_basis**: E050: ruta adicional a bulk; E059: revisión colapsada.


### Consistency

**surface**: APPLICATION

**dimension**: Consistency

**rating**: FAIR

**evidence_basis**: Dos gestiones y locale no propagado.


### Feedback

**surface**: APPLICATION

**dimension**: Feedback

**rating**: FAIR

**evidence_basis**: Diagnósticos útiles E049; resumen erróneo E051.


### Error Recovery

**surface**: APPLICATION

**dimension**: Error Recovery

**rating**: FAIR

**evidence_basis**: Recuperación precommit E049; postcommit sin evaluar.


### Cognitive Load

**surface**: APPLICATION

**dimension**: Cognitive Load

**rating**: FAIR

**evidence_basis**: Contexto explícito, densidad y destinos contradictorios.


### Navigation

**surface**: APPLICATION

**dimension**: Navigation

**rating**: FAIR

**evidence_basis**: Shell por rol E026, bulk oculto E050.


### Onboarding

**surface**: APPLICATION

**dimension**: Onboarding

**rating**: NOT_EVALUATED

**evidence_basis**: Sin primera organización browser.


### Accessibility

**surface**: APPLICATION

**dimension**: Accessibility

**rating**: POOR

**evidence_basis**: Campos/papeleras sin nombre y lang desalineado; evaluación parcial.


### Responsive Task Completion

**surface**: APPLICATION

**dimension**: Responsive Task Completion

**rating**: POOR

**evidence_basis**: E059/E062 lista 0px.


### Visual Hierarchy

**surface**: APPLICATION

**dimension**: Visual Hierarchy

**rating**: FAIR

**evidence_basis**: Calendario desktop dominante; preview móvil relegada.


### Premium Quality

**surface**: APPLICATION

**dimension**: Premium Quality

**rating**: FAIR

**evidence_basis**: Identidad coherente; precisión operativa irregular.


### Application Shell

**surface**: APPLICATION

**dimension**: Application Shell

**rating**: GOOD

**evidence_basis**: E003/E026 navegación por capacidades; dentro de estados observados.


### Viewport Economy

**surface**: APPLICATION

**dimension**: Viewport Economy

**rating**: POOR

**evidence_basis**: E059; varias filas persistentes compiten con tarea.


### Primary Workspace

**surface**: APPLICATION

**dimension**: Primary Workspace

**rating**: FAIR

**evidence_basis**: Fuerte desktop, colapso del importador.


### Workflow Efficiency

**surface**: APPLICATION

**dimension**: Workflow Efficiency

**rating**: FAIR

**evidence_basis**: Gestión dividida y revisión móvil.


### Context Management

**surface**: APPLICATION

**dimension**: Context Management

**rating**: FAIR

**evidence_basis**: Contexto visible, multi-org sin verificar.


### Action Hierarchy

**surface**: APPLICATION

**dimension**: Action Hierarchy

**rating**: FAIR

**evidence_basis**: Uploader/Process retienen prominencia tras parse.


### Component Coherence

**surface**: APPLICATION

**dimension**: Component Coherence

**rating**: FAIR

**evidence_basis**: ModalShell reutilizado; dos modelos de gestión.


### Content Legibility

**surface**: APPLICATION

**dimension**: Content Legibility

**rating**: FAIR

**evidence_basis**: Tablet inputs estrechos E061.


### State Clarity

**surface**: APPLICATION

**dimension**: State Clarity

**rating**: FAIR

**evidence_basis**: Borrador claro; conteos efectivos no.


### Theme Coherence

**surface**: APPLICATION

**dimension**: Theme Coherence

**rating**: GOOD

**evidence_basis**: Muestras E025/E059/E063; matriz completa pendiente.


### Data Density

**surface**: APPLICATION

**dimension**: Data Density

**rating**: FAIR

**evidence_basis**: Densidad desktop adecuada, móvil excesiva.


### Modal Ergonomics

**surface**: APPLICATION

**dimension**: Modal Ergonomics

**rating**: POOR

**evidence_basis**: Importador móvil, no todos los modales fallan.


### Form Ergonomics

**surface**: APPLICATION

**dimension**: Form Ergonomics

**rating**: FAIR

**evidence_basis**: Wizard explícito y manual; preview sin nombres.


### Spatial Hierarchy

**surface**: APPLICATION

**dimension**: Spatial Hierarchy

**rating**: FAIR

**evidence_basis**: Jerarquía dependiente de viewport.


### Premium Visual Quality

**surface**: APPLICATION

**dimension**: Premium Visual Quality

**rating**: GOOD

**evidence_basis**: Identidad/paleta consistentes en muestras.


### Modernity & Product Polish

**surface**: APPLICATION

**dimension**: Modernity & Product Polish

**rating**: FAIR

**evidence_basis**: Inconsistencias de integración/locale.


### Audience Clarity

**surface**: LANDING_PAGE

**dimension**: Audience Clarity

**rating**: GOOD

**evidence_basis**: Individual/equipos presentes E027


### Offer Clarity

**surface**: LANDING_PAGE

**dimension**: Offer Clarity

**rating**: FAIR

**evidence_basis**: Pricing EN F09


### Value Proposition

**surface**: LANDING_PAGE

**dimension**: Value Proposition

**rating**: GOOD

**evidence_basis**: Documento→calendario claramente comunicado


### Hero Effectiveness

**surface**: LANDING_PAGE

**dimension**: Hero Effectiveness

**rating**: GOOD

**evidence_basis**: E027/E028 CTA y titular


### CTA Hierarchy

**surface**: LANDING_PAGE

**dimension**: CTA Hierarchy

**rating**: GOOD

**evidence_basis**: CTA principal se conserva en móvil


### Proof & Trust

**surface**: LANDING_PAGE

**dimension**: Proof & Trust

**rating**: NOT_EVALUATED

**evidence_basis**: No verificación externa de claims/testimonios


### Objection Handling

**surface**: LANDING_PAGE

**dimension**: Objection Handling

**rating**: FAIR

**evidence_basis**: Publicación futura aún simplificada


### Content Sequence

**surface**: LANDING_PAGE

**dimension**: Content Sequence

**rating**: GOOD

**evidence_basis**: Problema→funcionamiento→equipo→planes


### Conversion Friction

**surface**: LANDING_PAGE

**dimension**: Conversion Friction

**rating**: FAIR

**evidence_basis**: Registro accesible; alta final no probada


### Form Friction

**surface**: LANDING_PAGE

**dimension**: Form Friction

**rating**: NOT_EVALUATED

**evidence_basis**: Landing no tiene formulario propio evaluado


### Mobile Conversion

**surface**: LANDING_PAGE

**dimension**: Mobile Conversion

**rating**: GOOD

**evidence_basis**: Menú/CTA E028/E029; registro430


### Memorability

**surface**: LANDING_PAGE

**dimension**: Memorability

**rating**: GOOD

**evidence_basis**: Identidad de marca propia


### Anti-Template Quality

**surface**: LANDING_PAGE

**dimension**: Anti-Template Quality

**rating**: GOOD

**evidence_basis**: Lenguaje y ejemplo específico de cuadrantes


### Accessibility

**surface**: LANDING_PAGE

**dimension**: Accessibility

**rating**: FAIR

**evidence_basis**: lang EN incorrecto; no auditoría completa landing


### Application Shell

**surface**: LANDING_PAGE

**dimension**: Application Shell

**rating**: NOT_APPLICABLE

**evidence_basis**: Superficie pública sin workspace operativo


### Viewport Economy

**surface**: LANDING_PAGE

**dimension**: Viewport Economy

**rating**: NOT_APPLICABLE

**evidence_basis**: Perfil application no aplicado


### Error Recovery

**surface**: LANDING_PAGE

**dimension**: Error Recovery

**rating**: NOT_EVALUATED

**evidence_basis**: Sin errores públicos específicos inducidos


## 38 · Qué funciona bien y DO_NOT_BREAK

Se conservarán las siguientes fortalezas al implementar recomendaciones.


### Registro

**fortaleza**: Preview antes de escritura

**evidencia**: E010/E011/E049

**do_not_break**: Editar/retirar y diagnóstico sin guardar directamente.


### Registro

**fortaleza**: Recuperación de código desconocido

**evidencia**: E046/E049

**do_not_break**: No descartar sin avisar ni recordar formato sin decisión.


### Registro

**fortaleza**: Identidad y permisos visibles

**evidencia**: E003/E007/E026

**do_not_break**: Scope servidor y vocabulario User/Employee separado.


### Registro

**fortaleza**: Borrador explícito

**evidencia**: E012/E022

**do_not_break**: Nunca publicar automáticamente por importar futuros.


### Registro

**fortaleza**: Wizard de persona

**evidencia**: E047

**do_not_break**: Cuenta opcional, ficha separada, resumen antes de alta.


### Registro

**fortaleza**: Modal manual accesible al cerrar

**evidencia**: E063 + keyboard-and-locale.json

**do_not_break**: Escape y restauración de foco.


### Registro

**fortaleza**: Bulk con errores por fila

**evidencia**: E051/E055

**do_not_break**: Mostrar motivo y permitir volver sin escribir.


### Registro

**fortaleza**: Landing móvil y temas

**evidencia**: E028/E029/E025

**do_not_break**: CTA móvil y marca coherente en claro/oscuro.


## 39 · Quick wins, oportunidades y roadmap

La prioridad se basa en impacto y evidencia, no en número de capturas. No se implementaron cambios de producto.


### Registro

**fase**: 1 · Quick wins

**acciones**: CX-F03 nombres de fila; CX-F08 lang; CX-F09 precios; CX-E01 fixture

**validación**: Axe+teclado, ES/EN y carga del fixture por UI.


### Registro

**fase**: 2 · Alto impacto

**acciones**: CX-F01 área de revisión móvil; CX-F04 resumen efectivo; CX-F05 clasificación bulk

**validación**: 8 viewports, preview con históricos/futuros y roles; casos nuevos/existentes/duplicados.


### Registro

**fase**: 3 · Estructura

**acciones**: CX-F02 vistas móviles operativas; CX-F06 detalle/acuse; CX-F07 entrada única a provisioning

**validación**: Cuentas Owner/Admin/Planner/Employee y ciclo sintético publicar→consultar→acuse→solicitar→resolver.


### Registro

**fase**: Cierre de evidencia

**acciones**: Retest F2/F9, historial poblado, safe delete, reimportación, formatos y credenciales de un solo uso

**validación**: Datos aislados y autorización específica de mutaciones; comprobar manuales e imports ajenos supervivientes.


## 40 · Composición AOS y tool compatibility gaps

La skill accessibility devolvió FAIL por candidatos estáticos; eso no invalida su ejecución ni confirma todos los candidatos. Visual regression no ejecutó comparación. I18n encontró locales vacíos y design-system no reconoció paquete consumidor. El detector de rutas vio solo páginas convencionales y perdió rutas internas de App; se corrigió la entrada con rutas observadas. Agent-browser oculta scrollbars por defecto y rutas de upload relativas produjeron error de herramienta: ambos se separan de findings de producto.


### Registro

**skill**: repo-preflight

**execution**: COMPLETED

**tool_result**: PASS

**material_coverage**: True

**meaning**: Cobertura estática parcial, no PASS visual

**evidence_file**: repo-preflight.json


### Registro

**skill**: aos-compliance-preflight

**execution**: COMPLETED

**tool_result**: PASS

**material_coverage**: True

**meaning**: Cobertura estática parcial, no PASS visual

**evidence_file**: aos-compliance-preflight.json


### Registro

**skill**: accessibility-audit

**execution**: COMPLETED

**tool_result**: FAIL

**material_coverage**: True

**meaning**: Cobertura estática parcial, no PASS visual

**evidence_file**: accessibility-audit.json


### Registro

**skill**: visual-regression-check

**execution**: BLOCKED

**tool_result**: BLOCKED

**material_coverage**: False

**meaning**: TOOL_COMPATIBILITY_GAP: ejecución no equivale a cobertura; revisar salida cruda

**evidence_file**: visual-regression-check.json


### Registro

**skill**: design-system-consumer-check

**execution**: COMPLETED

**tool_result**: PASS_WITH_GAPS

**material_coverage**: False

**meaning**: TOOL_COMPATIBILITY_GAP: ejecución no equivale a cobertura; revisar salida cruda

**evidence_file**: design-system-consumer-check.json


### Registro

**skill**: i18n-integrity-check

**execution**: COMPLETED

**tool_result**: PASS_WITH_GAPS

**material_coverage**: False

**meaning**: TOOL_COMPATIBILITY_GAP: ejecución no equivale a cobertura; revisar salida cruda

**evidence_file**: i18n-integrity-check.json


### Registro

**skill**: change-impact-analysis

**execution**: COMPLETED

**tool_result**: PASS_WITH_GAPS

**material_coverage**: True

**meaning**: Cobertura estática parcial, no PASS visual

**evidence_file**: change-impact-analysis.json


## 41 · Cobertura explícita

PARTIAL es deliberado: se visitaron los entornos y tamaños indicados, pero no todas las combinaciones de pantalla/estado/rol. False no se oculta ni se convierte en mala calidad del producto.


### AUTHENTICATED_FLOWS_COVERED

**flag**: AUTHENTICATED_FLOWS_COVERED

**value**: PARTIAL


### ADMIN_COVERED

**flag**: ADMIN_COVERED

**value**: PARTIAL


### EMPLOYEE_COVERED

**flag**: EMPLOYEE_COVERED

**value**: PARTIAL


### ORGANIZATION_SCOPE_COVERED

**flag**: ORGANIZATION_SCOPE_COVERED

**value**: PARTIAL


### AREA_SCOPE_COVERED

**flag**: AREA_SCOPE_COVERED

**value**: PARTIAL


### SELF_SCOPE_COVERED

**flag**: SELF_SCOPE_COVERED

**value**: PARTIAL


### DESKTOP_COVERED

**flag**: DESKTOP_COVERED

**value**: PARTIAL


### TABLET_COVERED

**flag**: TABLET_COVERED

**value**: PARTIAL


### MOBILE_PORTRAIT_COVERED

**flag**: MOBILE_PORTRAIT_COVERED

**value**: PARTIAL


### MOBILE_LANDSCAPE_COVERED

**flag**: MOBILE_LANDSCAPE_COVERED

**value**: PARTIAL


### LIGHT_THEME_COVERED

**flag**: LIGHT_THEME_COVERED

**value**: PARTIAL


### DARK_THEME_COVERED

**flag**: DARK_THEME_COVERED

**value**: PARTIAL


### SAFE_IMPORT_COVERED

**flag**: SAFE_IMPORT_COVERED

**value**: PARTIAL


### UNKNOWN_FORMAT_COVERED

**flag**: UNKNOWN_FORMAT_COVERED

**value**: PARTIAL


### LEARNED_FORMATS_COVERED

**flag**: LEARNED_FORMATS_COVERED

**value**: PARTIAL


### IMPORT_HISTORY_COVERED

**flag**: IMPORT_HISTORY_COVERED

**value**: PARTIAL


### SCHEDULING_COVERED

**flag**: SCHEDULING_COVERED

**value**: PARTIAL


### SCHEDULE_VERSIONING_COVERED

**flag**: SCHEDULE_VERSIONING_COVERED

**value**: PARTIAL


### EMPLOYEE_PORTAL_COVERED

**flag**: EMPLOYEE_PORTAL_COVERED

**value**: PARTIAL


### CHANGE_REQUEST_COVERED

**flag**: CHANGE_REQUEST_COVERED

**value**: PARTIAL


### USER_MANAGEMENT_COVERED

**flag**: USER_MANAGEMENT_COVERED

**value**: PARTIAL


### EMPLOYEE_MANAGEMENT_COVERED

**flag**: EMPLOYEE_MANAGEMENT_COVERED

**value**: PARTIAL


### AREA_MANAGEMENT_COVERED

**flag**: AREA_MANAGEMENT_COVERED

**value**: PARTIAL


### SHIFT_TYPE_COVERED

**flag**: SHIFT_TYPE_COVERED

**value**: PARTIAL


### BULK_USER_IMPORT_COVERED

**flag**: BULK_USER_IMPORT_COVERED

**value**: PARTIAL


### BULK_EMPLOYEE_IMPORT_COVERED

**flag**: BULK_EMPLOYEE_IMPORT_COVERED

**value**: PARTIAL


### APPLICATION_SHELL_COVERED

**flag**: APPLICATION_SHELL_COVERED

**value**: PARTIAL


### PRIMARY_WORKSPACE_COVERED

**flag**: PRIMARY_WORKSPACE_COVERED

**value**: PARTIAL


### VIEWPORT_ECONOMY_MEASURED

**flag**: VIEWPORT_ECONOMY_MEASURED

**value**: PARTIAL


### PUBLIC_FLOWS_COVERED

**flag**: PUBLIC_FLOWS_COVERED

**value**: PARTIAL


### GUEST_FLOWS_COVERED

**flag**: GUEST_FLOWS_COVERED

**value**: PARTIAL


### STAGING_BROWSER_COVERED

**flag**: STAGING_BROWSER_COVERED

**value**: False


### PREVIEW_BROWSER_COVERED

**flag**: PREVIEW_BROWSER_COVERED

**value**: False


### OWNER_COVERED

**flag**: OWNER_COVERED

**value**: False


### PLANNER_COVERED

**flag**: PLANNER_COVERED

**value**: False


### TEAM_IMPORT_COVERED

**flag**: TEAM_IMPORT_COVERED

**value**: False


### IDEMPOTENCY_COVERED

**flag**: IDEMPOTENCY_COVERED

**value**: False


### SAFE_DELETE_COVERED

**flag**: SAFE_DELETE_COVERED

**value**: False


### PUBLISH_COVERED

**flag**: PUBLISH_COVERED

**value**: False


### APPROVAL_COVERED

**flag**: APPROVAL_COVERED

**value**: False


### CREDENTIAL_EXPORT_COVERED

**flag**: CREDENTIAL_EXPORT_COVERED

**value**: False


### BROWSER_AVAILABLE

**flag**: BROWSER_AVAILABLE

**value**: True


### PRODUCTION_BROWSER_COVERED

**flag**: PRODUCTION_BROWSER_COVERED

**value**: True


### LOCAL_BUILD_BROWSER_COVERED

**flag**: LOCAL_BUILD_BROWSER_COVERED

**value**: True


### DEPLOYED_SURFACE_COVERED

**flag**: DEPLOYED_SURFACE_COVERED

**value**: True


### ACCESSIBILITY_COMPOSED

**flag**: ACCESSIBILITY_COMPOSED

**value**: True


### I18N_COMPOSED

**flag**: I18N_COMPOSED

**value**: True


### DESIGN_SYSTEM_COMPOSED

**flag**: DESIGN_SYSTEM_COMPOSED

**value**: True


### VISUAL_REGRESSION_COMPOSED

**flag**: VISUAL_REGRESSION_COMPOSED

**value**: True


### ACCESSIBILITY_COVERAGE

**flag**: ACCESSIBILITY_COVERAGE

**value**: PARTIAL: axe + DOM + teclado puntual


### I18N_COVERAGE

**flag**: I18N_COVERAGE

**value**: PARTIAL_BROWSER / COMPOSED_NO_MATERIAL_COVERAGE


### VISUAL_REGRESSION_COVERAGE

**flag**: VISUAL_REGRESSION_COVERAGE

**value**: MANUAL_COMPARATIVE_PARTIAL / AUTOMATED_BLOCKED


### HISTORICAL_FINDINGS_RETESTED

**flag**: HISTORICAL_FINDINGS_RETESTED

**value**: 7


### CLAUDE_FINDINGS_RETESTED

**flag**: CLAUDE_FINDINGS_RETESTED

**value**: 2


### TOOL_COMPATIBILITY_GAPS

**flag**: TOOL_COMPATIBILITY_GAPS

**value**: [
  "TS locales no detectadas",
  "Vite App routes no detectadas inicialmente",
  "Visual regression no ejecutada",
  "DS consumidor no reconocido",
  "Scrollbars ocultables por herramienta",
  "Subidas relativas no legibles"
]


## 42 · Limitaciones e integridad

Sin producción autenticada; Owner/Planner sin sesión; TeamImport sin recorrido browser catalogado; historial/formatos vacíos; borrador semanal sin asignaciones nuevas; no confirmación, publicación, eliminación, provisión o export de credenciales. No se verificó backend de fallback VLM real, todas las variaciones de CSV/XLSX/PDF, multi-mes completo, idempotencia o conflictos persistidos. No hay certificado de accesibilidad ni legal. Se preservaron salidas concurrentes de manual. El servidor local bloquea escrituras operativas: cualquier rechazo propio de ese transporte no es un finding de la app. Algunas sesiones de automatización se interrumpieron; no se imputaron al producto. No se ejecutó build/lint de producto porque no se modificó código y esos comandos podrían escribir fuera de auditoría. La validación se centra en evidencia y artefacto. La auditoría consume datos demo pequeños: no certifica escala organizativa real.


## 43 · Respuesta comparativa final

La conclusión no depende de tener más o menos findings. Depende de dónde la evidencia demuestra una fricción y de dónde todavía no permite afirmar seguridad o completitud.


### Registro

**pregunta**: ¿Puede un empleado pasar de cuadrante a calendario fiable sin comprender arquitectura?

**respuesta**: Parcialmente. La preview desktop es comprensible, pero guardar exige sesión, futuros tienen reglas diferentes y móvil puede impedir revisión. No se verificó el ciclo persistido completo.


### Registro

**pregunta**: ¿Puede Owner/Admin gestionar toda la organización sin ambigüedad?

**respuesta**: No puede afirmarse de extremo a extremo. Admin distingue personas/accesos, pero provisioning tiene conteos incorrectos y entrada fragmentada; Owner no tuvo cobertura browser.


### Registro

**pregunta**: ¿Puede Planner crear, revisar y publicar futuros claramente separados?

**respuesta**: La distinción de borrador es visible con Admin. Rol Planner y publicación final no se ejecutaron; el resumen de importación aún contradice decisiones efectivas.


### Registro

**pregunta**: ¿Puede Employee consultar, confirmar y solicitar cambios con recuperación?

**respuesta**: Consulta y formulario de solicitudes sí, parcialmente. Acuse está desconectado del shell activo; aprobación/rechazo y recuperación final no comprobados.


### Registro

**pregunta**: ¿Es Safe Import seguro y comprensible en todos los estados?

**respuesta**: No demostrado. Recuperación precommit y bloqueo de identidad son positivos; ambigüedad de equipo, conflictos, reimportación y éxito final siguen pendientes. La revisión móvil falla.


### Registro

**pregunta**: ¿Puede corregirse una importación sin borrar manuales ni otros imports?

**respuesta**: El predicado y transacción del código sostienen ese diseño. No se ejecutó DELETE real ni se comprobó supervivencia browser; no se declara garantía end-to-end.


### Registro

**pregunta**: ¿Escalan usuarios, empleados, áreas y provisioning?

**respuesta**: No se certificó escala. La muestra pequeña ya revela clasificación errónea de nuevos/sin vínculo y duplicados, además de dos workspaces de gestión.


### Registro

**pregunta**: ¿Es equivalente desktop, tablet y móvil?

**respuesta**: No en los estados medidos: preview móvil sin área editable, campos tablet estrechos y desplazamientos horizontales de calendario/planner. Bulk preview móvil conserva acciones.


### Registro

**pregunta**: ¿Qué históricos están fixed/still/partial/regressed?

**respuesta**: 3 FIXED (F3,F4,F7), 4 PARTIALLY_FIXED (F1,F5,F6,F8), 2 NOT_RETESTED (F2,F9). Ningún REGRESSED demostrado; no se fuerza STILL_PRESENT sobre findings compuestos parcialmente corregidos.


### Registro

**pregunta**: ¿Se confirman los dos findings de Claude?

**respuesta**: Ambos parcialmente: overflow sí, ausencia universal de scrollbar no; disabled tras parse solo en estados bloqueantes, no Ready. Se recalibran alcance y severidad.


### Registro

**pregunta**: ¿Qué nuevos hallazgos son cobertura y cuáles método?

**respuesta**: Bulk, entrada fragmentada y acuse desconectado proceden de ampliar gestión/Employee y código. Preview móvil y labels se establecen al cruzar estado×viewport y axe. Calendario/disabled son recalibración metodológica. No se atribuye una degradación temporal sin SHA desplegado.


### Registro

**pregunta**: ¿Producto premium coherente en todos los roles?

**respuesta**: La identidad visual y shell son coherentes en muestras. Hay diferencia material entre una preview desktop cuidada y complejidad multi-tenant: precisión de conteos, rutas de gestión e integración Employee requieren trabajo. La cobertura pendiente impide una conclusión global positiva.


## 44 · Índice de evidencia

Capturas únicas, sin imágenes redundantes para aumentar artificialmente el conteo. Cada ficha identifica entorno, estado, viewport y acción. El atributo lang del DOM se conserva como medición separada del idioma visible. E001/E002 y captura fallida E032 se excluyen del índice por provenance incompleta; E009 se conserva únicamente como limitación de herramienta.


### E003

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 662,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 662,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E003

**file**: E003-admin-calendar.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J03,J10

**screen**: Calendario

**action**: Login con cuenta demo ADMIN

**observation**: Calendario poblado y navegación operativa por capacidades

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Calendario poblado y navegación operativa por capacidades

**screenshot_reference**: E003-admin-calendar.png


### E004

**url**: https://shiftimport.anclora.com/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1141,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 262,
    "height": 618,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 618,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E004

**file**: E004-guest-calendar.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J04,J10

**screen**: Calendario

**action**: Cerrar guía inicial

**observation**: Calendario vacío con acciones históricas y futuras diferenciadas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Calendario vacío con acciones históricas y futuras diferenciadas

**screenshot_reference**: E004-guest-calendar.png


### E005

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 662,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 662,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 63,
    "height": 774,
    "width": 818,
    "scrollWidth": 818,
    "scrollHeight": 772,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E005

**file**: E005-history.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J30,J31

**screen**: Historial

**action**: Abrir historial autenticado

**observation**: Historial vacío con filtros ámbito, tipo, formato y estado; no registros demo de importación.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Historial vacío con filtros ámbito, tipo, formato y estado; no registros demo de importación.

**screenshot_reference**: E005-history.png


### E006

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 662,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 662,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 63,
    "height": 774,
    "width": 1138,
    "scrollWidth": 1138,
    "scrollHeight": 772,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E006

**file**: E006-team-personas.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J45,J50

**screen**: Equipo

**action**: Esperar carga de memberships

**observation**: Tres personas y dos accesos; user y employee diferenciados

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Tres personas y dos accesos; user y employee diferenciados

**screenshot_reference**: E006-team-personas.png


### E007

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 662,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 662,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 63,
    "height": 774,
    "width": 1138,
    "scrollWidth": 1138,
    "scrollHeight": 772,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E007

**file**: E007-team-roles.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J47,J48

**screen**: Equipo

**action**: Abrir Roles y acceso

**observation**: Dos accesos con vínculo empleado y scope explícito

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Dos accesos con vínculo empleado y scope explícito

**screenshot_reference**: E007-team-roles.png


### E008

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 662,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 662,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 63,
    "height": 774,
    "width": 1138,
    "scrollWidth": 1138,
    "scrollHeight": 772,
    "overflowX": "hidden",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content",
    "y": 328,
    "height": 244,
    "width": 478,
    "scrollWidth": 478,
    "scrollHeight": 242,
    "overflowX": "auto",
    "overflowY": "auto"
  }
]

**id**: E008

**file**: E008-role-dialog.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J48

**screen**: Equipo

**action**: Abrir cambio de rol sin guardar

**observation**: ADMIN puede elegir Employee Planner Admin; Owner no aparece

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: ADMIN puede elegir Employee Planner Admin; Owner no aparece

**screenshot_reference**: E008-role-dialog.png


### E009

**url**: https://shiftimport.anclora.com/app

**viewport**: 1280x633

**theme**: dark

**locale**: es

**bodyWidth**: 1265

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1001,
    "scrollWidth": 1001,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 570,
    "width": 1001,
    "scrollWidth": 1001,
    "scrollHeight": 570,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 56,
    "width": 953,
    "scrollWidth": 1137,
    "scrollHeight": 45,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 269,
    "height": 302,
    "width": 953,
    "scrollWidth": 953,
    "scrollHeight": 302,
    "overflowX": "auto",
    "overflowY": "auto"
  },
  {
    "selector": "modal-content import-modal",
    "y": 38,
    "height": 557,
    "width": 1227,
    "scrollWidth": 1227,
    "scrollHeight": 555,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E009

**file**: E009-import-error.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J16,J20

**screen**: Importar

**action**: Subir CSV sintético vía onboarding

**observation**: Error de lectura causado por una ruta relativa de la herramienta. Reintento con ruta absoluta produjo E010. No es un finding del producto.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Error de lectura causado por una ruta relativa de la herramienta. Reintento con ruta absoluta produjo E010. No es un finding del producto.

**screenshot_reference**: E009-import-error.png


### E010

**url**: https://shiftimport.anclora.com/app

**viewport**: 1280x633

**theme**: dark

**locale**: es

**bodyWidth**: 1265

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1001,
    "scrollWidth": 1001,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 570,
    "width": 1001,
    "scrollWidth": 1001,
    "scrollHeight": 570,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 56,
    "width": 953,
    "scrollWidth": 1137,
    "scrollHeight": 45,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 269,
    "height": 302,
    "width": 953,
    "scrollWidth": 953,
    "scrollHeight": 302,
    "overflowX": "auto",
    "overflowY": "auto"
  },
  {
    "selector": "modal-content import-modal",
    "y": 38,
    "height": 557,
    "width": 1227,
    "scrollWidth": 1227,
    "scrollHeight": 555,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E010

**file**: E010-csv-preview.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J16,J24,J26

**screen**: Importar

**action**: Procesar CSV sintético con identidad

**observation**: Cinco filas editables; Listo; periodo cambia a marzo; confirmación exige sesión

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Cinco filas editables; Listo; periodo cambia a marzo; confirmación exige sesión

**screenshot_reference**: E010-csv-preview.png


### E011

**url**: https://shiftimport.anclora.com/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 1128,
    "scrollWidth": 1141,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 607,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 607,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 54,
    "height": 792,
    "width": 1378,
    "scrollWidth": 1378,
    "scrollHeight": 790,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E011

**file**: E011-preview-edited.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J24,J25

**screen**: Importar

**action**: Editar hora y borrar última fila

**observation**: Cuatro filas restantes; cambios retenidos antes de confirmar

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Cuatro filas restantes; cambios retenidos antes de confirmar

**screenshot_reference**: E011-preview-edited.png


### E012

**url**: http://127.0.0.1:3199/app/schedule

**viewport**: 1280x633

**theme**: dark

**locale**: es

**bodyWidth**: 1280

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1016,
    "scrollWidth": 1016,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 617,
    "width": 1016,
    "scrollWidth": 1016,
    "scrollHeight": 617,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "modal-content modal-content--workspace modal-content--fullscreen",
    "y": 0,
    "height": 633,
    "width": 1278,
    "scrollWidth": 1278,
    "scrollHeight": 631,
    "overflowX": "hidden",
    "overflowY": "hidden"
  },
  {
    "selector": "weekly-planner__header",
    "y": 25,
    "height": 63,
    "width": 1230,
    "scrollWidth": 1230,
    "scrollHeight": 63,
    "overflowX": "visible",
    "overflowY": "visible"
  }
]

**id**: E012

**file**: E012-planner.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J34,J36,J37

**screen**: Planificador

**action**: Abrir planificación existente

**observation**: Borrador semanal vacío; Publicar deshabilitado; tres empleados

**dom_lang**: es

**surface**: APPLICATION

**route**: /app/schedule

**state**: Borrador semanal vacío; Publicar deshabilitado; tres empleados

**screenshot_reference**: E012-planner.png


### E013

**url**: https://shiftimport.anclora.com/app

**viewport**: 390x844

**theme**: dark

**locale**: es

**bodyWidth**: 375

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 62,
    "width": 375,
    "scrollWidth": 375,
    "scrollHeight": 61,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 62,
    "height": 782,
    "width": 375,
    "scrollWidth": 375,
    "scrollHeight": 782,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 232,
    "height": 69,
    "width": 355,
    "scrollWidth": 1135,
    "scrollHeight": 58,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 307,
    "height": 521,
    "width": 355,
    "scrollWidth": 780,
    "scrollHeight": 510,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 10,
    "height": 824,
    "width": 368,
    "scrollWidth": 599,
    "scrollHeight": 822,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E013

**file**: E013-preview-mobile.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J24

**screen**: Importar

**action**: Reducir viewport con cuatro filas revisadas

**observation**: Tabla y controles del importador a 390px

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Tabla y controles del importador a 390px

**screenshot_reference**: E013-preview-mobile.png


### E014

**url**: https://shiftimport.anclora.com/app

**viewport**: 390x844

**theme**: dark

**locale**: es

**bodyWidth**: 375

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 62,
    "width": 375,
    "scrollWidth": 375,
    "scrollHeight": 61,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 62,
    "height": 782,
    "width": 375,
    "scrollWidth": 375,
    "scrollHeight": 782,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 232,
    "height": 69,
    "width": 355,
    "scrollWidth": 1135,
    "scrollHeight": 58,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 307,
    "height": 521,
    "width": 355,
    "scrollWidth": 780,
    "scrollHeight": 510,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E014

**file**: E014-calendar-390.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J10

**screen**: Calendario

**action**: Cambiar viewport

**observation**: Medición de calendario y cinta de estadísticas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Medición de calendario y cinta de estadísticas

**screenshot_reference**: E014-calendar-390.png


### E015

**url**: https://shiftimport.anclora.com/app

**viewport**: 430x932

**theme**: dark

**locale**: es

**bodyWidth**: 415

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 62,
    "width": 415,
    "scrollWidth": 415,
    "scrollHeight": 61,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 62,
    "height": 870,
    "width": 415,
    "scrollWidth": 415,
    "scrollHeight": 870,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 232,
    "height": 69,
    "width": 395,
    "scrollWidth": 1135,
    "scrollHeight": 58,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 307,
    "height": 609,
    "width": 395,
    "scrollWidth": 780,
    "scrollHeight": 598,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E015

**file**: E015-calendar-430.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J10

**screen**: Calendario

**action**: Cambiar viewport

**observation**: Medición de calendario y cinta de estadísticas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Medición de calendario y cinta de estadísticas

**screenshot_reference**: E015-calendar-430.png


### E016

**url**: https://shiftimport.anclora.com/app

**viewport**: 768x1024

**theme**: dark

**locale**: es

**bodyWidth**: 768

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 768,
    "scrollWidth": 768,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 961,
    "width": 768,
    "scrollWidth": 768,
    "scrollHeight": 961,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 66,
    "width": 736,
    "scrollWidth": 1137,
    "scrollHeight": 55,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 279,
    "height": 725,
    "width": 736,
    "scrollWidth": 760,
    "scrollHeight": 714,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E016

**file**: E016-calendar-768.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J10

**screen**: Calendario

**action**: Cambiar viewport

**observation**: Medición de calendario y cinta de estadísticas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Medición de calendario y cinta de estadísticas

**screenshot_reference**: E016-calendar-768.png


### E017

**url**: https://shiftimport.anclora.com/app

**viewport**: 1024x768

**theme**: dark

**locale**: es

**bodyWidth**: 1024

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 760,
    "scrollWidth": 760,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 705,
    "width": 760,
    "scrollWidth": 760,
    "scrollHeight": 705,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 712,
    "scrollWidth": 1141,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 475,
    "width": 712,
    "scrollWidth": 712,
    "scrollHeight": 475,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E017

**file**: E017-calendar-1024.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J10

**screen**: Calendario

**action**: Cambiar viewport

**observation**: Medición de calendario y cinta de estadísticas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Medición de calendario y cinta de estadísticas

**screenshot_reference**: E017-calendar-1024.png


### E018

**url**: https://shiftimport.anclora.com/app

**viewport**: 1366x768

**theme**: dark

**locale**: es

**bodyWidth**: 1366

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1102,
    "scrollWidth": 1102,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 705,
    "width": 1102,
    "scrollWidth": 1102,
    "scrollHeight": 705,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 1054,
    "scrollWidth": 1141,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 475,
    "width": 1054,
    "scrollWidth": 1054,
    "scrollHeight": 475,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E018

**file**: E018-calendar-1366.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J10

**screen**: Calendario

**action**: Cambiar viewport

**observation**: Medición de calendario y cinta de estadísticas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Medición de calendario y cinta de estadísticas

**screenshot_reference**: E018-calendar-1366.png


### E019

**url**: https://shiftimport.anclora.com/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 1128,
    "scrollWidth": 1141,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 607,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 607,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E019

**file**: E019-calendar-1440.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J10

**screen**: Calendario

**action**: Cambiar viewport

**observation**: Medición de calendario y cinta de estadísticas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Medición de calendario y cinta de estadísticas

**screenshot_reference**: E019-calendar-1440.png


### E022

**url**: http://127.0.0.1:3199/app/schedule

**viewport**: 390x844

**theme**: dark

**locale**: es

**bodyWidth**: 390

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 62,
    "width": 390,
    "scrollWidth": 390,
    "scrollHeight": 61,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 62,
    "height": 782,
    "width": 390,
    "scrollWidth": 390,
    "scrollHeight": 782,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "modal-content modal-content--workspace modal-content--fullscreen",
    "y": 0,
    "height": 844,
    "width": 388,
    "scrollWidth": 388,
    "scrollHeight": 842,
    "overflowX": "hidden",
    "overflowY": "hidden"
  },
  {
    "selector": "weekly-planner__header",
    "y": 17,
    "height": 102,
    "width": 364,
    "scrollWidth": 364,
    "scrollHeight": 102,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "modal-content",
    "y": 125,
    "height": 594,
    "width": 364,
    "scrollWidth": 364,
    "scrollHeight": 592,
    "overflowX": "auto",
    "overflowY": "auto"
  }
]

**id**: E022

**file**: E022-planner-editor-mobile.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J36

**screen**: Planificador

**action**: Abrir editor sin guardar y reducir viewport

**observation**: Formulario de turno sobre cuadrícula; inspección de alcance del CTA

**dom_lang**: es

**surface**: APPLICATION

**route**: /app/schedule

**state**: Formulario de turno sobre cuadrícula; inspección de alcance del CTA

**screenshot_reference**: E022-planner-editor-mobile.png


### E020

**url**: https://shiftimport.anclora.com/app

**viewport**: 1728x1117

**theme**: dark

**locale**: es

**bodyWidth**: 1728

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1464,
    "scrollWidth": 1464,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 1054,
    "width": 1464,
    "scrollWidth": 1464,
    "scrollHeight": 1054,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 49,
    "width": 1416,
    "scrollWidth": 1416,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 262,
    "height": 835,
    "width": 1416,
    "scrollWidth": 1416,
    "scrollHeight": 835,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E020

**file**: E020-calendar-1728.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J10

**screen**: Calendario

**action**: Cambiar viewport

**observation**: Medición de calendario y cinta de estadísticas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Medición de calendario y cinta de estadísticas

**screenshot_reference**: E020-calendar-1728.png


### E021

**url**: https://shiftimport.anclora.com/app

**viewport**: 844x390

**theme**: dark

**locale**: es

**bodyWidth**: 829

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 829,
    "scrollWidth": 829,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 512,
    "width": 829,
    "scrollWidth": 829,
    "scrollHeight": 512,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 54,
    "width": 797,
    "scrollWidth": 1137,
    "scrollHeight": 43,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 267,
    "height": 288,
    "width": 797,
    "scrollWidth": 797,
    "scrollHeight": 288,
    "overflowX": "auto",
    "overflowY": "auto"
  }
]

**id**: E021

**file**: E021-calendar-844.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J10

**screen**: Calendario

**action**: Cambiar viewport

**observation**: Medición de calendario y cinta de estadísticas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Medición de calendario y cinta de estadísticas

**screenshot_reference**: E021-calendar-844.png


### E023

**url**: http://127.0.0.1:3199/app/schedule

**viewport**: 390x844

**theme**: dark

**locale**: es

**bodyWidth**: 390

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 62,
    "width": 390,
    "scrollWidth": 390,
    "scrollHeight": 61,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 62,
    "height": 782,
    "width": 390,
    "scrollWidth": 390,
    "scrollHeight": 782,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "modal-content modal-content--workspace modal-content--fullscreen",
    "y": 0,
    "height": 844,
    "width": 388,
    "scrollWidth": 388,
    "scrollHeight": 842,
    "overflowX": "hidden",
    "overflowY": "hidden"
  },
  {
    "selector": "weekly-planner__header",
    "y": 17,
    "height": 102,
    "width": 364,
    "scrollWidth": 364,
    "scrollHeight": 102,
    "overflowX": "visible",
    "overflowY": "visible"
  }
]

**id**: E023

**file**: E023-planner-table-mobile.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J34

**screen**: Planificador

**action**: Cambiar a tabla accesible

**observation**: Alternativa de tabla con filas por empleado y día

**dom_lang**: es

**surface**: APPLICATION

**route**: /app/schedule

**state**: Alternativa de tabla con filas por empleado y día

**screenshot_reference**: E023-planner-table-mobile.png


### E024

**url**: https://shiftimport.anclora.com/app

**viewport**: 844x390

**theme**: dark

**locale**: en

**bodyWidth**: 829

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 829,
    "scrollWidth": 829,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 512,
    "width": 829,
    "scrollWidth": 829,
    "scrollHeight": 512,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 54,
    "width": 797,
    "scrollWidth": 1132,
    "scrollHeight": 43,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 267,
    "height": 288,
    "width": 797,
    "scrollWidth": 797,
    "scrollHeight": 288,
    "overflowX": "auto",
    "overflowY": "auto"
  }
]

**id**: E024

**file**: E024-calendar-light-en.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J60,J61

**screen**: Calendario

**action**: Cambiar tema e idioma

**observation**: Idioma EN y preferencia sistema; tema efectivo oscuro.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Idioma EN y preferencia sistema; tema efectivo oscuro.

**screenshot_reference**: E024-calendar-light-en.png


### E025

**url**: https://shiftimport.anclora.com/app

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 1128,
    "scrollWidth": 1136,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 607,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 607,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E025

**file**: E025-calendar-light-en.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J60,J61

**screen**: Calendario

**action**: Pasar de sistema a claro

**observation**: Tema claro real y locale EN

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Tema claro real y locale EN

**screenshot_reference**: E025-calendar-light-en.png


### E026

**url**: http://127.0.0.1:3199/app

**viewport**: 390x844

**theme**: dark

**locale**: es

**bodyWidth**: 390

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 62,
    "width": 390,
    "scrollWidth": 390,
    "scrollHeight": 61,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 62,
    "height": 782,
    "width": 390,
    "scrollWidth": 390,
    "scrollHeight": 782,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 224,
    "height": 58,
    "width": 370,
    "scrollWidth": 1163,
    "scrollHeight": 58,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 288,
    "height": 540,
    "width": 370,
    "scrollWidth": 780,
    "scrollHeight": 540,
    "overflowX": "auto",
    "overflowY": "hidden"
  }
]

**id**: E026

**file**: E026-employee-calendar.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J39,J40

**screen**: Calendario

**action**: Acceder como Employee demo

**observation**: Employee aterriza en shell común; futuros no editables

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Employee aterriza en shell común; futuros no editables

**screenshot_reference**: E026-employee-calendar.png


### E027

**url**: https://shiftimport.anclora.com/

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "public-header",
    "y": 0,
    "height": 67,
    "width": 1425,
    "scrollWidth": 1425,
    "scrollHeight": 66,
    "overflowX": "visible",
    "overflowY": "visible"
  }
]

**id**: E027

**file**: E027-landing-light-en.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J01

**screen**: Landing

**action**: Abrir landing EN claro

**observation**: Promesa y CTA visibles en escritorio

**dom_lang**: es

**surface**: LANDING_PAGE

**route**: /

**state**: Promesa y CTA visibles en escritorio

**screenshot_reference**: E027-landing-light-en.png


### E028

**url**: https://shiftimport.anclora.com/

**viewport**: 390x844

**theme**: light

**locale**: en

**bodyWidth**: 390

**metrics**: [
  {
    "selector": "public-header",
    "y": 0,
    "height": 55,
    "width": 375,
    "scrollWidth": 375,
    "scrollHeight": 54,
    "overflowX": "visible",
    "overflowY": "visible"
  }
]

**id**: E028

**file**: E028-landing-mobile.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J01

**screen**: Landing

**action**: Reducir landing a 390px

**observation**: CTA y navegación móvil en EN claro

**dom_lang**: es

**surface**: LANDING_PAGE

**route**: /

**state**: CTA y navegación móvil en EN claro

**screenshot_reference**: E028-landing-mobile.png


### E029

**url**: https://shiftimport.anclora.com/

**viewport**: 390x844

**theme**: light

**locale**: en

**bodyWidth**: 390

**metrics**: [
  {
    "selector": "public-header",
    "y": 0,
    "height": 336,
    "width": 375,
    "scrollWidth": 375,
    "scrollHeight": 335,
    "overflowX": "visible",
    "overflowY": "visible"
  }
]

**id**: E029

**file**: E029-landing-menu.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J01

**screen**: Landing

**action**: Abrir menú móvil

**observation**: Menú despliega enlaces idioma tema y acceso

**dom_lang**: es

**surface**: LANDING_PAGE

**route**: /

**state**: Menú despliega enlaces idioma tema y acceso

**screenshot_reference**: E029-landing-menu.png


### E030

**url**: https://shiftimport.anclora.com/pricing

**viewport**: 390x844

**theme**: light

**locale**: en

**bodyWidth**: 390

**metrics**: [
  {
    "selector": "public-header",
    "y": 0,
    "height": 55,
    "width": 375,
    "scrollWidth": 375,
    "scrollHeight": 54,
    "overflowX": "visible",
    "overflowY": "visible"
  }
]

**id**: E030

**file**: E030-pricing-mobile.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J58

**screen**: Precios

**action**: Abrir precios en móvil

**observation**: Comparación Free Personal Team

**dom_lang**: es

**surface**: LANDING_PAGE

**route**: /pricing

**state**: Comparación Free Personal Team

**screenshot_reference**: E030-pricing-mobile.png


### E031

**url**: https://shiftimport.anclora.com/pricing

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "public-header",
    "y": 0,
    "height": 67,
    "width": 1425,
    "scrollWidth": 1425,
    "scrollHeight": 66,
    "overflowX": "visible",
    "overflowY": "visible"
  }
]

**id**: E031

**file**: E031-pricing-en.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J58,J60

**screen**: Precios

**action**: Inspeccionar precios EN

**observation**: Precios mezclan mes/mo y Desde; rol Manager en comparación

**dom_lang**: es

**surface**: LANDING_PAGE

**route**: /pricing

**state**: Precios mezclan mes/mo y Desde; rol Manager en comparación

**screenshot_reference**: E031-pricing-en.png


### E033

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 153,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 208,
    "height": 672,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 672,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 63,
    "height": 774,
    "width": 778,
    "scrollWidth": 778,
    "scrollHeight": 772,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E033

**file**: E033-request-validation.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J42

**screen**: Solicitudes

**action**: Enviar formulario vacío para validar motivo

**observation**: Validación previa sin petición operativa

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Validación previa sin petición operativa

**screenshot_reference**: E033-request-validation.png


### E034

**url**: http://127.0.0.1:3199/app

**viewport**: 390x844

**theme**: dark

**locale**: es

**bodyWidth**: 390

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 62,
    "width": 390,
    "scrollWidth": 390,
    "scrollHeight": 61,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 62,
    "height": 782,
    "width": 390,
    "scrollWidth": 390,
    "scrollHeight": 782,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 224,
    "height": 58,
    "width": 370,
    "scrollWidth": 1163,
    "scrollHeight": 58,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 288,
    "height": 540,
    "width": 370,
    "scrollWidth": 780,
    "scrollHeight": 540,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 59,
    "height": 726,
    "width": 364,
    "scrollWidth": 364,
    "scrollHeight": 724,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E034

**file**: E034-request-mobile.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J42

**screen**: Solicitudes

**action**: Reducir solicitud a móvil

**observation**: Formulario de solicitud y selección de turno a 390px

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Formulario de solicitud y selección de turno a 390px

**screenshot_reference**: E034-request-mobile.png


### E035

**url**: https://shiftimport.anclora.com/login

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: []

**id**: E035

**file**: E035-auth-required.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J03

**screen**: Auth

**action**: Enviar login vacío

**observation**: Validación nativa de campos obligatorios; sin credenciales enviadas

**dom_lang**: es

**surface**: APPLICATION

**route**: /login

**state**: Validación nativa de campos obligatorios; sin credenciales enviadas

**screenshot_reference**: E035-auth-required.png


### E036

**url**: https://shiftimport.anclora.com/login

**viewport**: 430x932

**theme**: light

**locale**: en

**bodyWidth**: 430

**metrics**: []

**id**: E036

**file**: E036-auth-mobile.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J03

**screen**: Auth

**action**: Inspeccionar auth EN en 430px

**observation**: Campos etiquetados y entrada invitado

**dom_lang**: es

**surface**: APPLICATION

**route**: /login

**state**: Campos etiquetados y entrada invitado

**screenshot_reference**: E036-auth-mobile.png


### E037

**url**: https://shiftimport.anclora.com/privacy

**viewport**: 430x932

**theme**: light

**locale**: en

**bodyWidth**: 430

**metrics**: [
  {
    "selector": "MAIN",
    "y": 0,
    "height": 5046,
    "width": 415,
    "scrollWidth": 415,
    "scrollHeight": 5046,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "HEADER",
    "y": 48,
    "height": 117,
    "width": 367,
    "scrollWidth": 367,
    "scrollHeight": 117,
    "overflowX": "visible",
    "overflowY": "visible"
  }
]

**id**: E037

**file**: E037-privacy.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J63

**screen**: Legal

**action**: Abrir política desde ruta pública

**observation**: Navegación legal y contenido visible

**dom_lang**: es

**surface**: LANDING_PAGE

**route**: /privacy

**state**: Navegación legal y contenido visible

**screenshot_reference**: E037-privacy.png


### E038

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x813

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 750,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 750,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 575,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 575,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 57,
    "height": 699,
    "width": 1138,
    "scrollWidth": 1138,
    "scrollHeight": 697,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E038

**file**: E038-team-areas.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J52

**screen**: Equipo

**action**: Abrir Áreas

**observation**: Dos áreas con conteos de empleados y planificadores

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Dos áreas con conteos de empleados y planificadores

**screenshot_reference**: E038-team-areas.png


### E039

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x813

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 750,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 750,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 575,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 575,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 57,
    "height": 699,
    "width": 1138,
    "scrollWidth": 1138,
    "scrollHeight": 697,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E039

**file**: E039-assignments.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J52

**screen**: Equipo

**action**: Abrir Asignaciones

**observation**: Movimiento masivo por área con fecha efectiva; sin ejecutar

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Movimiento masivo por área con fecha efectiva; sin ejecutar

**screenshot_reference**: E039-assignments.png


### E040

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x813

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 750,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 750,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 575,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 575,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 57,
    "height": 699,
    "width": 1138,
    "scrollWidth": 1138,
    "scrollHeight": 697,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E040

**file**: E040-team-no-results.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J45

**screen**: Equipo

**action**: Buscar persona inexistente

**observation**: Estado sin resultados específico de personas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Estado sin resultados específico de personas

**screenshot_reference**: E040-team-no-results.png


### E041

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 153,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 208,
    "height": 672,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 672,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 54,
    "height": 792,
    "width": 1378,
    "scrollWidth": 1378,
    "scrollHeight": 790,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E041

**file**: E041-self-import-conflict.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J20,J22,J26

**screen**: Importar

**action**: Procesar fixture ajena al perfil Employee

**observation**: Matching bloqueado y resumen futuro contradictorio

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Matching bloqueado y resumen futuro contradictorio

**screenshot_reference**: E041-self-import-conflict.png


### E042

**url**: https://shiftimport.anclora.com/terms

**viewport**: 430x932

**theme**: light

**locale**: en

**bodyWidth**: 430

**metrics**: [
  {
    "selector": "MAIN",
    "y": 0,
    "height": 3285,
    "width": 415,
    "scrollWidth": 415,
    "scrollHeight": 3285,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "HEADER",
    "y": 48,
    "height": 117,
    "width": 367,
    "scrollWidth": 367,
    "scrollHeight": 117,
    "overflowX": "visible",
    "overflowY": "visible"
  }
]

**id**: E042

**file**: E042-terms.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J63

**screen**: Legal

**action**: Abrir términos

**observation**: Contenido legal EN accesible

**dom_lang**: es

**surface**: LANDING_PAGE

**route**: /terms

**state**: Contenido legal EN accesible

**screenshot_reference**: E042-terms.png


### E043

**url**: https://shiftimport.anclora.com/legal

**viewport**: 430x932

**theme**: light

**locale**: en

**bodyWidth**: 430

**metrics**: [
  {
    "selector": "MAIN",
    "y": -1642,
    "height": 2464,
    "width": 415,
    "scrollWidth": 415,
    "scrollHeight": 2464,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "HEADER",
    "y": -1594,
    "height": 117,
    "width": 367,
    "scrollWidth": 367,
    "scrollHeight": 117,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "modal-overlay",
    "y": 0,
    "height": 932,
    "width": 430,
    "scrollWidth": 430,
    "scrollHeight": 932,
    "overflowX": "auto",
    "overflowY": "auto"
  },
  {
    "selector": "modal-content",
    "y": 229,
    "height": 475,
    "width": 404,
    "scrollWidth": 404,
    "scrollHeight": 473,
    "overflowX": "auto",
    "overflowY": "auto"
  }
]

**id**: E043

**file**: E043-cookie-preferences.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J62

**screen**: Cookies

**action**: Abrir preferencias

**observation**: Opcionales desactivadas; necesarias explicadas

**dom_lang**: es

**surface**: LANDING_PAGE

**route**: /legal

**state**: Opcionales desactivadas; necesarias explicadas

**screenshot_reference**: E043-cookie-preferences.png


### E044

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x813

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 750,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 750,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 575,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 575,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 57,
    "height": 699,
    "width": 1138,
    "scrollWidth": 1138,
    "scrollHeight": 697,
    "overflowX": "hidden",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content",
    "y": 257,
    "height": 300,
    "width": 558,
    "scrollWidth": 558,
    "scrollHeight": 298,
    "overflowX": "auto",
    "overflowY": "auto"
  }
]

**id**: E044

**file**: E044-person-preview.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J46,J51

**screen**: Equipo

**action**: Recorrer alta sin acceso hasta resumen

**observation**: Paso de ámbito de la creación de persona sin acceso; el resumen final se documenta en E047.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Paso de ámbito de la creación de persona sin acceso; el resumen final se documenta en E047.

**screenshot_reference**: E044-person-preview.png


### E045

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x900

**theme**: dark

**locale**: en

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 153,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1163,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 208,
    "height": 672,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 672,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 63,
    "height": 774,
    "width": 778,
    "scrollWidth": 778,
    "scrollHeight": 772,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E045

**file**: E045-requests-en.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J42,J60

**screen**: Solicitudes

**action**: Abrir solicitudes EN

**observation**: Estado vacío y filtro traducidos

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Estado vacío y filtro traducidos

**screenshot_reference**: E045-requests-en.png


### E046

**url**: https://shiftimport.anclora.com/app

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 1128,
    "scrollWidth": 1136,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 607,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 607,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 54,
    "height": 792,
    "width": 1378,
    "scrollWidth": 1378,
    "scrollHeight": 790,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E046

**file**: E046-partial-en.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J20,J26

**screen**: Importar

**action**: Cargar fixture de códigos desconocidos

**observation**: Asistente y decisión temporal en EN

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Asistente y decisión temporal en EN

**screenshot_reference**: E046-partial-en.png


### E047

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x813

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 750,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 750,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 575,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 575,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 57,
    "height": 699,
    "width": 1138,
    "scrollWidth": 1138,
    "scrollHeight": 697,
    "overflowX": "hidden",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content",
    "y": 211,
    "height": 390,
    "width": 558,
    "scrollWidth": 558,
    "scrollHeight": 388,
    "overflowX": "auto",
    "overflowY": "auto"
  }
]

**id**: E047

**file**: E047-person-summary.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J46,J51

**screen**: Equipo

**action**: Llegar a confirmación del alta

**observation**: Resumen acceso No ficha Sí antes de crear

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Resumen acceso No ficha Sí antes de crear

**screenshot_reference**: E047-person-summary.png


### E048

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x813

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 750,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 750,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 575,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 575,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content",
    "y": 137,
    "height": 540,
    "width": 638,
    "scrollWidth": 638,
    "scrollHeight": 538,
    "overflowX": "auto",
    "overflowY": "auto"
  }
]

**id**: E048

**file**: E048-shift-types.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J53

**screen**: Ajustes

**action**: Abrir tipos de turno

**observation**: Tipos configurables y nombres accesibles de colores

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Tipos configurables y nombres accesibles de colores

**screenshot_reference**: E048-shift-types.png


### E049

**url**: https://shiftimport.anclora.com/app

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 1128,
    "scrollWidth": 1136,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 607,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 607,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 54,
    "height": 792,
    "width": 1378,
    "scrollWidth": 1378,
    "scrollHeight": 790,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E049

**file**: E049-assistant-resolved.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J20,J23

**screen**: Importar

**action**: Clasificar código como descanso y aplicar sin guardar formato

**observation**: Recuperación del formato conserva cinco filas

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Recuperación del formato conserva cinco filas

**screenshot_reference**: E049-assistant-resolved.png


### E050

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x813

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 750,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 750,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 575,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 575,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 57,
    "height": 699,
    "width": 1118,
    "scrollWidth": 1118,
    "scrollHeight": 697,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E050

**file**: E050-legacy-users.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J45,J54

**screen**: Usuarios

**action**: Ajustes → Equipo → Abrir Usuarios

**observation**: Segundo workspace de usuarios; aquí se descubre Importar CSV

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Segundo workspace de usuarios; aquí se descubre Importar CSV

**screenshot_reference**: E050-legacy-users.png


### E051

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x813

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 750,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 750,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 575,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 575,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 57,
    "height": 699,
    "width": 1118,
    "scrollWidth": 1118,
    "scrollHeight": 697,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E051

**file**: E051-bulk-users.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J54

**screen**: bulk-users

**action**: Upload existing synthetic users CSV; stop before confirmation

**observation**: 18 rows: 17 errors, one unlinked user; summary labels one as already member. No users provisioned.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: 18 rows: 17 errors, one unlinked user; summary labels one as already member. No users provisioned.

**screenshot_reference**: E051-bulk-users.png


### E052

**url**: https://shiftimport.anclora.com/app

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 1128,
    "scrollWidth": 1136,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 607,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 607,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 54,
    "height": 792,
    "width": 1378,
    "scrollWidth": 1378,
    "scrollHeight": 790,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E052

**file**: E052-pdf-unsupported.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J18

**screen**: import

**action**: Process synthetic unknown-code PDF

**observation**: Unsupported, zero shifts, explicit no-import warning and period uncertainty; no raw exception.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Unsupported, zero shifts, explicit no-import warning and period uncertainty; no raw exception.

**screenshot_reference**: E052-pdf-unsupported.png


### E053

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x813

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 750,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 750,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 575,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 575,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 57,
    "height": 699,
    "width": 1118,
    "scrollWidth": 1118,
    "scrollHeight": 697,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E053

**file**: E053-bulk-employees-error.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J55

**screen**: bulk-employees

**action**: Upload synthetic roster with unsupported headers

**observation**: CSV rejected with header guidance; current employee list preserved.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: CSV rejected with header guidance; current employee list preserved.

**screenshot_reference**: E053-bulk-employees-error.png


### E054

**url**: https://shiftimport.anclora.com/app

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 1128,
    "scrollWidth": 1136,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 607,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 607,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 54,
    "height": 792,
    "width": 1378,
    "scrollWidth": 1378,
    "scrollHeight": 790,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E054

**file**: E054-xlsx-preview.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J17

**screen**: import

**action**: Process synthetic four-sheet workbook

**observation**: 674 rows in preview, historical/future counts; no commit as guest.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: 674 rows in preview, historical/future counts; no commit as guest.

**screenshot_reference**: E054-xlsx-preview.png


### E055

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x813

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 750,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 750,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 575,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 575,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 57,
    "height": 699,
    "width": 1118,
    "scrollWidth": 1118,
    "scrollHeight": 697,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E055

**file**: E055-bulk-employees-preview.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J55

**screen**: bulk-employees

**action**: Preview existing, new, duplicate-ID and missing-ID rows

**observation**: Existing and missing ID identified; repeated new ID counted twice as New. Stop before confirmation.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Existing and missing ID identified; repeated new ID counted twice as New. Stop before confirmation.

**screenshot_reference**: E055-bulk-employees-preview.png


### E056

**url**: https://shiftimport.anclora.com/app

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 1128,
    "scrollWidth": 1136,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 607,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 607,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 54,
    "height": 792,
    "width": 1378,
    "scrollWidth": 1378,
    "scrollHeight": 790,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E056

**file**: E056-image-unsupported.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J19

**screen**: import

**action**: Process synthetic illegible image as guest

**observation**: Unsupported with recovery copy; authenticated visual fallback not exercised.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Unsupported with recovery copy; authenticated visual fallback not exercised.

**screenshot_reference**: E056-image-unsupported.png


### E057

**url**: http://127.0.0.1:3199/app

**viewport**: 390x844

**theme**: dark

**locale**: es

**bodyWidth**: 390

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 62,
    "width": 390,
    "scrollWidth": 390,
    "scrollHeight": 61,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 62,
    "height": 782,
    "width": 390,
    "scrollWidth": 390,
    "scrollHeight": 782,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 254,
    "height": 58,
    "width": 370,
    "scrollWidth": 1163,
    "scrollHeight": 58,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 318,
    "height": 510,
    "width": 370,
    "scrollWidth": 780,
    "scrollHeight": 510,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content modal-content--workspace",
    "y": 59,
    "height": 726,
    "width": 357,
    "scrollWidth": 357,
    "scrollHeight": 724,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E057

**file**: E057-bulk-mobile.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J55

**screen**: bulk-employees

**action**: Resize preview to 390x844

**observation**: Four-row preview and confirmation footer on mobile; no commit.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Four-row preview and confirmation footer on mobile; no commit.

**screenshot_reference**: E057-bulk-mobile.png


### E058

**url**: http://127.0.0.1:3199/app

**viewport**: 1440x900

**theme**: dark

**locale**: es

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 163,
    "height": 49,
    "width": 1128,
    "scrollWidth": 1169,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 218,
    "height": 662,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 662,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content",
    "y": 379,
    "height": 141,
    "width": 638,
    "scrollWidth": 638,
    "scrollHeight": 139,
    "overflowX": "auto",
    "overflowY": "auto"
  }
]

**id**: E058

**file**: E058-learned-empty.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J23

**screen**: learned-formats

**action**: Open learned formats as Admin

**observation**: Existing synthetic organization has no saved formats; lifecycle mutations not performed.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Existing synthetic organization has no saved formats; lifecycle mutations not performed.

**screenshot_reference**: E058-learned-empty.png


### E059

**url**: https://shiftimport.anclora.com/app

**viewport**: 390x844

**theme**: light

**locale**: en

**bodyWidth**: 375

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 62,
    "width": 375,
    "scrollWidth": 375,
    "scrollHeight": 61,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 62,
    "height": 782,
    "width": 375,
    "scrollWidth": 375,
    "scrollHeight": 782,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 232,
    "height": 69,
    "width": 355,
    "scrollWidth": 1130,
    "scrollHeight": 58,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 307,
    "height": 521,
    "width": 355,
    "scrollWidth": 780,
    "scrollHeight": 510,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 10,
    "height": 824,
    "width": 368,
    "scrollWidth": 475,
    "scrollHeight": 822,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E059

**file**: E059-preview-light390.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J24

**screen**: import

**action**: Ready CSV preview at 390x844

**observation**: Five editable rows exist in DOM; mobile layout inspection of effective row visibility.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Five editable rows exist in DOM; mobile layout inspection of effective row visibility.

**screenshot_reference**: E059-preview-light390.png


### E060

**url**: https://shiftimport.anclora.com/app

**viewport**: 430x932

**theme**: light

**locale**: en

**bodyWidth**: 415

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 62,
    "width": 415,
    "scrollWidth": 415,
    "scrollHeight": 61,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 62,
    "height": 870,
    "width": 415,
    "scrollWidth": 415,
    "scrollHeight": 870,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 232,
    "height": 69,
    "width": 395,
    "scrollWidth": 1130,
    "scrollHeight": 58,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 307,
    "height": 609,
    "width": 395,
    "scrollWidth": 780,
    "scrollHeight": 598,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 10,
    "height": 912,
    "width": 408,
    "scrollWidth": 475,
    "scrollHeight": 910,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E060

**file**: E060-preview430.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J24

**screen**: import

**action**: Resize ready preview to 430x932

**observation**: Compare row visibility at larger phone viewport.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Compare row visibility at larger phone viewport.

**screenshot_reference**: E060-preview430.png


### E061

**url**: https://shiftimport.anclora.com/app

**viewport**: 768x1024

**theme**: light

**locale**: en

**bodyWidth**: 768

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 768,
    "scrollWidth": 768,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 961,
    "width": 768,
    "scrollWidth": 768,
    "scrollHeight": 961,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 66,
    "width": 736,
    "scrollWidth": 1132,
    "scrollHeight": 55,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 279,
    "height": 725,
    "width": 736,
    "scrollWidth": 760,
    "scrollHeight": 714,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 61,
    "height": 901,
    "width": 735,
    "scrollWidth": 735,
    "scrollHeight": 899,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E061

**file**: E061-preview-tablet.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J24

**screen**: import

**action**: Ready preview at 768x1024

**observation**: Tablet comparison of editable workspace.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Tablet comparison of editable workspace.

**screenshot_reference**: E061-preview-tablet.png


### E062

**url**: https://shiftimport.anclora.com/app

**viewport**: 844x390

**theme**: light

**locale**: en

**bodyWidth**: 829

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 829,
    "scrollWidth": 829,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 512,
    "width": 829,
    "scrollWidth": 829,
    "scrollHeight": 512,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 54,
    "width": 797,
    "scrollWidth": 1132,
    "scrollHeight": 43,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 267,
    "height": 288,
    "width": 797,
    "scrollWidth": 797,
    "scrollHeight": 288,
    "overflowX": "auto",
    "overflowY": "auto"
  },
  {
    "selector": "modal-content import-modal",
    "y": 23,
    "height": 343,
    "width": 803,
    "scrollWidth": 803,
    "scrollHeight": 341,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E062

**file**: E062-preview-landscape.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J24

**screen**: import

**action**: Ready preview at 844x390

**observation**: Landscape comparison of import workspace.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Landscape comparison of import workspace.

**screenshot_reference**: E062-preview-landscape.png


### E063

**url**: http://127.0.0.1:3199/app

**viewport**: 768x1024

**theme**: light

**locale**: en

**bodyWidth**: 768

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 768,
    "scrollWidth": 768,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 961,
    "width": 768,
    "scrollWidth": 768,
    "scrollHeight": 961,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 153,
    "height": 55,
    "width": 736,
    "scrollWidth": 1159,
    "scrollHeight": 55,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 214,
    "height": 790,
    "width": 736,
    "scrollWidth": 760,
    "scrollHeight": 790,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content",
    "y": 287,
    "height": 451,
    "width": 518,
    "scrollWidth": 518,
    "scrollHeight": 449,
    "overflowX": "auto",
    "overflowY": "auto"
  }
]

**id**: E063

**file**: E063-manual-light-tablet.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: LOCAL_BUILD

**journey**: J11

**screen**: manual-shift

**action**: Open Add past shift as Employee; no confirmation

**observation**: Named date/time segmented controls and visible confirmation at tablet width, light EN.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Named date/time segmented controls and visible confirmation at tablet width, light EN.

**screenshot_reference**: E063-manual-light-tablet.png


### E064

**url**: https://shiftimport.anclora.com/app

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: [
  {
    "selector": "app-shell__topbar",
    "y": 0,
    "height": 63,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 62,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "app-shell__main",
    "y": 63,
    "height": 837,
    "width": 1176,
    "scrollWidth": 1176,
    "scrollHeight": 837,
    "overflowX": "visible",
    "overflowY": "visible"
  },
  {
    "selector": "totals-ribbon",
    "y": 207,
    "height": 60,
    "width": 1128,
    "scrollWidth": 1136,
    "scrollHeight": 49,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "month-grid-shell",
    "y": 273,
    "height": 607,
    "width": 1128,
    "scrollWidth": 1128,
    "scrollHeight": 607,
    "overflowX": "auto",
    "overflowY": "hidden"
  },
  {
    "selector": "modal-content import-modal",
    "y": 54,
    "height": 792,
    "width": 1378,
    "scrollWidth": 1378,
    "scrollHeight": 790,
    "overflowX": "hidden",
    "overflowY": "hidden"
  }
]

**id**: E064

**file**: E064-ready-process-enabled.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J16

**screen**: import

**action**: Process valid QA Ready CSV

**observation**: Ready with five rows; Process file enabled, historical-only selected although future badge announces draft.

**dom_lang**: es

**surface**: APPLICATION

**route**: /app

**state**: Ready with five rows; Process file enabled, historical-only selected although future badge announces draft.

**screenshot_reference**: E064-ready-process-enabled.png


### E065

**url**: https://shiftimport.anclora.com/signup

**viewport**: 1440x900

**theme**: light

**locale**: en

**bodyWidth**: 1440

**metrics**: []

**id**: E065

**file**: E065-signup.png

**evidence_level**: MEASURED_BROWSER

**browser_environment**: PRODUCTION

**journey**: J02

**screen**: auth

**action**: Start free then submit empty sign-up

**observation**: Registration fields and native required email validation; no account created.

**dom_lang**: es

**surface**: APPLICATION

**route**: /signup

**state**: Registration fields and native required email validation; no account created.

**screenshot_reference**: E065-signup.png


## 45 · Validación y publicación

HTML autocontenido con imágenes incrustadas. Recorrido browser de secciones, anchors e imágenes realizado en Chromium; desktop1440 y móvil390 sin overflow después de corregir el propio informe. Impresión A4 renderizada y muestras de portada, finding, matriz y evidencia revisadas; no inspección visual de cada página. El PDF es evidencia técnica de impresión, no entregable editorial principal. Tras la fase de auditoría read-only, el usuario autorizó commit, push y promoción de las cuatro ramas canónicas. El commit del manual concurrente 89104ad no cambia src/api/db/package respecto al HEAD auditado.


### Registro

**check**: Finding count

**result**: 10 HTML = 10 JSON (9 UX + 1 engineering)


### Registro

**check**: Journey/task count

**result**: 65 fichas y 65 tareas


### Registro

**check**: Historical/Claude

**result**: 9 históricos / 2 retests


### Registro

**check**: Evidence

**result**: 62 IDs únicos / 62 imágenes incrustadas


### Registro

**check**: HTML / visual

**result**: PASS en anchors/imágenes/overflow; recorrido completo de secciones y revisión visual de muestras


### Registro

**check**: Print

**result**: PASS_WITH_GAPS: render A4 y muestras revisadas; no cada página


### Registro

**check**: Publicación

**result**: Solo HTML/MD/JSON de docs/audits en commit; 62 imágenes incrustadas, evidencia fuente local ignorada por commit concurrente26a2ec4. Ramas development/staging/production/main por fast-forward.
