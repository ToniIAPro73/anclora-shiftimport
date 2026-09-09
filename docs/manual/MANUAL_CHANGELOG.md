# Manual de usuario — registro de reconstrucción 3.0

Fecha de comprobación: 9 de septiembre de 2026. Documento editorial de trazabilidad; no es una auditoría UX/UI ni una certificación del despliegue.

## Versión y alcance

- MANUAL_PREVIOUS_VERSION: 2.0.
- MANUAL_NEW_VERSION: 3.0.
- VERSION_CHANGE_REASON: reconstrucción sustancial de la arquitectura, los recorridos por perfil y la explicación de tareas; sustitución de todas las capturas de interfaz y ampliación de ayuda. Se conserva el esquema de versión numérica del documento; no se establece una política nueva.
- Markdown canónico: `docs/manual/manual-usuario.md`.
- PDF: `public/manuals/anclora-shiftimport-manual-usuario-es.pdf`.
- Generador conservado: `scripts/generate-manual-pdf.mjs`, Playwright, A4, dos pasadas, imágenes embebidas, índice automático y pie numerado.

## Preflight antes de editar

| Dato | Resultado |
| --- | --- |
| Rama | development |
| CURRENT_HEAD | 42ff86995ad8a486af79d9d900ab3b069fff4a8e |
| REMOTE_DEVELOPMENT_HEAD | 42ff86995ad8a486af79d9d900ab3b069fff4a8e |
| LOCAL_REMOTE_MATCH | TRUE |
| WORKTREE_STATUS inicial | Únicamente `?? docs/audits/evidence/anclora-shiftimport-codex-2026-09-09/` |
| Fetch | `git fetch --all --prune`, completado |
| Historial | `git log -20 --oneline`, leído |
| Concurrencia | `docs/audits/**` tratado como salida independiente; no se utilizaron sus findings, ni se modificaron o borraron sus archivos |

Durante la reconstrucción editorial no se ejecutaron pull, merge, reset, rebase, cambio destructivo de rama, commit, push ni despliegue. Posteriormente el usuario autorizó commit, push y promoción de development, staging, production y main al mismo commit; esa autorización sustituye la prohibición inicial. No se consultaron ni modificaron bases de datos o variables de entorno.

## Qué se verificó y con qué límites

La página pública conocida `https://shiftimport.anclora.com` se abrió en navegador en modo de solo lectura. Se comprobaron la entrada y la presentación pública. Esto **no demuestra que todos los recorridos autenticados del despliegue coincidan con development**.

Los recorridos autenticados y las capturas se comprobaron en la aplicación React actual servida localmente en `http://localhost:3199`, con Chromium y un contexto aislado. Todas las peticiones `/api/**` de ese contexto recibieron respuestas sintéticas mediante interceptación de red. Los formularios, selectores, modales y parsers locales son los del producto; no son imágenes dibujadas ni recreaciones HTML. Las escrituras simuladas de altas, publicación e importación no tocaron Neon ni producción. La semántica del servidor se contrastó con código y pruebas; estas capturas no se presentan como una prueba E2E de persistencia real.

Viewport de captura: 1440 × 900 CSS px, densidad 1,5, español y modo oscuro. Los diálogos pequeños tienen recortes tomados directamente del navegador para que se lean mejor en A4. Las dimensiones de esos recortes no representan nuevos tamaños de dispositivo. No se añadieron capturas móviles o claras porque no eran necesarias para los recorridos elegidos. Personas y correos sintéticos; las contraseñas de demostración están ocultas en la captura de credenciales.

### Fuentes consultadas

