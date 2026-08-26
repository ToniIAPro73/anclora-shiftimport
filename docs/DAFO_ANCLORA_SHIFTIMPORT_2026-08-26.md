# Análisis DAFO — Anclora ShiftImport

**Fecha del documento:** 2026-08-26  
**Repositorio:** `anclora-shiftimport`  
**Commit HEAD:** `7fde8bc4bf2e458c652073af37d9070b6622c19b`  
**Estado del árbol de trabajo:** Limpio (Clean)  
**Adopción AOS:** Versión 0.2.0 (Gobernanza Nivel 3 — Autoridad local de producto, excepción `EX-SI-001`)  
**Clasificación de producto:** Premium B2C / Prosumer & B2B Team SaaS  
**Documento canónico:** `docs/DAFO_ANCLORA_SHIFTIMPORT_2026-08-26.md`  

---

## Resumen ejecutivo

**Anclora ShiftImport** es una solución de software orientada a solventar una fricción crítica y recurrente en el ámbito laboral de trabajadores por turnos y supervisores de equipos: la ingesta, interpretación y estructuración automatizada de cuadrantes laborales altamente heterogéneos y no estandarizados (documentos PDF vectoriales y escaneados, imágenes, hojas de cálculo XLSX, archivos CSV y futuros formatos JSON/XML) para transformarlos en un calendario interactivo, editable, auditable y sincronizable.

Originado como derivado comercial de `anclora-groundsync` (preservando su historia Git y manteniendo GroundSync como producto independiente), ShiftImport ha completado su transición de prototipo local a una plataforma **multi-tenant robusta** con backend serverless en Vercel (`api/`) y PostgreSQL serverless en Neon (`db/migrations/`). La arquitectura preserva el principio *local-first*, permitiendo el uso completo como invitado en `localStorage` con migración opcional e idempotente a la nube tras la creación de cuenta.

El presente análisis DAFO (Debilidades, Amenazas, Fortalezas, Oportunidades) ofrece una evaluación rigurosa y exhaustiva del estado técnico y estratégico del proyecto al commit `7fde8bc4bf2e458c652073af37d9070b6622c19b`. Todos los hallazgos se categorizan formalmente como **[CONFIRMADO]** (respaldado por código fuente, tests unitarios y de integración, migraciones SQL, esquemas y documentación contractual del repositorio) o **[INFERIDO]** (deducción analítica basada en dinámicas de mercado, sector laboral y proyecciones de producto).

*Nota de validación técnica:* Conforme a las normas de gobernanza AOS, las comprobaciones automáticas de linting, tipado estático y pruebas (`repo.test`, `repo.lint`, `repo.typecheck`) son ejecutadas de manera independiente por los mecanismos de pipeline de AOS. Los hallazgos recogidos en este informe documentan la estructura estática, evidencias de código y suites de pruebas presentes en el repositorio sin invocar scripts de validación durante esta sesión.

---

## Fortalezas

### F1. Arquitectura de Ingesta Modular y Pipeline Posicional Puro [CONFIRMADO]
- **Representación Intermedia Universal (`PdfTextItem[]`):** Todos los extractores de entrada proyectan el contenido hacia un array posicional común (`src/ingestion/core/text-items.ts`), desacoplando la capa de parsing físico de la lógica de negocio.
- **Core de Detección Geométrico:** Módulos funcionales puros e independientes (`clustering.ts`, `row-detection.ts`, `day-columns.ts`, `shift-builder.ts`, `shift-code-profile.ts`, `tokens.ts`, `normalize.ts`) capaces de agrupar tokens por proximidad espacial, reconstruir líneas de turno y asociar días a columnas con alta precisión.
- **Perfiles Declarativos:** Soporte para tipologías de documentos (`TYPE_A`, `TYPE_B`, `TYPE_TAB`, `TYPE_LEGEND`, `TYPE_MULTI`) en `src/ingestion/profiles/`, permitiendo extender nuevos formatos sin modificar el motor de cálculo.

