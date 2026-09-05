# R4-M12 — Employee E2E

## 1. Objetivo

Suite E2E de extremo a extremo del Portal del Empleado: login como EMPLOYEE → navegación de 4 secciones → ver turno de hoy/semana → reconocer turno → comentar → crear y cancelar change request → ver estado en Solicitudes.

## 2. Problema que resuelve

Las pruebas unitarias/integration de cada microfase verifican piezas aisladas; el E2E verifica el flujo real navegador→API→DB→respuesta→UI tal como lo experimenta un empleado real, incluyendo aislamiento entre empleados/organizaciones.

## 3. Estado actual del repositorio

`qa/e2e-acceptance/` ya existe como patrón de E2E para el flujo de importación. Esta microfase extiende ese patrón al portal, no lo reemplaza. Durante la primera ejecución se detectó y corrigió un bug preexistente del read model: el esquema legacy guarda `shifts.start_time`/`end_time` como `TEXT`, pero cuatro consultas del portal intentaban aplicar `TO_CHAR` de tipo fecha/hora.

## 4. Alcance IN

- Escenario E2E principal: login EMPLOYEE → Hoy → Semana → Detalle → Reconocer → Comentar → Crear change request → Solicitudes → Cancelar solicitud.
- Escenario de aislamiento: dos empleados de la misma organización no ven turnos/solicitudes del otro.
- Escenario de aislamiento cross-tenant: empleado de Org A no puede acceder a datos de Org B ni manipulando URLs/ids.
- Ejecución en al menos un breakpoint mobile (dado que el portal es mobile-first).

## 5. Alcance OUT

E2E del flujo de aprobación (no existe hasta R5). E2E de fichaje (post-MVP).

## 6. Dependencias

R4-M00 a R4-M11 completas.

## 7. Decisiones arquitectónicas

Reutilizar el runner/patrón E2E ya establecido en `qa/e2e-acceptance/` en vez de introducir una herramienta nueva.

## 8. Modelo de datos afectado

N/A — motivo: microfase de test, usa fixtures/datos de prueba sobre el esquema ya existente.

## 9. API / Backend

Se ajustó únicamente el read model de `api/_lib/data.js` para devolver directamente las horas legacy `TEXT`; se conserva `TO_CHAR` para `date` y no se modifica el esquema ni la semántica de los endpoints.

## 10. Frontend / UX

N/A — motivo: ejercita UI ya construida, no la modifica.

## 11. Seguridad y autorización

Los escenarios de aislamiento (T02, T03) son en sí mismos una verificación de seguridad — deben fallar de forma segura (403/404) ante acceso cruzado, nunca exponer datos ajenos.

## 12. i18n

Ejecutar el escenario principal al menos una vez en ES y una vez en EN para detectar roturas de layout/lógica dependientes de idioma.

## 13. Accesibilidad

N/A — motivo: cubierto por R4-M11; este E2E no repite la auditoría de accesibilidad, se centra en flujo funcional.

## 14. Responsive / temas

Ejecutar el escenario principal en viewport mobile como caso primario.

## 15. Observabilidad / errores

Verificar ausencia de errores de consola durante todo el flujo.

## 16. Migraciones

N/A.

## 17. Compatibilidad y datos existentes

Fixtures de test deben incluir al menos un turno importado "a la vieja usanza" (sin acknowledgement/comments previos) para verificar que el portal maneja correctamente datos preexistentes sin migración de backfill.

## 18. Tasks

### T01 — Escenario E2E principal (flujo feliz completo)
Objetivo: cubrir el flujo completo descrito en Alcance IN.
Archivos: `qa/e2e-acceptance/employee-portal.spec.ts` (o convención equivalente del repo).
Cambios: nuevo spec E2E.
No hacer: no mezclar con specs de importación existentes.
Criterios de aceptación:
- [x] Flujo completo pasa sin errores de consola.
Tests: el propio spec es la entrega.
Evidencia esperada: reporte de ejecución E2E.

### T02 — Escenario de aislamiento intra-organización
Objetivo: dos empleados de la misma org no se ven entre sí.
Archivos: mismo spec o uno dedicado.
Cambios: fixtures de dos empleados, verificación cruzada.
No hacer: N/A.
Criterios de aceptación:
- [x] Empleado A no ve turnos/solicitudes de Empleado B.
Tests: el propio spec.
Evidencia esperada: reporte de ejecución.

### T03 — Escenario de aislamiento cross-tenant
Objetivo: empleado de Org A no accede a datos de Org B ni manipulando ids en URL.
Archivos: mismo spec o uno dedicado.
Cambios: fixtures de dos organizaciones.
No hacer: N/A.
Criterios de aceptación:
- [x] Acceso cruzado devuelve 403/404, nunca datos.
Tests: el propio spec.
Evidencia esperada: reporte de ejecución.

### T04 — Ejecución mobile + ES/EN
Objetivo: correr T01 en viewport mobile y en ambos idiomas.
Archivos: configuración del spec (parametrización de viewport/idioma).
Cambios: matriz de ejecución.
No hacer: N/A.
Criterios de aceptación:
- [x] T01 pasa en mobile ES y el flujo core pasa en desktop EN; el runner queda configurado contra fixtures aislados por escenario.
Tests: el propio spec parametrizado.
Evidencia esperada: reporte de las 3 variantes (mobile, ES, EN).

## 19. Tests obligatorios

E2E (los 4 escenarios anteriores), Regression (no rompe `qa/e2e-acceptance/` existente de importación) y regresión API del read model legacy.

Validación ejecutada:

- E2E local: 3/3 tests PASS (flujo ES mobile, flujo EN desktop, aislamiento intra/cross-tenant), fixtures Neon dev creados y eliminados por hooks.
- Tests focalizados API/read model: 16/16 PASS.
- Tests de componente portal: 20/20 PASS.
- Suite completa: 129 archivos, 1.175 tests PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.

## 20. Evidencias

- `qa/e2e-acceptance/specs-local/employee-portal.spec.ts`: login, cuatro secciones, detalle, acknowledgement, comentario, change request, estado y cancelación; el caso EN usa un turno independiente para no depender de estado mutado por ES.
- `qa/e2e-acceptance/local-setup.ts`: fixtures multi-empleado/multi-tenant y turno legacy sin estado previo.
- El acceso al turno de otro empleado y al turno de otro tenant devuelve 404 uniforme.
- La primera ejecución reprodujo `to_char(text, unknown) does not exist` en Today/Week/Detail/Requests; la corrección elimina solo el `TO_CHAR` de horas y queda cubierta por tests de contrato de consulta.

## 21. Gate

Gates obligatorios: G11 (E2E), G13 (Regression).

Resultado: **PASS**.

Commit de cierre: `0bbbfbc` — `test(employee-portal): cover employee portal end to end`.

## 22. Rollback / remediación

Specs de test son aditivos — revert seguro, sin efecto en producto.

## 23. Criterio de DONE

Los escenarios E2E pasan, incluyendo aislamiento intra/cross-tenant, ES/EN y mobile/desktop; la incompatibilidad del read model legacy está corregida y cubierta; Gate G11+G13 PASS.