- Baseline completo: `docs/manual/manual-usuario.md`, `scripts/generate-manual-pdf.mjs` y texto extraído del PDF anterior.
- Contexto: `README*`, `AGENTS.md`, `.anclora/AOS_ADOPTION.md`, `package.json`, `docs/db-environments.md`. `CLAUDE.md` no estaba presente.
- Navegación y disponibilidad: `src/App.tsx`, componentes de calendario, importación, equipo, ajustes y `src/components/employee-portal/`.
- Importación: `src/ingestion/`, `src/lib/format-profiles.ts`, `src/lib/format-profile-store.ts`, almacenamiento, tipos y lógica de turnos; API de imports/shifts/ingestion y pruebas asociadas.
- Planificación, solicitudes y autoridad: componentes y API de schedules, change-requests, approval-requests, memberships y employees; `api/_lib/auth.js`, `api/_lib/data.js` y pruebas asociadas.
- Altas y credenciales: `MembersModal`, `MembersModal`/bulk tests, alta masiva de empleados y usuarios, auth/request-reset, transferencia y reset de organización.
- Documentación actual: `docs/product/RBAC_SCOPE_MATRIX.md`, `docs/roadmap/shiftimport-mvp-v2/R0/RBAC-MODEL.md`, `docs/specs/P5.7-MASTER-SPEC.md`, especificaciones de `sdd/`, documentación multitenant y planes.
- Contratos AOS y locales: marca, colores, tipografía, modal, aplicación premium, consentimiento de cookies y localización en `docs/standards/`.
- Inventariados `src/`, `api/`, `db/`, `qa/`, `scripts/`, `docs/`, especificaciones, roadmap y `public/`. Las pruebas están junto al código y en `qa/`; no había directorios raíz `tests/` ni `docs/governance/`.

El roadmap y los componentes no montados no se aceptaron como prueba de disponibilidad. Cuando un contrato de permisos y el recorrido actual difieren, el manual explica lo que la persona puede abrir hoy.

## Revisión material del baseline

Las clasificaciones pueden coexistir: una función puede estar confirmada y necesitar instrucciones o imagen nuevas. Esta tabla agrupa las afirmaciones materiales del baseline por tema; no conserva como válidas las explicaciones sustituidas.