### F2. Diagnósticos Canónicos y Calidad de Ingesta sin Fallos Silenciosos [CONFIRMADO]
- **Modelo de Estados Canónicos (Phase 1B):** En `src/ingestion/diagnostics.ts`, la importación se rige por estados estrictos (`READY`, `NEEDS_USER_INPUT`, `PARTIAL`, `BLOCKED`, `UNSUPPORTED`, `FAILED`), impidiendo que la interfaz consuma excepciones crudas.
- **Garantías Contractuales:** Cero turnos detectados nunca se cataloga como correcto; los códigos desconocidos no se descartan silenciosamente sino que generan un diagnóstico bloqueante con recuperación guiada (`UNKNOWN_SHIFT_CODES`); y las discrepancias de mes/año (`MONTH_MISMATCH`) bloquean la importación hasta confirmación explícita del usuario.
- **Asistente de Aprendizaje Interactivo:** `assistant.ts`, `tabular-assistant.ts` y `ProfileAssistantPanel.tsx` permiten resolver ambigüedades en tiempo de ejecución generando perfiles aprendidos (`UserFormatProfile`) que representan configuración reversible y auditable mediante hashes estructurales FNV-1a (sin PII), nunca mutaciones de código.

### F3. Seguridad Multi-Tenant y Aislamiento Estricto en Backend [CONFIRMADO]
- **Aislamiento a Nivel de Datos (`api/_lib/data.js`):** Todas las consultas e inserciones fuerzan el `organization_id` resuelto desde la sesión criptográfica del usuario (`api/_lib/auth.js`). Ningún identificador de organización o empleado enviado por el cliente es aceptado sin validación estricta de pertenencia.
- **Invariante de Dominio:** Ningún registro de turno (`Shift`) puede persistirse sin `organization_id` y `employee_id` (claves foráneas no nulas y checks en base de datos).
- **Autenticación Robusta:** Cookies `httpOnly` seguras con hash SHA-256 de tokens criptográficos (128 bytes de entropía), contraseñas procesadas con `scrypt` y comparaciones temporales constantes (`timingSafeEqual`).
- **Control de Roles y Gobernanza de Acceso:** Roles delimitados (`ADMIN`, `EMPLOYEE`), protección del último administrador contra auto-eliminación o degradación, y reseteo transaccional de datos operativos (`api/organizations/reset.js`).

### F4. Rate Limiting Distribuido Respaldado en Base de Datos [CONFIRMADO]
- **Persistencia en Neon (`login_attempts`):** En `api/_lib/rate-limit.js` y la migración `0003_login_attempts.sql`, los intentos fallidos de inicio de sesión se registran de forma distribuida en PostgreSQL, superando las limitaciones de contadores en memoria volátiles entre instancias serverless independientes.

### F5. Flexibilidad Organizativa y Modelo de Áreas Opcional [CONFIRMADO]
- **Opcionalidad de Áreas:** En `docs/product/APPLICATION_STRUCTURE_AREAS_OPTIONAL.md` y la migración `0008_areas_optional.sql`, la plataforma admite tanto organizaciones simples/personales (sin áreas) como organizaciones con múltiples áreas operativas (Operaciones, Administración, etc.) sin imponer sobrecarga conceptual ni pasos forzados en la UI.
- **Importación Multi-Empleado y de Equipos:** `TeamImportModal.tsx`, `team-roster.ts` y `pdf-team-import.ts` admiten la carga masiva y concurrente de cuadrantes para múltiples empleados a partir de un único archivo CSV o PDF roster.

### F6. Dualidad Local-First y Sincronización Remota Segura [CONFIRMADO]
- **Modo Invitado 100% Funcional:** Operatividad completa sin registro mediante `localStorage` (`anclora_shifts_v1`), manteniendo la privacidad total por defecto.
- **Migración Unidireccional No Destructiva (`LocalMigrationModal.tsx`):** Al iniciar sesión, el usuario puede migrar sus turnos locales a la nube de forma explícita e idempotente sin destruir la copia local.
- **Deduplicación Semántica:** Detección de colisiones mediante fingerprinting (`import-dedup.ts`, `import-reconciliation.ts`), evitando duplicidades al reimportar cuadrantes.

