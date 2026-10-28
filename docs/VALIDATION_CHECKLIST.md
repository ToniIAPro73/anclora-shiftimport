# Checklist de validación — ajustar sintaxis de DROP CONSTRAINT en migración 0046 (2026-10-28)

> Este fichero se sobrescribe en cada entrega. El historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama y commit:** development @ 673b8634e170f12a8b047fc3e25079180193f8a1 (base del cambio local)
**Entorno de validación:** runtime local (cambio SQL; sin cambios en aplicación web)
**Datos:** sin escrituras; Toni confirma que 0046 ya está aplicada en producción. Cuenta: no aplica.

## 1. Qué cambia
- Quita `IF EXISTS` de `DROP CONSTRAINT` en 0046 para evitar el falso positivo de sintaxis del analizador `dbtools`; conserva el reemplazo de la constraint.

## 2. Ya comprobado por el agente
| Comprobación | Comando o método | Resultado | SHA |
| --- | --- | --- | --- |
| Pruebas del runner de migraciones | `npm test -- --run db/migrate.test.mjs` | PASS — 79 tests | 673b8634e170f12a8b047fc3e25079180193f8a1 + diff local |
| Espacios y formato del diff | `git diff --check` | PASS | 673b8634e170f12a8b047fc3e25079180193f8a1 + diff local |
| Compatibilidad de sintaxis | PostgreSQL `ALTER TABLE` admite `DROP CONSTRAINT [ IF EXISTS ]`; quitar la cláusula opcional evita la limitación del analizador indicada en la captura | PASS — cambio acotado al analizador | 673b8634e170f12a8b047fc3e25079180193f8a1 + diff local |

## 3. Pruebas no ejecutadas (NOT_RUN)
| Prueba | Motivo concreto |
| --- | --- |
| Volver a aplicar 0046 en producción | Toni confirmó que ya está aplicada; no es necesario repetir una migración registrada. |
| Suite completa y pruebas visuales | El único cambio es una cláusula opcional de SQL; la prueba focalizada del runner es suficiente y no cambia la interfaz. |
| Verificar el panel Problems de VS Code tras recargar el archivo | El editor compartido no está disponible para inspección interactiva en este paso; Toni puede validar que desapareció el aviso. |

## 4. Checklist para validar en la aplicación
Marca cada punto. Un fallo en un punto marcado **[BLOQUEANTE]** impide promocionar.

| # | Dónde | Pasos | Resultado esperado | Cuenta o configuración | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| 1 | Editor SQL / `db/migrations/0046_confirmed_full_day_shift_override.sql` | 1. Recargar el archivo desde disco. 2. Revisar la línea `DROP CONSTRAINT`. | La línea no contiene `IF EXISTS` y `dbtools` ya no muestra el error de sintaxis de la captura. | No aplica | Sí |

### Casos negativos y de borde
| # | Caso | Resultado esperado |
| --- | --- | --- |
| 1 | Reejecutar manualmente el SQL ya aplicado | No hacerlo; el runner registra 0046 como aplicada. La constraint existe desde 0041. |

### Estados de interfaz afectados
- [ ] Vacío · [ ] Cargando · [ ] Error · [ ] Éxito · [ ] Móvil · [ ] Escritorio · [ ] Modo oscuro (no aplica: no hay cambios de interfaz)

## 5. Riesgos y limitaciones
- El `DROP CONSTRAINT` sin `IF EXISTS` requiere que exista `shifts_provenance_check`, creada por la migración 0041; el runner forward-only aplica 0046 una sola vez.
- La migración 0046 ya aplicada en producción no se vuelve a ejecutar; este cambio corrige el archivo fuente y el aviso del editor.

## 6. Decisión de Toni
- [ ] Todos los puntos bloqueantes pasan
- [x] Se promociona: Toni autorizó `PROMOTE=FULL` (staging → production → main)
- [ ] No se promociona. Motivo: ______________________
