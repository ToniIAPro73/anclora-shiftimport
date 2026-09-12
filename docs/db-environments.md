# Entornos de base de datos (Neon) — cómo no confundirlos

La aplicación utiliza actualmente una única rama Neon compartida por todos
los entornos: `main` (`br-solitary-thunder-b1hm9low`). Las pruebas deben aislar
sus datos por `organization_id`; nunca deben usar el tenant operativo.

## Identificadores no sensibles por entorno

Estos valores **no son secretos** (no permiten conectar sin usuario+password)
y sirven para reconocer de un vistazo a qué entorno pertenece una connection
string, sin necesidad de leer ni imprimir la contraseña:

| Entorno | Neon project id | Host (prefijo) | Origen |
| --- | --- | --- | --- |
| Todos los entornos | `holy-cake-85660318` | `ep-lingering-dew-...` | `.env.local` local y variables de Vercel; comparar siempre el fingerprint seguro |

Si el host no coincide con el fingerprint de `main`, detén el diagnóstico y
verifica el origen antes de consultar datos funcionales.

## Procedimiento antes de tratar una connection string como "producción"

1. Comprueba que el host corresponde al fingerprint de Neon `main` y que el
   proyecto es `holy-cake-85660318`; no imprimas la cadena completa.
2. Ejecuta primero `npm run db:migrate:status` y confirma el branch ID
   `br-solitary-thunder-b1hm9low` antes de cualquier query funcional.
3. `vercel env pull --environment=production` normalmente **no sirve** para
   obtener esta cadena: Vercel marca `DATABASE_URL`/`POSTGRES_URL` como
   variables "sensitive" y el pull devuelve un placeholder corto (~11
   caracteres), no el valor real. No lo interpretes como "ya tengo la
   cadena real" sin comprobar su longitud/validez como URL.
4. `Groundforce` es el tenant operativo observado en main y queda fuera de
   pruebas. Si el nombre `Anclora Group` aparece en main, se protege del mismo
   modo; nunca se selecciona una organización por posición o nombre parcial.
5. Nunca imprimas la connection string completa ni la contraseña en salidas
   de terminal, logs o ficheros commiteados. Los scripts de diagnóstico
   deben leer la URL de una variable de entorno pasada inline al comando
   (nunca guardada en un fichero dentro del repo fuera de `tmp/`, que está
   en `.gitignore`) y solo imprimir resultados de queries, nunca la propia
   cadena.

## Runbook rápido para un diagnóstico contra producción

```bash
# 1. Verifica proyecto, rama y ledger con el comando de estado read-only.
# 2. Ejecuta el diagnóstico usando `.env.local`; nunca imprimas la URL ni la guardes en Git.
node tmp/algun-script-de-diagnostico.mjs
```