### F7. Cumplimiento de Contratos de Ecosistema, Calidad y Cobertura de Tests [CONFIRMADO]
- **Gobernanza AOS y Contratos de Marca:** Integración de estándares canónicos de UI/UX (`docs/standards/`: `ANCLORA_AUTH_LOGIN_SCREEN_CONTRACT`, `MODAL_CONTRACT`, `UI_MOTION_CONTRACT`, `COOKIES_CONSENT_CONTRACT`, `ANCLORA_PREMIUM_APP_CONTRACT`).
- **Cumplimiento Legal y Privacidad:** Documentos completos de Términos, Privacidad y Aviso Legal en `LegalPage.tsx`, junto con banner y configuración de cookies (`CookieConsent.tsx`) y borrado total de datos locales (`resetAllLocalData`).
- **Internacionalización Integral:** Soporte bilingüe (`es`/`en`) gobernado por `src/lib/i18n.ts` (más de 1.500 líneas con namespace estructurado) respaldado por pruebas de cobertura completa (`i18n-coverage.test.ts`).
- **Extensa Batería de Pruebas:** 73 suites de test en el repositorio (63 en `src/`, 9 en `api/`, 1 en `db/`), incluyendo el corpus de aceptación manifest-driven `acceptance-corpus.test.ts` con fixtures adversariales y de estrés, complementadas con tests E2E Playwright en `qa/e2e-acceptance/`.

---

## Debilidades

### D1. Ausencia de Pasarela de Pagos Real (Stripe / Billing) [CONFIRMADO]
- **Estado Pre-Facturación:** Según `docs/pricing-hypothesis.md`, no existe integración con Stripe ni ningún procesador de pagos. No hay webhooks, ciclo de vida de suscripción ni cobro automatizado.
- **Concesión de Prueba No Expirable:** Las organizaciones de tipo `company` reciben un plan `team` como "trial grant" permanente sin temporizador de expiración ni degradación automática a plan inferior.
- **Límites Medidos No Aplicados:** Las cuotas de volumen mensual (`maxMonthlyImports`) están definidas en el modelo de planes (`api/_lib/plans.js`), pero no se aplican activamente en los endpoints de importación.

### D2. Fragilidad en Soporte de Formatos Tabulares Complejos (XLSX, JSON/XML) [CONFIRMADO]
- **XLSX Parcial:** El extractor de Excel (`src/ingestion/parsers/file.ts` vía ExcelJS) solo procesa la primera hoja y proyecta celdas a coordenadas posicionales perdiendo relaciones semánticas de cabeceras; calificado como `PARTIAL` y causante de fallos (`MALFORMED_INPUT`) en fixtures complejos como GS-04 y GS-05 en `acceptance-corpus.test.ts`.
- **Inexistencia de Parsers JSON y XML en Producción:** A pesar de estar especificados en la arquitectura objetivo (`sdd/features/multi-format-ingestion/architecture-multi-format-ingestion-spec-v1.md`), aún no se encuentran implementados en el pipeline activo.

### D3. Ejecución de OCR en el Navegador del Cliente [CONFIRMADO]
- **Limitaciones de Tesseract.js en Frontend:** El OCR se ejecuta exclusivamente en el hilo del navegador (`spa`), lo que genera degradación de rendimiento y alto consumo de memoria en dispositivos móviles, además de fallar ante rotaciones severas, bajos contrastes o perspectivas forzadas (marcado como `OCR_NOT_RUN_NODE` en suites de Node).
- **Desconexión del Prototipo VLM:** Las soluciones de visión multimodal (Forge API / Ollama con Gemini / Qwen2-VL) documentadas en `src/estrategia.md` y `server.mjs`/`proxy-server.mjs` permanecen como scripts/servidores legacy aislados sin integración nativa en la API serverless de producción.

### D4. Deuda Técnica y Residuos de Genesis [CONFIRMADO]
- **Archivos Legacy en la Raíz:** Presencia de servidores Express obsoletos (`server.mjs`, `server-export.mjs`, `proxy-server.mjs`, `.tmp-pdf-parser.mjs`) que no forman parte del flujo serverless multi-tenant actual.
- **Perfiles de Formato No Sincronizados:** Los `UserFormatProfile` aprendidos por el asistente se almacenan exclusivamente en el `localStorage` del cliente; no se sincronizan con la base de datos de la organización ni con un registro global (`architecture-multi-format-ingestion-spec-v1.md`).
- **Discrepancia Documental Menor:** `README.md` indica textualmente que la app opera únicamente en español, contradiciendo la implementación completa de `src/lib/i18n.ts` con selector `es`/`en`.

