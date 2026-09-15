# Entorno único de base de datos Neon

Anclora ShiftImport utiliza exclusivamente la rama Neon `main` de producción
para todas las ramas Git y todos los entornos de ejecución:

- Proyecto: `holy-cake-85660318`
- Rama: `main`
- Branch ID: `br-solitary-thunder-b1hm9low`
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

1. Ejecutar `npm run db:migrate:status`.
2. Confirmar el proyecto, `main`, el branch ID y el fingerprint seguro.
3. Confirmar `39/39` migraciones aplicadas y cero pendientes.
4. Capturar invariantes de Groundforce antes de una prueba con escritura.
5. No imprimir nunca `DATABASE_URL`, passwords, cookies ni tokens.

El estado de migraciones es solo lectura. No se ejecutan DDL manuales ni se
crean ramas de base de datos. La rama Git (`development`, `staging`,
`production` o `main`) es independiente del único destino Neon `main`.

## Datos sintéticos

El runner Playwright crea una organización `E2E-SHIFT-<runId>`, usuarios
`@e2e.test`, membresías, empleados y turnos únicamente dentro de ese tenant.
Guarda el inventario de UUIDs creados y elimina exactamente esos registros en
el teardown; nunca usa `DELETE ... LIKE` sobre datos ajenos al run.
