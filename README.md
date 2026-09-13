<!-- markdownlint-disable MD001 MD013 MD033 MD041 MD060 -->

<div align="center">

<img src="./public/brand/anclora-shiftimport.png" alt="Anclora ShiftImport" width="132" />

# Anclora ShiftImport

### Plataforma dual B2B/B2B2E y B2C de gestión de turnos, con Safe Import como núcleo

Convierte cuadrantes de trabajo existentes (PDF, imagen, Excel/CSV) en datos operativos fiables — organizados por organización, área y empleado en modo multi-tenant B2B, o en calendario individual local-first en modo B2C/invitado — mediante un pipeline de importación segura, revisable y auditable.

**Español** · [English](./README.en.md)

<br />

![Anclora](https://img.shields.io/badge/Anclora-ecosystem-111827)
![Categoría](https://img.shields.io/badge/categoría-Premium-C07860)
![Estado](https://img.shields.io/badge/estado-MVP%20en%20construcción-6AAD49)

</div>

---

> [!IMPORTANT]
> Repositorio privado del ecosistema Anclora. Código comercial: no publicar detalles operativos, credenciales ni lógica sensible fuera de canales autorizados.

## Qué es

Anclora ShiftImport opera en **modo dual**:
1. **B2B / B2B2E para organizaciones**: plataforma multi-tenant para equipos que gestionan cuadrantes y turnos de trabajo por organización, áreas y roles (OWNER, ADMIN, PLANNER, EMPLOYEE).
2. **B2C / Personal local-first**: para trabajadores individuales e invitados que importan su propio cuadrante a un calendario personal persistido en `localStorage` sin fricción de registro previa.

Su diferencial funcional es **Safe Import**: un motor de ingestión y normalización premium capaz de leer cuadrantes existentes en distintos formatos (PDF, imagen, Excel, CSV) y convertirlos en datos operativos estructurados, sin volver a teclear nada y sin escribir en el sistema hasta que el usuario u organización confirma lo que va a importar.

El flujo objetivo del producto es:

```text
importar → revisar → comparar → confirmar
  → planificar → publicar → consultar → confirmar
  → solicitar cambios → aprobar → auditar
```

Las etapas de importación segura, planificación futura, portal de empleado y aprobaciones están implementadas sobre una capa organizativa multi-tenant operativa. La importación sigue requiriendo revisión y confirmación antes de escribir; la planificación futura se publica explícitamente y el portal de empleado permite consultar, confirmar y solicitar cambios.

## Qué no es (todavía)

ShiftImport no pretende ser, en su MVP actual, un ERP, un HRIS completo, una suite WFM corporativa, payroll, un motor BPMN, un sistema avanzado de fichaje ni una plataforma de vigilancia laboral. Estas capacidades quedan documentadas como backlog post-MVP (ver `docs/roadmap/shiftimport-mvp-v2/POST-MVP/`) y no se implementan antes de validar el MVP.

## Categoría en el ecosistema

| Campo | Valor |
|---|---|
| Categoría | Premium |
| Acento de marca | `#6AAD49` |
| Repositorio canónico | `anclora-shiftimport` |
| Tipo de producto | B2B / B2B2E |
| Dominio | Gestión operativa de turnos para organizaciones |
| Origen técnico | Derivado de `anclora-groundsync` (historia Git preservada) |

`anclora-groundsync` permanece operativo como producto independiente; ShiftImport es su derivado comercial.

## Funcionalidades principales (estado actual)

- **Safe Import**: importación de cuadrantes desde PDF (PDF.js), Excel/CSV y detección multiempleado, con etapas de análisis, revisión, comparación y confirmación antes de escribir ningún dato.
- **Formatos aprendidos**: memoria de formato por organización (`format_profiles`) que reconoce estructuras ya vistas y acelera importaciones repetidas.
- **Recuperación de formato desconocido**: flujo asistido cuando un documento no se reconoce automáticamente, con estados explícitos de progreso, bloqueo y error.
- **Historial de importación y borrado seguro**: cada importación queda registrada; el borrado es lógico (auditable), no destructivo.
- **Idempotencia**: reimportar el mismo documento no duplica turnos.
- **Organizaciones multi-tenant**: cada organización aísla sus propios datos, empleados y turnos.
- **Áreas opcionales**: una organización puede subdividirse en áreas, sin ser obligatorio.
- **Ciclo de vida de empleado**: estados `pending_access` / `active` / `inactive`, con vinculación opcional a un usuario con acceso.
- **Roles y scopes**: `OWNER` / `ADMIN` / `PLANNER` / `EMPLOYEE`, con scopes `ORGANIZATION` / `AREA` / `SELF` según el rol y la configuración de la membership.
- **Invitaciones de acceso**: alta individual y masiva mediante enlace seguro; la persona invitada establece su propia contraseña. El CSV de usuarios nunca genera contraseñas temporales y el CSV de empleados reutiliza el bulk tenant-scoped existente.
- **Interfaz en español e inglés**, con tema claro y oscuro.

Ver [`docs/roadmap/shiftimport-mvp-v2/00-BASELINE.md`](./docs/roadmap/shiftimport-mvp-v2/00-BASELINE.md) para el inventario completo de capacidades (DONE / PARTIAL / MISSING) con evidencia en código.

## Stack tecnológico

| Área | Tecnología |
|---|---|
| Frontend | React, Vite, TypeScript |
| Backend | Funciones serverless en Vercel (`api/`), sin servidor Express dedicado en producción |
| Base de datos | PostgreSQL (Neon), SQL directo, migraciones forward-only en `db/migrations/` |
| Ingestión | PDF.js, ExcelJS, motor propio de detección de formato + fallback VLM |
| PDF (informes) | jsPDF |
| Persistencia | Backend Neon/Postgres como fuente de verdad; los datos de turnos y organización se persisten en servidor, no solo en el navegador |

## Arranque local

```bash
npm install
npm run dev
```

`npm run dev` sirve el frontend con Vite. Para ejecutar también las Vercel
Functions localmente, usa `vercel dev` en otra terminal dentro del mismo
repositorio; ambos procesos leen la configuración server-side existente y no
exponen `DATABASE_URL` ni `RESEND_API_KEY` al bundle.

Validación: `npm run lint && npm run build`. El desarrollo local usa la única
base Neon `main` mediante `.env.local` (ignorado por Git); `npm run
db:migrate:status` acredita el ledger sin escribir. Ver [`SETUP.md`](./SETUP.md)
y [`backend-setup.md`](./backend-setup.md) para configuración.

## Privacidad

- El archivo original importado no se persiste.
- Las invitaciones no contienen contraseñas temporales: la persona establece su contraseña al aceptar el enlace.
- Los fixtures de pruebas son sintéticos; no se commitean cuadrantes reales.

## Idiomas soportados

El producto opera en español e inglés, con selector de idioma y paridad de claves verificada por test (`i18n-coverage.test.ts`).

## Roadmap

R0–R5 del MVP v2 están implementados. El programa de verificación y mejoras posterior a la auditoría UX se ejecuta en [`docs/roadmap/ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md`](./docs/roadmap/ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md), con la spec normativa en [`docs/specs/SPEC-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md`](./docs/specs/SPEC-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md). El backlog post-MVP R6–R9 sigue en [`docs/roadmap/shiftimport-mvp-v2/POST-MVP/`](./docs/roadmap/shiftimport-mvp-v2/POST-MVP/).

## Documentación y gobernanza

- Contratos de marca y gobernanza: [`docs/standards/`](./docs/standards/)
- Registro canónico del ecosistema: `anclora-vault/00-governance/registry/ecosystem-repos.json`

---

<div align="center">

### Anclora Group

Producto comercial del ecosistema Anclora.

</div>