### D5. Brecha en Infraestructura de Email Transaccional [CONFIRMADO]
- **Sin Proveedor de Email Transaccional:** Los flujos de invitación de usuarios (`api/memberships/index.js`) y recuperación de contraseñas (`api/auth/request-reset.js`) generan tokens criptográficos en base de datos pero carecen de servicio de envío por correo electrónico (el enlace de recuperación se imprime por consola de servidor y las altas de usuarios requieren entrega de credenciales fuera de banda).

---

## Oportunidades

### O1. Captura de Demanda B2B en PYMEs y Sectores con Turnicidad [CONFIRMADO / INFERIDO]
- **Demanda Insatisfecha [INFERIDO]:** Millones de trabajadores en sanidad, hostelería, seguridad, emergencias y logística reciben cuadrantes en formatos no estandarizados (PDFs escaneados, imágenes o Excels complejos) y carecen de herramientas para consolidarlos en sus calendarios cotidianos.
- **Preparación de Producto [CONFIRMADO]:** La arquitectura ya soporta roles (`ADMIN`, `EMPLOYEE`), áreas opcionales, importación de equipos (`TeamImportModal`) y selector multi-empleado, posicionando a ShiftImport como una solución ágil para supervisores y mandos intermedios sin necesidad de implantar un ERP pesado.

### O2. Creación del Registro Global de Formatos ("Network Effect") [CONFIRMADO / INFERIDO]
- **Diseño Arquitectónico Listo [CONFIRMADO]:** En `sdd/features/multi-format-ingestion/architecture-multi-format-ingestion-spec-v1.md`, se define el *Global Format Registry* estructurado sobre hashes FNV-1a anonimizados sin PII.
- **Efecto de Red [INFERIDO]:** Cuando un usuario enseña a la plataforma a interpretar el cuadrante de un hospital o empresa específica, el patrón aprendido puede verificarse y propagarse globalmente, permitiendo que otros trabajadores de la misma entidad importen sus turnos con 100% de confianza inmediata y cero configuración.

### O3. Monetización Inmediata mediante Pasarela Stripe [CONFIRMADO / INFERIDO]
- **Modelo de Planes ya Codificado [CONFIRMADO]:** El backend ya restringe capacidades mediante `PLANS` (`api/_lib/plans.js`), controlando límites de empleados (`maxEmployees`) e importaciones de equipo (`teamManagement`).
- **Despliegue Rápido de Facturación [INFERIDO]:** Integrar Stripe Checkout, Customer Portal y webhooks permitirá monetizar de forma inmediata tanto el segmento B2C (Personal a 4,99 €/mes) como el B2B (Team desde 19 €/mes).

### O4. Incorporación de VLM / Visión Multimodal Serverless [CONFIRMADO / INFERIDO]
- **Validación Técnica Previa [CONFIRMADO]:** La experimentación documentada en `src/estrategia.md` demuestra que modelos como Qwen2-VL o Gemini 2.5 Flash resuelven la extracción de calendarios complejos con colores y celdas irregulares donde el OCR clásico fracasa.
- **Ventaja Competitiva [INFERIDO]:** Implementar un endpoint serverless con VLM bajo demanda para imágenes de baja calidad dotará a la aplicación de una tasa de éxito cercana al 100% en capturas móviles.

### O5. Integración con Ecosistemas de Calendarios Externos (Google, Apple, Outlook) [INFERIDO]
- **Sincronización de Salida [INFERIDO]:** La generación de enlaces de suscripción `.ics` / Webcal o exportación directa a Google Calendar y Microsoft Outlook incrementará sustancialmente la retención de usuarios y el valor percibido del producto.

---

## Amenazas

### A1. Extrema Variabilidad y Deriva de Plantillas de Cuadrantes [CONFIRMADO / INFERIDO]
- **Inestabilidad de Formatos Fuente [CONFIRMADO]:** Las empresas actualizan periódicamente sus layouts, nomenclaturas de códigos y formatos de exportación, provocando fallos de coincidencia (*drift*).
- **Riesgo de Frustración del Usuario [INFERIDO]:** Si el asistente interactivo requiere excesivos pasos de resolución o falla en plantillas nuevas, el usuario puede percibir el producto como defectuoso.