| Tema del baseline | Clasificación | Decisión en 3.0 |
| --- | --- | --- |
| Qué es el producto, conversión y revisión | CONFIRMED_CURRENT / TOO_VAGUE | Abrir con el beneficio y una primera ruta, sin principios internos |
| No es nómina ni sustituto del cuadrante | CONFIRMED_CURRENT | Mantener un límite de uso breve |
| Formatos individuales | PARTIALLY_CURRENT | Separar PDF/imagen/CSV/XLSX; advertir límites de estructura y primera hoja |
| JSON/XML y varias hojas | PARTIALLY_CURRENT | Explicar solo en recorrido de equipo, sin soporte universal |
| Compatibilidad y requisitos técnicos | TOO_TECHNICAL | Sustituir por archivo legible, periodo, identidad y permisos |
| Acceso, registro y organización inicial | NEEDS_STEP_BY_STEP / NEEDS_SCREENSHOT | Acceso, cuenta, organización, plan y comprobación final |
| Invitado permite guardar una importación | OUTDATED | La vista previa actual exige iniciar sesión para confirmar |
| Persistencia de invitado al cerrar | PARTIALLY_CURRENT | Distinguir cerrar pestaña de borrar datos/navegación privada |
| Roles y ámbitos | PARTIALLY_CURRENT / TOO_TECHNICAL | Explicación breve y matriz de controles realmente disponibles |
| Planificador importa desde navegación actual | OUTDATED | No ofrecer el modal de equipo ni el individual al planificador |
| Gestores envían solicitudes propias en autoservicio | PARTIALLY_CURRENT | Distinguir consulta propia y envío disponible al empleado |
| Usuario frente a empleado | NEEDS_EXAMPLE | Ejemplo de ficha sin cuenta y vinculación posterior |
| Sidebar y contexto | NEEDS_SCREENSHOT / NEEDS_STEP_BY_STEP | Navegación completa/contraída y contexto antes de actuar |
| Calendario, colores y métricas | CONFIRMED_CURRENT / TOO_VAGUE | Explicar días, meses, origen y límites de totales |
| Safe Import: archivo, identidad, preview | NEEDS_STEP_BY_STEP / NEEDS_SCREENSHOT | Recorrido distribuido entre capítulos 7–13 |
| Editar y quitar filas antes de confirmar | CONFIRMED_CURRENT / NEEDS_EXAMPLE | Capturas separadas de edición y retirada |
| Estados y cero turnos | NEEDS_EXAMPLE / NEEDS_SCREENSHOT | Tabla de estados y archivo sin interpretación usable |
| Futuro, hoy y consentimiento | TOO_TECHNICAL / NEEDS_STEP_BY_STEP | Hoy forma parte del futuro; histórico o borrador, después publicar |
| Idempotencia y fingerprint | TOO_TECHNICAL | Reimportación, turnos existentes y comprobación del resultado |
| Conflictos | PARTIALLY_CURRENT | Separar resolución individual y conflictos que equipo no sobrescribe |
| Asistente y códigos desconocidos | NEEDS_EXAMPLE / NEEDS_SCREENSHOT | No convertir un encabezado en turno; consultar leyenda |
| Aprendizaje, estados y versiones | NEEDS_STEP_BY_STEP / NEEDS_SCREENSHOT | Biblioteca poblada, versiones anteriores y renombrado |
| Historial como auditoría | TOO_TECHNICAL / TOO_VAGUE | Archivo, fecha, persona, recuentos y filtros |
| Eliminar una importación | NEEDS_STEP_BY_STEP / NEEDS_SCREENSHOT | Confirmación y fila eliminada; revisar planificación aparte |
| Turnos manuales | CONFIRMED_CURRENT / NEEDS_EXAMPLE | Fecha anterior a hoy; no usar para planificar |
| Planificador, borrador, asignaciones | TOO_TECHNICAL / NEEDS_SCREENSHOT | Filas, columnas, edición, solapamiento, descanso y ámbito |
| Publicación y versiones | NEEDS_STEP_BY_STEP | Recuentos, calendario operativo, nueva versión e historial |
| Regla de descanso presentada como legal | PARTIALLY_CURRENT | Once horas como comprobación del producto, no dictamen laboral |
| Portal Hoy, Mi semana y Confirmar recepción | OUTDATED / REMOVE | Componentes existentes pero no montados; enseñar calendario actual y solicitudes |
| Solicitudes y no autoaprobación | CONFIRMED_CURRENT / NEEDS_SCREENSHOT | Enviar, consultar, cancelar cuando proceda, aprobar/rechazar |
| Equipo: personas, roles, áreas, asignaciones | NEEDS_STEP_BY_STEP / NEEDS_SCREENSHOT | Separar ficha, acceso y ámbito; explicar fecha efectiva |
| Transferir propiedad | NEEDS_STEP_BY_STEP / NEEDS_SCREENSHOT | Recorrido específico del propietario y consecuencias |
| Alta masiva única de trabajadores/accesos | PARTIALLY_CURRENT | Dos CSV distintos; primero fichas, después cuentas |
| Ruta del alta masiva | OUTDATED | Ajustes → Equipo → Abrir Usuarios; pestañas Usuarios/Empleados |
| Credenciales temporales | PARTIALLY_CURRENT / NEEDS_STEP_BY_STEP | Mostrar una vez no equivale a contraseña de un solo uso |
| Descarga cifrada o envío garantizado | OUTDATED / REMOVE | TXT legible; entrega privada, no prometer correo automático |
| Recuperación de contraseña | PARTIALLY_CURRENT | Formulario real; no prometer entrega de email no verificada |
| Tipos de turno compartidos universalmente | PARTIALLY_CURRENT | Preferencias del navegador; nombre, color y trabajo son distintos |
| Tema, idioma y perfil | NEEDS_STEP_BY_STEP | Controles actuales según navegación y permisos |
| Restablecimiento | PARTIALLY_CURRENT | Precisar datos retirados/conservados; no usar para deshacer un archivo |
| Planes y precios | PARTIALLY_CURRENT | Límites configurados, precios orientativos y ausencia de promesa de cobro |
| Privacidad y aislamiento absoluto | OUTDATED / REMOVE | Controles de acceso, sin imposibilidad técnica absoluta ni dictamen legal |
| Documento siempre local | OUTDATED | Posible análisis visual autenticado externo al navegador |
| FAQ de siete preguntas | TOO_VAGUE | 25 preguntas prácticas respaldadas por el recorrido actual |
| Glosario interno | TOO_TECHNICAL | Solo términos útiles para una persona usuaria |

