<!-- markdownlint-disable MD001 MD013 MD033 MD041 MD060 -->

<div align="center">

<img src="./public/brand/anclora-shiftimport.png" alt="Anclora ShiftImport" width="132" />

# Anclora ShiftImport

### Plataforma B2B/B2B2E de gestión operativa de turnos, con Safe Import como núcleo

Convierte cuadrantes de trabajo existentes (PDF, imagen, Excel/CSV) en datos operativos fiables — organizados por organización, área y empleado — mediante un pipeline de importación segura, revisable y auditable.

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

Anclora ShiftImport es una plataforma B2B/B2B2E para organizaciones que gestionan turnos de trabajo. Su diferencial funcional es **Safe Import**: un motor de ingestión y normalización premium capaz de leer cuadrantes existentes en distintos formatos (PDF, imagen, Excel, CSV) y convertirlos en datos operativos estructurados, sin volver a teclear nada y sin escribir en el sistema hasta que la organización confirma lo que va a importar.

El flujo objetivo del producto es:

```text
importar → revisar → comparar → confirmar
  → (roadmap) planificar → publicar → consultar → confirmar
  → (roadmap) solicitar cambios → aprobar → auditar
```

Hoy están implementadas las cuatro primeras etapas (**importar → revisar → comparar → confirmar**), sobre una capa organizativa multi-tenant ya operativa. Las etapas de planificación futura, portal de empleado y aprobaciones están en roadmap (ver [`docs/roadmap/shiftimport-mvp-v2/`](./docs/roadmap/shiftimport-mvp-v2/)) y **no están implementadas todavía**.

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
- **Roles**: `ADMIN` / `EMPLOYEE` hoy (ver roadmap `R0-M03` / `R2-M06` para el modelo de 4 roles con scopes por organización/área/usuario).
- **Provisioning masivo**: alta de usuarios en lote vía CSV, con credenciales de un solo uso descargables (no persistidas en servidor).
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

Validación: `npm run lint && npm run build`. Ver [`SETUP.md`](./SETUP.md) y [`backend-setup.md`](./backend-setup.md) para configuración de base de datos.

## Privacidad

- El archivo original importado no se persiste.
- Las credenciales de un solo uso generadas en el alta masiva son descargables por el administrador y no se guardan en servidor tras la respuesta.
- Los fixtures de pruebas son sintéticos; no se commitean cuadrantes reales.

## Idiomas soportados

El producto opera en español e inglés, con selector de idioma y paridad de claves verificada por test (`i18n-coverage.test.ts`).

## Roadmap

El roadmap detallado por microfases (R0 a R5, más backlog post-MVP R6-R9) vive en [`docs/roadmap/shiftimport-mvp-v2/`](./docs/roadmap/shiftimport-mvp-v2/), empezando por [`00-BASELINE.md`](./docs/roadmap/shiftimport-mvp-v2/00-BASELINE.md) y [`00-ROADMAP-MASTER.md`](./docs/roadmap/shiftimport-mvp-v2/00-ROADMAP-MASTER.md).

## Documentación y gobernanza

- Contratos de marca y gobernanza: [`docs/standards/`](./docs/standards/)
- Registro canónico del ecosistema: `anclora-vault/00-governance/registry/ecosystem-repos.json`

---

<div align="center">

### Anclora Group

Producto comercial del ecosistema Anclora.

</div>
