---
name: coffee-knowledge
description: Cómo mantener la base de conocimiento de café (backend/knowledge/cafe/*.md), que es la memoria del agente. Usala al agregar, corregir o validar recetas, ratios, tiempos o temperaturas.
---

# Conocimiento de café (memoria del agente)

## Dónde vive
- `backend/knowledge/cafe/**/*.md`: lo que carga el chat. El backend lee todas las subcarpetas en orden alfabético por ruta (ver `backend/app/knowledge.py`).
  - `01` a `09`: conceptos generales (granos, molienda, ratios, espresso, bebidas, diagnóstico, cálculos).
  - `recetario/10` a `15`: equipo, recetas validadas por método, cafés de referencia y reglas aprendidas.
  - `recetario/en-prueba.md`: ideas sin validar. El chat las presenta como "en prueba".
- `knowledge/_fuentes/`: copias crudas del proyecto de Claude. **No se cargan.** Ver su README.

## Cómo agregar un tema
1. Crear el archivo en `backend/knowledge/cafe/` (o en `recetario/`) con un título `#` y secciones `##`. Usar prefijo numérico para el orden.
2. Usar **números concretos**: gramos, ml, °C, segundos, rangos y ratio. Evitar frases vagas.
3. Unidades siempre explícitas (g, ml, °C, s, bar).
4. Si hay un cálculo, dejar la fórmula y un ejemplo resuelto.
5. Reiniciar el backend (el contenido se cachea en memoria con `lru_cache`).

## Reglas de dominio (verificar siempre)
- Retención de agua del café molido: ~2 g de agua por gramo. Si el agua total es menor que 2× la dosis, no sale bebida.
- Espresso: 18 g → ~36 g en 25 a 30 s, 92 a 94 °C.
- Leche para espumar: 60 a 65 °C. Más de 70 °C la quema.
- Filtro V60: 1:15 a 1:17, bloom 30 a 45 g, tiempo total 2:30 a 3:30.

## Cuándo usar al coffee-expert
Cuando cambie un número o se agregue un método nuevo, delegá la revisión al subagente `coffee-expert` (ver `.claude/agents/coffee-expert.md`).

## Próximo paso (cuando crezca)
Si la base supera lo que cabe cómodamente en el prompt, pasar a búsqueda semántica (embeddings) sobre estos mismos archivos.