## Guías añadidas

- NEW_USER_GUIDANCE_ADDED: qué leer primero, acceso sin cuenta/con cuenta, primer contexto, tabla Importar/Añadir/Planificar, resultado esperado y errores comunes.
- ROLE_GUIDANCE_ADDED: cuatro perfiles explicados en lenguaje sencillo, matriz de navegación actual, ámbitos del planificador, límites de autoservicio y rutas por tamaño de organización.
- SAFE_IMPORT_DEPTH_IMPROVED: TRUE; archivo, análisis, identidad, asistente, corrección, retirada, estados, futuro, confirmación, duplicados, conflictos y equipo.
- PLANNER_DEPTH_IMPROVED: TRUE; filas/columnas, borrador, edición, conflictos, publicación, revisión y versiones.
- EMPLOYEE_PORTAL_DEPTH_IMPROVED: TRUE; guía autónoma del espacio actual de empleado, calendario/semana, turno asociado y solicitudes. No se inventan Hoy/Mi semana/acuse.
- TEAM_MANAGEMENT_DEPTH_IMPROVED: TRUE; fichas/cuentas, alta guiada, roles, áreas, asignaciones y propiedad.
- BULK_PROVISIONING_DEPTH_IMPROVED: TRUE; dos CSV, columnas requeridas, vínculos, duplicados, errores, resultado y credenciales.
- TROUBLESHOOTING_ADDED: TRUE; tabla específica de problemas/causa/acción.
- TECHNICAL_TERMS_REMOVED_OR_SIMPLIFIED: ScheduleVersion DRAFT → borrador semanal; ShiftAssignment → turno del borrador; FutureImportConsent → decisión sobre futuro; scope → ámbito; valid_from → fecha de entrada en vigor; idempotencia/fingerprint → reconocer duplicados; origin → procedencia del turno; localStorage → datos de ese navegador; provisioning → altas masivas; Anti-Self-Approval → no aprobar tu propia solicitud.

## Capturas consideradas sin forzar estados inexistentes

Se añadieron estados de acceso, importación, edición, eliminación, procesamiento, estructura no soportada, resultado, versiones, solicitudes, equipo, altas y credenciales. Calendario, sidebar y contexto se explican juntos cuando una imagen ya contiene los controles. El detalle de una importación se explica en su tarjeta real, no con un modal inventado.

No se fabricaron pantallas dedicadas de Hoy, Mi semana o Confirmar recepción: no están montadas en la navegación actual. Tampoco se fabricaron pantallas independientes READY/PARTIAL/BLOCKED si el estado ya se explica con los avisos y recuentos presentes. La guía de conflicto y borrado describe controles respaldados por implementación y pruebas, aunque no cada variante tenga una imagen propia. No se usaron credenciales reales ni imágenes de una organización de producción.

## Generación y comprobaciones

El cambio del generador se limita a flujo entre capítulos, capítulos fluidos tras el índice, separación de encabezados, repetición de cabeceras de tabla, filas indivisibles, pies de figura, altura máxima de imágenes, tipografía embebida y comprobación de imágenes cargadas. Se conserva íntegro el mecanismo de dos pasadas y cálculo real del índice. No se añaden dependencias al repositorio.