### A2. Competencia de Apps Gratuitas y Suites Integradas de RRHH [INFERIDO]
- **Apps Móviles Nativas en Tiendas [INFERIDO]:** Existencia de aplicaciones móviles gratuitas o freemium de gestión de turnos que, aunque requieran entrada manual, tienen fuerte posicionamiento de marca en App Store y Google Play.
- **Suites de RRHH (Factorial, Sesame, Workday) [INFERIDO]:** Incorporación progresiva de portales del empleado en plataformas corporativas que ofrecen calendarios de turnos dentro de su propia app, reduciendo la necesidad de un importador si la empresa centraliza el flujo.

### A3. Escalabilidad de Costes en Inferencia y Procesamiento Serverless [CONFIRMADO / INFERIDO]
- **Coste de Visión e Ingesta Pesada [INFERIDO]:** Si se incorporan modelos VLM en la nube o procesamiento de PDFs masivos sin controles de cuota estrictos en planes gratuitos, el coste unitario por importación podría erosionar el margen operativo.

### A4. Riesgos de Privacidad, PII y Cumplimiento Normativo (RGPD) [CONFIRMADO]
- **Sensibilidad de los Datos de Entrada [CONFIRMADO]:** Los cuadrantes contienen identificadores de personal, números de nómina y datos sensibles de salud (ej. bajas médicas `BAJA` o ausencias).
- **Exigencia de Cumplimiento Continuo [CONFIRMADO]:** Cualquier filtración o almacenamiento indebido de documentos originales violaría la estricta política de privacidad de Anclora Group y la normativa europea.

---

## Matriz DAFO

### Matriz DAFO Sintética

| Factores | **Aspectos Positivos (Para potenciar)** | **Aspectos Negativos (Para mitigar)** |
|:---|:---|:---|
| **Factores Internos (Controlables)** | **FORTALEZAS (F)**<br>• **F1:** Pipeline modular puro con IR universal `PdfTextItem[]` [CONFIRMADO]<br>• **F2:** Diagnósticos canónicos, sin fallos silenciosos y asistente adaptativo [CONFIRMADO]<br>• **F3:** Aislamiento multi-tenant estricto en DB/API y seguridad robusta [CONFIRMADO]<br>• **F4:** Rate limiting distribuido en PostgreSQL Neon (`login_attempts`) [CONFIRMADO]<br>• **F5:** Arquitectura de áreas opcional y soporte multi-empleado [CONFIRMADO]<br>• **F6:** Modo invitado local-first con migración idempotente [CONFIRMADO]<br>• **F7:** Estándares AOS, compliance legal RGPD, i18n total y 73 suites de tests [CONFIRMADO] | **DEBILIDADES (D)**<br>• **D1:** Inexistencia de pasarela de pago real (Stripe/Billing pendiente) [CONFIRMADO]<br>• **D2:** Extractor XLSX parcial y falta de parsers JSON/XML [CONFIRMADO]<br>• **D3:** OCR dependiente del cliente (Tesseract.js) y VLM no integrado en serverless [CONFIRMADO]<br>• **D4:** Archivos de servidor legacy en raíz y perfiles aprendidos solo en localStorage [CONFIRMADO]<br>• **D5:** Ausencia de servicio de email transaccional (links en consola) [CONFIRMADO] |
| **Factores Externos (Entorno / Mercado)** | **OPORTUNIDADES (O)**<br>• **O1:** Expansión en mercado B2B para supervisores y equipos sin ERP [CONFIRMADO / INFERIDO]<br>• **O2:** Red de aprendizaje con *Global Format Registry* [CONFIRMADO / INFERIDO]<br>• **O3:** Activación de monetización SaaS inmediata sobre arquitectura de planes lista [CONFIRMADO / INFERIDO]<br>• **O4:** Integración de VLM (Gemini/Qwen) como fallback serverless de alta precisión [CONFIRMADO / INFERIDO]<br>• **O5:** Sincronización externa con Google Calendar, Apple y Outlook vía iCal [INFERIDO] | **AMENAZAS (A)**<br>• **A1:** Alta heterogeneidad y cambios arbitrarios en plantillas de cuadrantes [CONFIRMADO / INFERIDO]<br>• **A2:** Competencia de apps de turnos en app stores y suites de RRHH [INFERIDO]<br>• **A3:** Coste operativo de cómputo/IA en planes gratuitos si no se cuotan [CONFIRMADO / INFERIDO]<br>• **A4:** Riesgos de protección de datos (RGPD) ante PII en cuadrantes [CONFIRMADO] |

