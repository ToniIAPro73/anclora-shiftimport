# Recaptura del manual de usuario — Anclora ShiftImport

Documento operativo generado el 2026-09-25 (CHG-0014). Fuente de verdad: `docs/manual/screenshots.manifest.json`.

## Estado actual

| CURRENT | STALE | PLACEHOLDER | STATIC |
| ---: | ---: | ---: | ---: |
| 0 | 56 | 0 | 1 |

- **CURRENT**: la UI capturada sigue vigente; solo se actualizó el branding.
- **STALE**: la UI cambió después de la captura; pendiente de recaptura real (no se parchea).
- **PLACEHOLDER**: imagen de relleno o ausente; pendiente de captura real.
- **STATIC**: asset de marca del documento; no se captura.

## Reglas QA-safe

- Solo la identidad QA persistente definida en `.anclora/PRODUCTION_RUNTIME.md`; nunca la cuenta personal ni cuentas operativas.
- El ejecutor **no siembra, no crea y no borra datos**: navega y fotografía. Reutiliza los datos QA existentes (`QA_REUSE=true`).
- Las pantallas `assisted` las prepara el operador dentro de la cuenta QA; cualquier acción con escritura se hace solo sobre datos QA.
- Trabajo y commits en `development` (el script se niega a ejecutarse en otra rama).

## Requisitos

1. Dependencias del repo (`npm ci`) y Playwright del paquete QA (`npm run e2e:install:chromium`); el ejecutor reutiliza `qa/e2e-acceptance/node_modules/playwright-core`.
2. Variables en `.env.development.local` (no versionado): `MANUAL_QA_PASSWORD`, `MANUAL_QA_PASSWORD`, `MANUAL_QA_EMPLOYEE_EMAIL`, `MANUAL_QA_EMPLOYEE_PASSWORD`. Opcional `MANUAL_APP_URL` (por defecto `http://localhost:3199`).
3. Datos QA necesarios: Organización QA existente de qa.shiftimport@anclora.test (rol ADMIN) con áreas, personas y turnos sintéticos, más una identidad QA @anclora.test con rol EMPLOYEE en la misma organización. Fixture de importación: src/ingestion/fixtures/acceptance-corpus/fixtures/GS-03_hospitality/source.pdf. Las acciones asistidas (importar, publicar, solicitudes, borrados de historial) solo se ejecutan dentro de la organización QA.

## Identidades QA por rol

| Rol | Identidad | Variables | Acceso |
| --- | --- | --- | --- |
| `admin` | qa.shiftimport@anclora.test | `MANUAL_QA_EMAIL` / `MANUAL_QA_PASSWORD` | formulario automático |
| `employee` | valor de `MANUAL_QA_EMPLOYEE_EMAIL` (identidad QA @anclora.test) | `MANUAL_QA_EMPLOYEE_EMAIL` / `MANUAL_QA_EMPLOYEE_PASSWORD` | formulario automático |

## Ejecución (en el Mac)

```bash
# 1. Arrancar la app en una terminal
npx vercel dev --listen 3199   # base de datos de producción según contrato; este flujo NO siembra datos

# 2. En otra terminal, desde la raíz del repo
bash scripts/manual/recapture-manual.sh              # todas las capturas pendientes
bash scripts/manual/recapture-manual.sh --auto-only  # solo las automáticas
bash scripts/manual/recapture-manual.sh --only a.png,b.png
node scripts/manual/recapture-manual.mjs --list      # ver el inventario
```

El script comprueba rama, fichero de entorno y que la app responde; captura en `docs/manual/screenshots/`, deja un registro en `tmp/manual-recapture-log.json` y regenera el documento con:

```bash
node scripts/generate-manual-pdf.mjs
```

Documentos que se regeneran: `public/manuals/anclora-shiftimport-manual-usuario-es.pdf`.