- `node scripts/generate-manual-pdf.mjs`: completado.
- `pdfinfo public/manuals/anclora-shiftimport-manual-usuario-es.pdf`: A4, PDF 1.4, sin cifrado.
- `pdftotext public/manuals/anclora-shiftimport-manual-usuario-es.pdf - > /tmp/shiftimport-manual.txt`: extracción de validación.
- Comprobación de las 30 entradas del índice contra las páginas reales: coincidencia completa.
- Todas las referencias de imagen existen, son legibles y están embebidas; todos sus pies aparecen en el PDF.
- Comprobación geométrica del PDF: sin texto ni imágenes fuera de página; sin páginas accidentalmente vacías.
- Renderizado completo de todas las páginas para inspección visual de portada, índice, tablas, figuras y cierre. Resultado visual final registrado debajo.
- `npm run lint`: inicialmente bloqueado por siete errores de un caché no versionado dentro de la salida del agente concurrente. No se modificó ese caché.
- `npm run lint -- --ignore-pattern 'docs/audits/**'`: PASS.
- `npm run build`: PASS; advertencia existente de tamaño de chunk.
- `npm test -- --reporter=dot`: 1457/1458 pruebas pasaron; una prueba de ImportModal agotó 5000 ms durante la ejecución global.
- Repetición de `src/components/shift-dashboard/ImportModal.test.tsx`: 40/40 PASS. Se registra el timeout inicial; no se presenta la primera ejecución como totalmente verde.

La validación de impresión es digital A4; no se realizó una impresión física ni una certificación de accesibilidad PDF etiquetado. El PDF actual no es etiquetado.

## Métricas

| Métrica | Valor |
| --- | --- |
| SECTIONS_BEFORE | 23 |
| SECTIONS_AFTER | 30 |
| PDF_PAGES_BEFORE | 43 |
| PDF_PAGES_AFTER | 57 |
| PDF_SIZE_BEFORE | 11384532 |
| PDF_SIZE_AFTER | 16836867 |
| CURRENT_SCREENSHOT_COUNT | 21 |
| SCREENSHOTS_BEFORE | 21 |
| SCREENSHOTS_AFTER | 54 |
| SCREENSHOTS_KEPT | 0 |
| SCREENSHOTS_REPLACED | 21 |
| SCREENSHOTS_ADDED | 33 |
| SCREENSHOTS_REMOVED | 0 |
| FAQ_COUNT_BEFORE | 7 |
| FAQ_COUNT_AFTER | 25 |
| PDF_PAGE_COUNT | 57 |

Los recuentos de capturas excluyen `logo.png`, que se conserva como recurso de marca (KEEP). Había 22 PNG totales: 21 capturas y el logo. Ahora hay 55 PNG: 54 capturas y el logo. El incremento de capturas es 157,1 % (2,57 veces el baseline).

**Estado de Git de las imágenes:** `.gitignore` ignora este directorio. Para reproducir el manual después del commit autorizado se incorporan explícitamente los 55 recursos referenciados mediante `git add -f`, sin modificar `.gitignore`. Los 54 screenshots se cuentan respecto al baseline en disco, aunque para Git sean archivos nuevos.

## Inventario de capturas

Cada captura inicial tiene decisión REPLACE. Las filas NEW_REQUIRED corresponden a necesidades editoriales que se han cubierto con archivos nuevos. No se eliminó ninguna captura inicial. Se descartaron únicamente capturas nuevas de trabajo redundantes que no llegaron al manual final.

