# Entorno único de base de datos Neon

Anclora ShiftImport utiliza exclusivamente la rama Neon `main` de producción
para todas las ramas Git y todos los entornos de ejecución:

- Proyecto: `holy-cake-85660318`
- Rama: `main`
- Branch ID: `br-shy-smoke-b1lyvv58`
- Endpoint fingerprint: `ep-lingering-dew-...`
- Dominio de aceptación: `https://shiftimport.anclora.com`

No existen ni deben crearse ramas Neon adicionales para ShiftImport. Las
pruebas y validaciones se aíslan mediante organizaciones, usuarios,
external IDs y nombres sintéticos con `runId` único. El teardown debe correr
también ante fallos y demostrar mediante consulta directa que no quedan
residuos. Groundforce (`ecbebcf6-787d-4b0f-be32-d67be64ce3b1`) está protegida
y queda fuera de cualquier fixture.

## Preflight obligatorio

Antes de cualquier consulta o escritura:

1. Ejecutar `npm run db:migrate:status`, que usa el entorno Vercel Development y Neon Production `main`; no usar `.env.local` para el status canónico porque apunta al fallback Docker.
2. Confirmar el proyecto, `main`, el branch ID y el fingerprint seguro.
3. Confirmar mediante `db:migrate:status` que todas las migraciones canónicas están aplicadas, sin pendientes, huecos ni diferencias de checksum. No fijar un recuento histórico en esta guía.
4. Capturar el fingerprint de la organización fuente protegida `ShiftImport` antes de QA con escritura; cualquier escritura QA se limita a `ShiftImport — QA Mirror`. Groundforce queda fuera de los fixtures.
5. No imprimir nunca `DATABASE_URL`, passwords, cookies ni tokens.

El estado de migraciones es solo lectura. No se ejecutan DDL manuales ni se
crean ramas de base de datos. La rama Git (`development`, `staging`,
`production` o `main`) es independiente del único destino Neon `main`.

## Datos sintéticos

El runner Playwright crea una organización `E2E-SHIFT-<runId>`, usuarios
`@e2e.test`, membresías, empleados y turnos únicamente dentro de ese tenant.
Guarda el inventario de UUIDs creados y elimina exactamente esos registros en
el teardown; nunca usa `DELETE ... LIKE` sobre datos ajenos al run.

## Runtime local por defecto y fallback Docker

- **Por defecto** (`npm run dev`): código de `development` + Neon `main` (`neondb`, endpoint `ep-lingering-dew-b1atfd0w`).
  La conexión se obtiene del entorno **Development** de Vercel (`vercel env pull --environment=development`) y se inyecta en un
  directorio temporal; no se usa Docker. Las variables de Preview/Production son sensibles y no se pueden leer.
- **Fallback explícito** (`npm run dev:docker`): PostgreSQL local de Docker (`127.0.0.1:5433`). Los ficheros `.env`,
  `.env.local` y `.env.development.local` del repo apuntan a ese Docker; cualquier script que los lea opera sobre Docker, no sobre Neon.
- Docker no es requisito de QA ni de integración. Las pruebas funcionales y de integración ordinarias se ejecutan con código `development` local, Neon Production `main` y la identidad dedicada en `ShiftImport — QA Mirror`; la organización real `ShiftImport` permanece `READ ONLY`.
- La prueba DB que requiere Docker es un fallback opcional para probar directamente PostgreSQL local. No forma parte de los gates de aceptación de `development`.
- `scripts/qa/*` resuelven siempre la BD canónica (o `QA_DATABASE_URL`) y abortan si el destino no es el endpoint canónico.
- La organización real `ShiftImport` (`a4cf0768-f08d-49e6-bb81-0d3635d58028`) es **READ ONLY** para cualquier agente: toda escritura
  QA va a `ShiftImport — QA Mirror` (clon pseudonimizado, solo 2026).
- Migración `0042_company_plan_revisions_and_import_semantics.sql` aplicada en Neon `main` (aditiva: columnas de `imports` y tabla `company_plan_revisions`).