Tras revisar capturas y documento: actualiza `status` a `CURRENT` en el manifiesto para las pantallas recapturadas, registra el cambio en el changelog del manual si existe y haz commit en `development`.

## Pantallas

| Archivo | Estado | Modo | Rol | Ruta inicial | Qué capturar |
| --- | --- | --- | --- | --- | --- |
| `logo.png` | STATIC | static | - | — | Logo Premium de portada (ya actualizado). |
| `hero-dark.png` | STALE | assisted | guest | / | Página de inicio: Empezar gratis abre el recorrido de acceso a ShiftImport (sección «1. Empieza aquí») |
| `login-dark.png` | STALE | auto | guest | /login | Inicio de sesión: utiliza el correo con el que te han concedido acceso (sección «Entrar con una cuenta existente») |
| `guest-empty-calendar-dark.png` | STALE | assisted | guest | / | Calendario de invitado: un espacio local vacío no significa que se hayan perdido datos de una cuenta (sección «Probar sin cuenta») |
| `signup-dark.png` | STALE | auto | guest | /signup | Registro: comprueba el correo y repite la misma contraseña antes de crear la cuenta (sección «Crear tu propia cuenta») |
| `onboarding-choice-dark.png` | STALE | assisted | guest | / | Bienvenida: elige el plan de uso antes de configurar la organización (sección «Preparar una organización sin complicarla») |
| `calendar-month-dark.png` | STALE | auto | admin | /app | Calendario con navegación completa: comprueba organización, rol, empleado y área antes de actuar (sección «4. Reconocer la navegación y elegir la tarea correcta») |
| `sidebar-collapsed-dark.png` | STALE | assisted | admin | /app | Navegación contraída: los iconos liberan espacio; Expandir navegación recupera los nombres (sección «Moverte sin perder el contexto») |
| `calendar-mobile-dark.png` | STALE | assisted | employee | /app | Calendario en móvil: la tarjeta superior resume totales de mes y año legibles sin desplazamiento forzado (sección «Entender los resúmenes (escritorio y móvil)») |
| `manual-create-dark.png` | STALE | assisted | admin | /app | Alta manual: una fecha pasada y su horario, listos para confirmar (sección «Añadir un turno que falta») |
| `import-upload-dark.png` | STALE | assisted | employee | /app | Importador individual: configura el periodo y el destino antes de seleccionar el archivo (sección «8. Elegir el archivo y analizarlo») |
| `import-file-selected-dark.png` | STALE | assisted | employee | /app | Archivo seleccionado: comprueba su nombre antes de pulsar Procesar archivo (sección «8. Elegir el archivo y analizarlo») |
| `import-processing-dark.png` | STALE | assisted | employee | /app | Análisis en curso: espera a que termine antes de revisar los turnos detectados (sección «Mientras se analiza») |
| `employee-matching-dark.png` | STALE | assisted | employee | /app | Asistente de identidad: elige únicamente la fila que corresponde a la persona destinataria (sección «Elegir la fila correcta») |
| `import-assistant-dark.png` | STALE | assisted | employee | /app | El asistente pregunta por texto no interpretado: no lo clasifiques como trabajo sin comprobar la leyenda (sección «Enseñar un código desconocido») |
| `import-preview-dark.png` | STALE | assisted | employee | /app | Vista previa individual: las fechas, tipos y horas se revisan antes de confirmar (sección «10. Revisar, editar y quitar filas antes de guardar») |
| `preview-edit-dark.png` | STALE | assisted | admin | /app | Corrección en la vista previa: cambia una hora y vuelve a comparar la fila con el documento (sección «10. Revisar, editar y quitar filas antes de guardar») |
| `preview-delete-dark.png` | STALE | assisted | admin | /app | Fila retirada de la vista previa: comprueba que el total se ha reducido antes de continuar (sección «10. Revisar, editar y quitar filas antes de guardar») |
| `import-unsupported-dark.png` | STALE | assisted | employee | /app | Archivo sin turnos utilizables: lee el diagnóstico y corrige el documento antes de reintentar (sección «Leer el aviso antes de actuar») |
| `future-decision-dark.png` | STALE | assisted | admin | /app | Decisión sobre fechas futuras: crear borradores no publica los turnos automáticamente (sección «Decidir qué hacer con hoy y el futuro») |
| `team-import-dark.png` | STALE | assisted | admin | /app | Cuadrante de equipo: revisa a quién corresponde cada grupo de turnos antes de seleccionarlo (sección «13. Importar un cuadrante de equipo») |
| `team-preview-dark.png` | STALE | assisted | admin | /app | Resumen de equipo: compara turnos nuevos, conflictos y errores antes de pulsar Importar (sección «13. Importar un cuadrante de equipo») |
| `import-success-dark.png` | STALE | assisted | employee | /app | Resultado de equipo: comprueba empleados procesados, turnos creados y errores antes de cerrar (sección «13. Importar un cuadrante de equipo») |
| `format-profiles-dark.png` | STALE | assisted | admin | /app | Formatos aprendidos: nombre, versión, estado y usos ayudan a reconocer la plantilla (sección «Enseñar y reutilizar») |
| `format-history-dark.png` | STALE | assisted | admin | /app | Versiones de un formato: la anterior permanece diferenciada de la plantilla vigente (sección «Administrar la biblioteca») |
| `format-rename-dark.png` | STALE | assisted | admin | /app | Renombrar un formato: elige una etiqueta que describa la plantilla sin incluir datos de personas (sección «Administrar la biblioteca») |
| `history-dark.png` | STALE | assisted | admin | /app | Historial: la fila combina origen, periodo, responsable, recuentos y estado de la carga (sección «15. Consultar el historial de importaciones») |
| `history-filters-dark.png` | STALE | assisted | admin | /app | Filtro del historial: elegir un estado permite localizar cargas que necesitan atención (sección «Filtrar sin perder resultados») |
| `history-delete-dark.png` | STALE | assisted | admin | /app | Confirmación de borrado: verifica qué importación vas a retirar antes de aceptar (sección «16. Eliminar una importación sin restablecer la organización») |
| `history-deleted-dark.png` | STALE | assisted | admin | /app | Importación eliminada: la fila permanece visible para saber qué ocurrió (sección «16. Eliminar una importación sin restablecer la organización») |
| `planner-dark.png` | STALE | assisted | admin | /app | Planificador semanal: cada fila representa un empleado y cada columna un día (sección «17. Preparar una semana en el Planificador») |
| `planner-responsive-dark.png` | STALE | assisted | admin | /app | Planificador en vista estrecha: el indicador superior avisa del contenido adicional y permite el desplazamiento accesible (sección «Consultar los siete días en pantallas estrechas») |
| `planner-assignment-dark.png` | STALE | assisted | admin | /app | Editor del borrador: comprueba la persona y la fecha antes de guardar el horario (sección «18. Añadir, editar y comprobar turnos del borrador») |
| `publish-confirmation-dark.png` | STALE | assisted | admin | /app | Publicación: el diálogo explica que los turnos pasarán al calendario y el borrador dejará de ser editable (sección «Publicar la semana») |
| `planner-published-dark.png` | STALE | assisted | admin | /app | Versión publicada: Solo lectura indica que esa versión ya no admite cambios directos (sección «Publicar la semana») |
| `planner-history-dark.png` | STALE | assisted | admin | /app | Historial de planificación: comprueba qué versión está publicada antes de tomarla como referencia (sección «Consultar versiones») |
| `employee-calendar-dark.png` | STALE | auto | employee | /app | Espacio actual del empleado: calendario personal, importación propia, turnos pasados y solicitudes (sección «Tu primer acceso») |
| `employee-detail-dark.png` | STALE | assisted | employee | /app | Detalle del turno del empleado: fecha, horario y botón para confirmar la recepción del turno publicado (sección «Cómo confirmar la recepción de tu turno») |
| `request-new-dark.png` | STALE | assisted | employee | /app | Nueva solicitud: selecciona el turno afectado y explica el cambio que necesitas (sección «Enviar tu solicitud») |
| `request-pending-dark.png` | STALE | assisted | employee | /app | Solicitudes del empleado: revisa el estado antes de enviar otra petición sobre el mismo turno (sección «Consultar o cancelar») |
| `requests-dark.png` | STALE | assisted | admin | /app | Bandeja del gestor: compara el turno afectado y la petición antes de tomar una decisión (sección «Resolver una solicitud como gestor») |
| `request-reject-dark.png` | STALE | assisted | admin | /app | Rechazar una solicitud: explica el motivo antes de confirmar la resolución (sección «Resolver una solicitud como gestor») |
| `equipo-personas-dark.png` | STALE | assisted | admin | /app | Personas: la barra de herramientas reúne búsqueda, filtros, Añadir persona e Importar CSV (sección «Añadir una persona o varias») |
| `team-add-person-dark.png` | STALE | assisted | admin | /app | Añadir persona: empieza por la identidad y revisa después acceso, empleo y permisos (sección «Añadir una persona o varias») |
| `equipo-roles-dark.png` | STALE | assisted | admin | /app | Roles y acceso: revisa la autoridad y el ámbito sin confundirlos con la ficha de empleado (sección «Cambiar un rol o el alcance de un planificador») |
| `planner-scope-dark.png` | STALE | assisted | admin | /app | Ámbito del planificador: selecciona las áreas o personas que realmente debe gestionar (sección «Cambiar un rol o el alcance de un planificador») |
| `equipo-areas-dark.png` | STALE | assisted | admin | /app | Áreas: comprueba su estado y utiliza Gestionar asignaciones para revisar las personas asociadas (sección «Crear o modificar un área») |
| `equipo-asignaciones-dark.png` | STALE | assisted | admin | /app | Asignaciones: revisa personas seleccionadas, destino y fecha de entrada en vigor (sección «Mover varias personas a un área») |
| `ownership-transfer-dark.png` | STALE | assisted | admin | /app | Transferencia de propiedad: revisa al nuevo titular y tu rol posterior antes de confirmar (sección «Transferir la propiedad») |
| `bulk-employees-dark.png` | STALE | assisted | admin | /app | Alta masiva de empleados: comprueba identificador, nombre y estado de cada fila (sección «Primero: importar fichas de empleados») |
| `bulk-users-dark.png` | STALE | assisted | admin | /app | Alta masiva de usuarios: el correo da acceso y el identificador enlaza con la ficha existente (sección «Después: importar accesos de usuarios») |
| `bulk-errors-dark.png` | STALE | assisted | admin | /app | Vista previa con errores: una fila errónea necesita corrección antes de considerarla dada de alta (sección «Después: importar accesos de usuarios») |
| `credentials-dark.png` | STALE | assisted | admin | /app | Resultado del alta: descarga antes de cerrar; los valores de contraseña están ocultos en esta captura (sección «25. Seguridad de las invitaciones CSV») |
| `settings-profile-dark.png` | STALE | assisted | admin | /app | Perfil: revisa los datos personales y los identificadores que ayudan a reconocer tu cuadrante (sección «Ajustar tu perfil») |
| `settings-shifttypes-dark.png` | STALE | assisted | admin | /app | Tipos de turno: el color y Cuenta como trabajo cumplen funciones distintas (sección «Crear y mantener tipos de turno») |
| `pricing-dark.png` | STALE | auto | guest | /pricing | Planes: revisa el alcance de la modalidad elegida y la información vigente de la página (sección «Qué cambia según el plan») |
| `cookies-dark.png` | STALE | assisted | guest | / | Cookies: puedes rechazar las opcionales o revisar la configuración antes de decidir (sección «Cookies y documentos») |