---

### Estrategias Cruzadas (Matriz CAME)

#### 1. Estrategias Ofensivas (FO: Fortalezas + Oportunidades) — Explotar
- **Lanzamiento Comercial B2B / Equipos (F3, F5, O1, O3):** Aprovechar la arquitectura multi-tenant, la gestión de áreas y el `TeamImportModal` para comercializar activamente el plan *Team*, ofreciendo a empresas medianas una solución inmediata de digitalización de cuadrantes.
- **Despliegue del Registro Global de Formatos (F1, F2, O2):** Migrar los perfiles aprendidos del `localStorage` al backend para consolidar un repositorio global anonimizado que reduzca a cero la fricción de nuevos usuarios.
- **Exportación Universal a Calendarios Personales (F6, O5):** Habilitar suscripción WebCal / `.ics` para que los turnos calculados sincronicen automáticamente en iOS, Android y Google Calendar.

#### 2. Estrategias Defensivas (FA: Fortalezas + Amenazas) — Mantener
- **Robustez ante Deriva de Formatos (F1, F2, A1):** Mantener y ampliar el corpus de aceptación sintético con más casos de estrés y consolidar el bucle de diagnóstico para que ante cualquier cambio de plantilla el usuario reciba una guía clara y nunca datos erróneos.
- **Blindaje de Privacidad Zero-PII (F3, F7, A4):** Mantener la política de que el archivo importado original nunca se persista y que los diagnósticos y firmas de formato solo procesen patrones estructurales y tokens temporales, garantizando cumplimiento estricto del RGPD.
- **Diferenciación frente a Suites de RRHH (F1, F6, A2):** Posicionar ShiftImport como la herramienta personal definitiva orientada al trabajador (*prosumer*), que funciona con cualquier cuadrante sin depender de que la empresa cambie de software.

#### 3. Estrategias de Reorientación (DO: Debilidades + Oportunidades) — Corregir
- **Integración de Pasarela de Pagos Stripe (D1, O3):** Conectar Stripe Checkout y Customer Portal a los endpoints de backend existentes (`api/_lib/plans.js`), implementando expiración real de periodos de prueba y facturación automatizada.
- **Evolución del Pipeline Multi-Formato a Fase 2/4/5 (D2, O2):** Ejecutar las fases de la spec `architecture-multi-format-ingestion-spec-v1.md`: implementar soporte completo XLSX multi-hoja, parsers JSON/XML y persistencia server-side de `FormatProfile`.
- **Integración Serverless de Visión VLM (D3, O4):** Complementar Tesseract.js con un endpoint serverless en Vercel que invoque modelos de visión multimodal para cuadrantes en imagen con baja legibilidad.

#### 4. Estrategias de Supervivencia (DA: Debilidades + Amenazas) — Afrontar
- **Saneamiento Definitivo de Código Legacy (D4, A3):** Eliminar o archivar formalmente los servidores Express heredados en raíz (`server.mjs`, `proxy-server.mjs`, `server-export.mjs`, `.tmp-pdf-parser.mjs`) y consolidar el stack exclusivamente en Vercel Functions + Vite.
- **Infraestructura de Email Transaccional (D5, A4):** Integrar un proveedor de email transaccional (ej. Resend / Postmark) para invitaciones y recuperación de contraseñas seguras.
- **Control Estricto de Cuotas de Procesamiento (D1, A3):** Aplicar en backend los límites mensuales de importaciones (`maxMonthlyImports`) en planes gratuitos para evitar sobrecostes de computación.

---

## Prioridades recomendadas