| Archivo | Decisión inicial | Resultado | Dimensiones PNG | Qué enseña |
| --- | --- | --- | --- | --- |
| logo.png | KEEP | Conservado; no cuenta como screenshot | Recurso de marca | Identidad de portada |
| hero-dark.png | REPLACE | REPLACED | 2160 × 1350 | Página de inicio: Empezar gratis abre el recorrido de acceso a ShiftImport |
| login-dark.png | REPLACE | REPLACED | 690 × 912 | Inicio de sesión: utiliza el correo con el que te han concedido acceso |
| guest-empty-calendar-dark.png | REPLACE | REPLACED | 2160 × 1350 | Calendario de invitado: un espacio local vacío no significa que se hayan perdido datos de una cuenta |
| signup-dark.png | NEW_REQUIRED | ADDED | 690 × 1083 | Registro: comprueba el correo y repite la misma contraseña antes de crear la cuenta |
| onboarding-choice-dark.png | REPLACE | REPLACED | 2160 × 1350 | Bienvenida: elige el plan de uso antes de configurar la organización |
| calendar-month-dark.png | REPLACE | REPLACED | 2160 × 1350 | Calendario con navegación completa: comprueba organización, rol, empleado y área antes de actuar |
| sidebar-collapsed-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Navegación contraída: los iconos liberan espacio; Expandir navegación recupera los nombres |
| manual-create-dark.png | NEW_REQUIRED | ADDED | 816 × 711 | Alta manual: una fecha pasada y su horario, listos para confirmar |
| import-upload-dark.png | REPLACE | REPLACED | 2106 × 1224 | Importador individual: configura el periodo y el destino antes de seleccionar el archivo |
| import-file-selected-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Archivo seleccionado: comprueba su nombre antes de pulsar Procesar archivo |
| import-processing-dark.png | NEW_REQUIRED | ADDED | 2106 × 1224 | Análisis en curso: espera a que termine antes de revisar los turnos detectados |
| employee-matching-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Asistente de identidad: elige únicamente la fila que corresponde a la persona destinataria |
| import-assistant-dark.png | REPLACE | REPLACED | 2160 × 1350 | El asistente pregunta por texto no interpretado: no lo clasifiques como trabajo sin comprobar la leyenda |
| import-preview-dark.png | REPLACE | REPLACED | 2160 × 1350 | Vista previa individual: las fechas, tipos y horas se revisan antes de confirmar |
| preview-edit-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Corrección en la vista previa: cambia una hora y vuelve a comparar la fila con el documento |
| preview-delete-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Fila retirada de la vista previa: comprueba que el total se ha reducido antes de continuar |
| import-unsupported-dark.png | NEW_REQUIRED | ADDED | 2106 × 1224 | Archivo sin turnos utilizables: lee el diagnóstico y corrige el documento antes de reintentar |
| future-decision-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Decisión sobre fechas futuras: crear borradores no publica los turnos automáticamente |
| team-import-dark.png | REPLACE | REPLACED | 1176 × 600 | Cuadrante de equipo: revisa a quién corresponde cada grupo de turnos antes de seleccionarlo |
| team-preview-dark.png | NEW_REQUIRED | ADDED | 1176 × 704 | Resumen de equipo: compara turnos nuevos, conflictos y errores antes de pulsar Importar |
| import-success-dark.png | NEW_REQUIRED | ADDED | 1176 × 573 | Resultado de equipo: comprueba empleados procesados, turnos creados y errores antes de cerrar |
| format-profiles-dark.png | REPLACE | REPLACED | 996 × 435 | Formatos aprendidos: nombre, versión, estado y usos ayudan a reconocer la plantilla |
| format-history-dark.png | NEW_REQUIRED | ADDED | 996 × 635 | Versiones de un formato: la anterior permanece diferenciada de la plantilla vigente |
| format-rename-dark.png | NEW_REQUIRED | ADDED | 996 × 557 | Renombrar un formato: elige una etiqueta que describa la plantilla sin incluir datos de personas |
| history-dark.png | REPLACE | REPLACED | 1230 × 360 | Historial: la fila combina origen, periodo, responsable, recuentos y estado de la carga |
| history-filters-dark.png | NEW_REQUIRED | ADDED | 1230 × 360 | Filtro del historial: elegir un estado permite localizar cargas que necesitan atención |
| history-delete-dark.png | NEW_REQUIRED | ADDED | 756 × 495 | Confirmación de borrado: verifica qué importación vas a retirar antes de aceptar |
| history-deleted-dark.png | NEW_REQUIRED | ADDED | 1230 × 360 | Importación eliminada: la fila permanece visible para saber qué ocurrió |
| planner-dark.png | REPLACE | REPLACED | 2160 × 1350 | Planificador semanal: cada fila representa un empleado y cada columna un día |
| planner-assignment-dark.png | NEW_REQUIRED | ADDED | 996 × 515 | Editor del borrador: comprueba la persona y la fecha antes de guardar el horario |
| publish-confirmation-dark.png | NEW_REQUIRED | ADDED | 816 × 534 | Publicación: el diálogo explica que los turnos pasarán al calendario y el borrador dejará de ser editable |
| planner-published-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Versión publicada: Solo lectura indica que esa versión ya no admite cambios directos |
| planner-history-dark.png | NEW_REQUIRED | ADDED | 1326 × 348 | Historial de planificación: comprueba qué versión está publicada antes de tomarla como referencia |
| employee-calendar-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Espacio actual del empleado: calendario personal, importación propia, turnos pasados y solicitudes |
| employee-detail-dark.png | NEW_REQUIRED | ADDED | 816 × 711 | Turno asociado: comprueba la fecha y el horario al revisar una solicitud |
| request-new-dark.png | NEW_REQUIRED | ADDED | 1206 × 1197 | Nueva solicitud: selecciona el turno afectado y explica el cambio que necesitas |
| request-pending-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Solicitudes del empleado: revisa el estado antes de enviar otra petición sobre el mismo turno |
| requests-dark.png | REPLACE | REPLACED | 1506 × 1197 | Bandeja del gestor: compara el turno afectado y la petición antes de tomar una decisión |
| request-reject-dark.png | NEW_REQUIRED | ADDED | 1506 × 1197 | Rechazar una solicitud: explica el motivo antes de confirmar la resolución |
| equipo-personas-dark.png | REPLACE | REPLACED | 1710 × 840 | Personas: una sola lista permite distinguir acceso activo, ficha vinculada y acceso pendiente |
| team-add-person-dark.png | NEW_REQUIRED | ADDED | 876 × 507 | Añadir persona: empieza por la identidad y revisa después acceso, empleo y permisos |
| equipo-roles-dark.png | REPLACE | REPLACED | 1710 × 750 | Roles y acceso: revisa la autoridad y el ámbito sin confundirlos con la ficha de empleado |
| planner-scope-dark.png | NEW_REQUIRED | ADDED | 756 × 671 | Ámbito del planificador: selecciona las áreas o personas que realmente debe gestionar |
| equipo-areas-dark.png | REPLACE | REPLACED | 1710 × 675 | Áreas: comprueba su estado y utiliza Gestionar asignaciones para revisar las personas asociadas |
| equipo-asignaciones-dark.png | REPLACE | REPLACED | 2160 × 1350 | Asignaciones: revisa personas seleccionadas, destino y fecha de entrada en vigor |
| ownership-transfer-dark.png | NEW_REQUIRED | ADDED | 816 × 996 | Transferencia de propiedad: revisa al nuevo titular y tu rol posterior antes de confirmar |
| bulk-employees-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Alta masiva de empleados: comprueba identificador, nombre y estado de cada fila |
| bulk-users-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Alta masiva de usuarios: el correo da acceso y el identificador enlaza con la ficha existente |
| bulk-errors-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Vista previa con errores: una fila errónea necesita corrección antes de considerarla dada de alta |
| credentials-dark.png | NEW_REQUIRED | ADDED | 2160 × 1350 | Resultado del alta: descarga antes de cerrar; los valores de contraseña están ocultos en esta captura |
| settings-profile-dark.png | REPLACE | REPLACED | 996 × 990 | Perfil: revisa los datos personales y los identificadores que ayudan a reconocer tu cuadrante |
| settings-shifttypes-dark.png | REPLACE | REPLACED | 996 × 846 | Tipos de turno: el color y Cuenta como trabajo cumplen funciones distintas |
| pricing-dark.png | REPLACE | REPLACED | 2160 × 1350 | Planes: revisa el alcance de la modalidad elegida y la información vigente de la página |
| cookies-dark.png | REPLACE | REPLACED | 2160 × 1350 | Cookies: puedes rechazar las opcionales o revisar la configuración antes de decidir |

