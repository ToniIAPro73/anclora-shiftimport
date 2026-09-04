# R2-M05 — Bulk Provisioning

STATUS: DONE (verification spec)

## 1. Objetivo

Confirmar que el aprovisionamiento masivo de usuarios (CSV) y la distribución de credenciales one-time es segura y correcta.

## 2. Problema que resuelve

Aprovisionar decenas de empleados con acceso de usuario a la vez sin exponer contraseñas en el servidor más allá de lo estrictamente necesario.

## 3. Estado actual del repositorio

`MembersModal.tsx` orquesta el flujo; `credentials-export.ts` (commit `60df5b2`) genera un TXT descargable client-side con las credenciales one-time; las contraseñas no se persisten server-side más allá de la respuesta inicial.

## 4. Alcance IN

Verificación del flujo completo: CSV → creación de usuarios → credenciales generadas → export TXT → vinculación a empleados (ve R2-M04).

## 5. Alcance OUT

No se añade un mecanismo de reenvío de credenciales (fuera de MVP salvo que se solicite explícitamente).

## 6. Dependencias

R2-M04.

## 7. Decisiones arquitectónicas

Se ratifica la decisión de no persistir contraseñas en claro ni en logs; el TXT es la única vía de entrega y es responsabilidad del ADMIN distribuirlo con seguridad.

## 8. Modelo de datos afectado

N/A — motivo: sin cambios de esquema, solo verificación.

## 9. API / Backend

Confirmar que el endpoint de creación masiva no registra contraseñas en claro en ningún log ni tabla de auditoría.

## 10. Frontend / UX

Confirmar que `MembersModal.tsx` muestra progreso claro durante la creación masiva (loading state) y maneja filas de CSV inválidas sin abortar el lote completo.

## 11. Seguridad y autorización

Punto crítico: reconfirmar explícitamente que ninguna contraseña generada queda persistida server-side más allá del ciclo de vida de la respuesta, y que el TXT se genera client-side (no queda copia en servidor). Documentar esto como invariante de seguridad permanente.

## 12. i18n

N/A — motivo: sin nuevos textos; verificar cobertura existente.

## 13. Accesibilidad

N/A — motivo: sin cambios de UI en esta microfase.

## 14. Responsive / temas

N/A — motivo: sin cambios de UI.

## 15. Observabilidad / errores

Confirmar que errores de fila individual en el CSV (email duplicado, formato inválido) se reportan por fila sin abortar el resto del lote.

## 16. Migraciones

N/A — motivo: ninguna migración nueva.

## 17. Compatibilidad y datos existentes

N/A — motivo: verificación, no migración de datos.

## 18. Tasks

### T01 — Auditoría de seguridad del flujo de credenciales

Objetivo: Confirmar que no hay persistencia de contraseñas en claro en servidor (BD, logs).
Archivos / módulos probables: `MembersModal.tsx`, `credentials-export.ts`, `api/_lib/auth.js`, `api/_lib/data.js`.
Cambios: Ninguno salvo hallazgo de fuga.
No hacer: No introducir almacenamiento nuevo de contraseñas.
Criterios de aceptación:
- [x] Grep de logs/BD confirma ausencia de contraseñas en claro persistidas.
- [x] Confirmado que TXT se genera solo client-side.
Tests: N/A — auditoría de código.
Evidencia esperada: resultado de grep + confirmación de flujo.

### T02 — Test de fila inválida en CSV masivo

Objetivo: Confirmar manejo por fila sin abortar el lote.
Archivos / módulos probables: `MembersModal.tsx`, endpoint de creación masiva.
Cambios: Añadir test si falta cobertura.
No hacer: No cambiar el comportamiento de éxito parcial sin justificación explícita.
Criterios de aceptación:
- [x] Fila con email duplicado se reporta como error individual, resto del lote se procesa.
Tests: test de componente o integración según ubicación de la lógica.
Evidencia esperada: resultado de test.

## 19. Tests obligatorios

security audit (manual/grep), integration test de fila inválida.

## 20. Evidencias

Resultado de T01, T02:

- Auditoría `rg` de `api/` y `src/`: las contraseñas temporales solo aparecen en memoria/respuesta única y en el export client-side; ningún `console.log`/`console.error` registra contraseñas. El único log relacionado con credenciales es el flujo separado de reset, que registra el enlace/token de desarrollo, no una contraseña.
- `npx vitest run api/_lib/data.test.js api/_lib/data.areas.test.js api/areas/index.test.js api/_lib/auth.test.js` → **155 tests PASS** para la lógica backend, incluyendo `DUPLICATE_IN_FILE`, `INVALID_EMAIL`, éxito parcial e idempotencia.
- `npx vitest run src/components/shift-dashboard/MembersModal.test.tsx src/lib/credentials-export.test.ts src/lib/bulk-import-csv.test.ts` → **3 archivos, 59 tests PASS**; confirma fila inválida sin abortar, credenciales one-time y export TXT en cliente.

## 21. Gate

Gates requeridos: G10 (Unit/integration tests), G12 (Security).

Resultado: **PASS**. No se detectó persistencia server-side de contraseñas en claro ni exposición adicional; los errores se procesan por fila.

## 22. Rollback / remediación

Si T01 encuentra persistencia indebida de contraseñas, es bloqueante — no se declara PASS hasta remediar.

## 23. Criterio de DONE

Confirmado sin persistencia server-side de contraseñas en claro; manejo por fila de errores de CSV verificado.