A partir del análisis DAFO y la matriz CAME, se establece la siguiente hoja de ruta de prioridades ordenadas por impacto estratégico y viabilidad técnica:

| Prioridad | Iniciativa Estratégica | Componentes / Módulos Afectados | Complejidad | Impacto en Negocio | Dependencias Previas |
|:---|:---|:---|:---:|:---:|:---|
| **P1** | **Integración de Pasarela Stripe (Billing & Checkout)** | `api/billing/`, `api/_lib/plans.js`, `src/components/shift-dashboard/UpgradePrompt.tsx`, `docs/pricing-hypothesis.md` | Media | **Crítico:** Desbloquea la monetización y elimina la concesión de prueba no expirable. | Ninguna (modelo de planes ya implementado en DB/API). |
| **P1** | **Persistencia Server-Side de FormatProfiles (Fase 2 Multi-Format)** | `db/migrations/0009_format_profiles.sql`, `api/format-profiles/`, `src/lib/format-profiles.ts` | Media | **Alto:** Permite compartir perfiles en la organización y prepara el *Global Format Registry*. | Migración `0008_areas_optional.sql` ya completada. |
| **P2** | **Refactor de Ingesta XLSX Multi-Hoja y Parsers JSON/XML (Fases 4 y 5)** | `src/ingestion/parsers/file.ts`, `src/ingestion/parsers/xlsx.ts`, `src/ingestion/parsers/json.ts`, `src/ingestion/parsers/xml.ts` | Alta | **Alto:** Resuelve fallos en fixtures GS-04/GS-05 y habilita compatibilidad con sistemas ERP/RRHH. | Contrato `NormalizedShiftRecord` (Fase 1). |
| **P2** | **Integración de Proveedor de Email Transaccional** | `api/auth/request-reset.js`, `api/memberships/index.js`, `api/_lib/email.js` | Baja | **Medio-Alto:** Habilita autoservicio seguro para recuperación de claves e invitaciones B2B. | Proveedor SMTP / API externa (ej. Resend). |
| **P3** | **Endpoint Serverless de Visión VLM para Imágenes Degradadas** | `api/vision/extract.js`, `src/ingestion/parsers/image-vlm.ts`, `src/estrategia.md` | Media | **Alto en Robustez:** Eleva la tasa de éxito en fotos de cuadrantes torcidas o con bajo contraste. | API Key de proveedor multimodal (Gemini / Claude / Qwen). |
| **P3** | **Saneamiento y Depuración de Scripts Legacy en Raíz** | `server.mjs`, `proxy-server.mjs`, `server-export.mjs`, `.tmp-pdf-parser.mjs`, `README.md` | Baja | **Medio:** Reduce la deuda técnica heredada de Genesis y alinea la documentación de idiomas. | Ninguna. |
| **P4** | **Exportación y Sincronización Externa de Calendario (iCal / WebCal)** | `src/lib/calendar-export.ts`, `api/calendar/feed.js`, `src/components/shift-dashboard/` | Media | **Medio:** Aumenta la retención diaria del usuario en Google Calendar y Apple Calendar. | Ninguna. |

---

## Conclusión

El repositorio `anclora-shiftimport` presenta una base de ingeniería madura, modular y rigurosamente tipada. Su motor de ingesta geométrica pura y su sistema de diagnósticos canónicos constituyen ventajas competitivas sólidas frente a alternativas genéricas, garantizando una experiencia de usuario predecible donde los errores nunca se ocultan y los formatos ambiguos se resuelven mediante asistencia interactiva reversible.

La transición hacia una arquitectura multi-tenant con aislamiento forzado en backend, rate limiting distribuido en PostgreSQL y soporte flexible de áreas organizativas dota al producto del soporte técnico necesario para abordar tanto el segmento *prosumer* (B2C) como el mercado de mandos intermedios y pequeñas empresas (B2B).

Las prioridades estratégicas inmediatas deben focalizarse en cerrar la brecha de monetización (integración de Stripe), migrar los perfiles aprendidos a nivel de organización para consolidar el efecto de red del *Global Format Registry*, y robustecer el soporte tabular (XLSX multi-hoja y JSON/XML), transformando la excelencia técnica actual en tracción comercial escalable.
