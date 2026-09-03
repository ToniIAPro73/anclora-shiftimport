# Entornos de base de datos (Neon) — cómo no confundirlos

Este repo tiene al menos dos ramas Neon distintas con datos completamente
diferentes. Confundirlas produce diagnósticos falsos (se investiga contra
datos demo/seed pensando que son datos reales de producción, o viceversa).
Ocurrió el 2026-09-03: una sesión de agente recibió una connection string
que resultó ser la de desarrollo, consultó esa base, no encontró al
empleado que el usuario reportaba, y tardó varios turnos en darse cuenta de
que estaba mirando la base equivocada.

## Identificadores no sensibles por entorno

Estos valores **no son secretos** (no permiten conectar sin usuario+password)
y sirven para reconocer de un vistazo a qué entorno pertenece una connection
string, sin necesidad de leer ni imprimir la contraseña:

| Entorno | Neon project id | Host (prefijo) | Origen |
| --- | --- | --- | --- |
| Development (local) | `holy-cake-85660318` | `ep-winter-bird-...` | `.env.development.local` (commiteado localmente, no en git) |
| Production (Vercel) | *(distinto, no fijar aquí un valor que pueda quedar desactualizado)* | `ep-lingering-dew-...` | Vercel Dashboard → Settings → Environment Variables → filtro "Production" |

Si el host de una connection string no coincide con ninguno de los dos
anteriores, no asumas que es producción ni que es dev — pregunta o vuelve a
verificar el origen (Vercel Dashboard, filtrando explícitamente por
"Production", no por "Preview" ni "Development").

## Procedimiento antes de tratar una connection string como "producción"

1. **Nunca la pidas directamente sin más** — pide que la copien desde
   Vercel Dashboard → Settings → Environment Variables → filtrando
   explícitamente por el entorno "Production" (no "Preview"/"Development").
2. Antes de sacar conclusiones de una query, compara el host recibido
   contra `grep POSTGRES_HOST .env.development.local` de este repo (sin
   imprimir la contraseña). Si coincide, **es la base de dev**, no
   producción — aunque el usuario la haya llamado "de producción" de buena
   fe.
3. `vercel env pull --environment=production` normalmente **no sirve** para
   obtener esta cadena: Vercel marca `DATABASE_URL`/`POSTGRES_URL` como
   variables "sensitive" y el pull devuelve un placeholder corto (~11
   caracteres), no el valor real. No lo interpretes como "ya tengo la
   cadena real" sin comprobar su longitud/validez como URL.
4. Si los resultados de una query no cuadran con lo que el usuario describe
   (organización sin el empleado esperado, conteos que no encajan), la
   hipótesis por defecto debe ser "entorno equivocado", no "el dato no
   existe" — vuelve a verificar el origen antes de reportar una conclusión
   negativa.
5. Nunca imprimas la connection string completa ni la contraseña en salidas
   de terminal, logs o ficheros commiteados. Los scripts de diagnóstico
   deben leer la URL de una variable de entorno pasada inline al comando
   (nunca guardada en un fichero dentro del repo fuera de `tmp/`, que está
   en `.gitignore`) y solo imprimir resultados de queries, nunca la propia
   cadena.

## Runbook rápido para un diagnóstico contra producción

```bash
# 1. Pide al usuario la cadena desde Vercel Dashboard -> Production (nunca la asumas).
# 2. Compárala contra la de dev antes de usarla:
grep POSTGRES_HOST .env.development.local
# Si el host no coincide con el de arriba, procede. Si coincide, PARA: es dev.

# 3. Ejecuta el script de diagnóstico pasando la URL inline, nunca en fichero commiteado:
PROD_DB_URL='postgresql://...' node tmp/algun-script-de-diagnostico.mjs
```
