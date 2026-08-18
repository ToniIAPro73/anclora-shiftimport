<!-- markdownlint-disable MD001 MD013 MD033 MD041 MD060 -->

<div align="center">

<img src="./public/brand/anclora-shiftimport.png" alt="Anclora ShiftImport" width="132" />

# Anclora ShiftImport

### Importador inteligente de cuadrantes para trabajadores por turnos

Convierte cuadrantes de trabajo en PDF, imagen o formatos compatibles en un calendario personal estructurado, revisable y exportable.

**Español** · [English](./README.en.md)

<br />

![Anclora](https://img.shields.io/badge/Anclora-ecosystem-111827)
![Categoría](https://img.shields.io/badge/categoría-Premium-C07860)
![Estado](https://img.shields.io/badge/estado-Phase%200-6AAD49)

</div>

---

> [!IMPORTANT]
> Repositorio privado del ecosistema Anclora. Código comercial: no publicar detalles operativos, credenciales ni lógica sensible fuera de canales autorizados.

## Qué es

Anclora ShiftImport resuelve un problema concreto: el trabajador por turnos recibe un cuadrante creado por otra persona (PDF, imagen u otro formato compatible) y quiere incorporarlo a su calendario personal sin volver a teclear cada turno.

El flujo del producto es:

```text
Importar cuadrante → revisar → calendario
```

La importación es el producto: detecta turnos, los muestra en una vista previa editable y solo escribe en el calendario tras confirmación del usuario.

## Qué no es

ShiftImport no es un HRIS, ni un generador de cuadrantes, ni control horario legal, ni nómina, ni planificación empresarial. Es una herramienta personal (B2C / prosumer) de productividad para trabajadores por turnos.

## Categoría en el ecosistema

| Campo | Valor |
|---|---|
| Categoría | Premium |
| Acento de marca | `#6AAD49` |
| Repositorio canónico | `anclora-shiftimport` |
| Tipo de producto | B2C / Prosumer |
| Dominio | Shift work / productividad personal |
| Origen técnico | Derivado de `anclora-groundsync` (historia Git preservada) |

`anclora-groundsync` permanece operativo como producto independiente; ShiftImport es su derivado comercial.

## Funcionalidades principales

- Importación de cuadrantes desde PDF (PDF.js) con vista previa editable
- Extracción por OCR (Tesseract.js) y Excel (ExcelJS)
- Panel mensual de turnos con alta manual
- Estadísticas e informes en PDF (jsPDF)
- Persistencia local-first (`localStorage`); sincronización cloud desactivada por defecto

## Stack tecnológico

| Área | Tecnología |
|---|---|
| Frontend | React, Vite, TypeScript |
| Datos | PDF.js, ExcelJS, Tesseract.js |
| PDF | jsPDF |
| Persistencia | local-first; backend Express/Neon en saneamiento (Phase 0) |

## Arranque local

```bash
npm install
npm run dev
```

Validación: `npm run lint && npm run build`.

## Privacidad

- Persistencia local-first: los turnos viven en el navegador del usuario por defecto.
- El archivo original importado no se persiste.
- Los fixtures de pruebas son sintéticos; no se commitean cuadrantes reales.

## Idiomas soportados

El producto opera únicamente en español (`lang="es"`, sin selector de idioma). Esta documentación se ofrece también en inglés como cortesía.

## Documentación y gobernanza

- Contratos de marca y gobernanza: [`docs/standards/`](./docs/standards/)
- Registro canónico del ecosistema: `anclora-vault/00-governance/registry/ecosystem-repos.json`

---

<div align="center">

### Anclora Group

Producto comercial del ecosistema Anclora.

</div>