## Resultado final

FINAL_RESULT: PASS para la reconstrucción documental de la versión development verificada, con los límites de validación autenticada y de impresión indicados arriba.

| Validación | Resultado |
| --- | --- |
| CURRENT_PRODUCT_VERIFIED | TRUE: código, pruebas y navegador local; superficie pública en solo lectura |
| MANUAL_RESTRUCTURED / NON_TECHNICAL_LANGUAGE | TRUE / TRUE |
| ROLE_GUIDANCE_COMPLETE / TASK_GUIDANCE_COMPLETE | TRUE / TRUE, respecto a la navegación disponible |
| SCREENSHOT_COUNT_MATERIALLY_IMPROVED | TRUE: 21 → 54 |
| SCREENSHOTS_CURRENT / SCREENSHOTS_DARK_MODE | TRUE / TRUE |
| SAFE_IMPORT_FULLY_DOCUMENTED / HISTORY_DOCUMENTED | TRUE / TRUE |
| SCHEDULING_DOCUMENTED / EMPLOYEE_PORTAL_DOCUMENTED | TRUE / TRUE, espacio actual del empleado |
| TEAM_MANAGEMENT_DOCUMENTED / BULK_PROVISIONING_DOCUMENTED | TRUE / TRUE |
| FAQ_IMPROVED / TROUBLESHOOTING_PRESENT | TRUE / TRUE |
| MARKDOWN_VALID / PDF_GENERATED | TRUE / TRUE |
| TOC_VALIDATION / TOC_CORRECT | PASS / TRUE; 30 páginas de destino coinciden |
| SCREENSHOT_VALIDATION / NO_BROKEN_IMAGES | PASS / TRUE; 54 figuras y sus pies |
| CONTENT_VALIDATION / UI_LABEL_VALIDATION | PASS / PASS; límites actuales descritos |
| VISUAL_VALIDATION / NO_TRUNCATION | PASS / TRUE; 57 páginas renderizadas e inspeccionadas |
| PRINT_VALIDATION | PASS digital A4; sin prueba de impresión física |
| PRODUCT_CODE_MODIFIED | FALSE |

