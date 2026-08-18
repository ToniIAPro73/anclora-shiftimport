# Anclora ShiftImport Unified Test Dataset v1

Este ZIP unifica dos datasets complementarios para Anclora ShiftImport.

## 1. acceptance-corpus/
Corpus sintético principal para gate M0, CI y regresión.
Contiene fixtures con ground truth (`expected.json`), `manifest.json`,
schema y casos positivos/negativos.

## 2. adversarial-dataset/
Dataset suplementario para pruebas exploratorias, robustez y casos difíciles.
Incluye escenarios adicionales que no forman parte del gate canónico M0.

## Regla de uso

- El contenido de `acceptance-corpus/` puede bloquear una aprobación M0 cuando falle.
- El contenido de `adversarial-dataset/` debe usarse como señal de robustez y evolución,
  salvo que una prueba concreta se promueva formalmente al corpus de aceptación.
- No mezclar sus expectativas ni asumir que todos los archivos adversariales tienen
  un ground truth normalizado.

## Estado

Este ZIP combina los dos datasets originales sin alterar su contenido interno.
Las observaciones de revisión previas sobre el corpus principal siguen siendo aplicables
hasta que se genere una versión corregida/congelada del corpus M0.