La última iteración se comparó por hash de cada página renderizada con la versión ya inspeccionada. Las páginas idénticas conservaron su revisión; se revisaron de nuevo el índice y todas las páginas cambiadas (40–57). Se comprobaron además las capturas recortadas de personas, roles y áreas a tamaño completo.

**Pregunta final:** sí, una persona nueva dispone de instrucciones para aprender las funciones accesibles de su perfil, reconocer el resultado y resolver los problemas habituales sin conocer términos internos ni experimentar a ciegas. Una limitación de permisos, un problema de acceso o una recuperación que requiera soporte no puede resolverse mediante el manual; se indica claramente cuándo ocurre.

La ejecución del commit, push y promoción autorizados se comunica con su SHA y verificación de ramas en la entrega final. No se afirma aquí un resultado remoto antes de ejecutarlo.

## Corrección puntual — 2026-09-09 (post UXR-F1)

- **Alcance**: 1 captura (`screenshots/pricing-dark.png`) + regeneración del PDF. Ninguna otra
  captura ni el texto en prosa se modificaron.
- **Motivo**: `UXR-F1-M03` (commit `cbd642d`, Fase 1 de la remediación UX Codex 2026-09-09) corrigió
  el sufijo de intervalo duplicado en Precios (`4,99 €/mes /mes` → `4,99 €/mes`) y la terminología de
  roles (`Admin/Manager` → `Admin/Planificador`). La captura anterior (generada antes de ese commit)
  mostraba ambos defectos; ya no representaba el producto.
- **No se cambió**: el número de versión de portada (sigue en 3.0) — esto es una corrección de un
  artefacto obsoleto, no una nueva edición del manual.
- **Verificación**: `node scripts/generate-manual-pdf.mjs` completado sin error; PDF revisado
  visualmente en la sección 27.
