---
name: coffee-knowledge
description: Cómo mantener la base de conocimiento de café (backend/knowledge/cafe/*.md), que es la memoria del agente. Usala al agregar, corregir o validar recetas, ratios, tiempos o temperaturas.
---

# Conocimiento de café (memoria del agente)

## Dónde vive
- `backend/knowledge/cafe/**/*.md`: lo que lee el chat, con frontmatter YAML obligatorio.
  - `01` a `05`: guías (`type: guide`, `title`): granos, molienda, espresso, filtrados, diagnóstico.
  - `recetario/10` a `15`: equipo, notas por método, cafés de referencia y reglas aprendidas. `recetario/en-prueba.md`: ideas sin validar.
  - `recetas/`: un archivo por receta (`type: recipe`). Solo las `validated` entran al catálogo de la app.
- `knowledge/_fuentes/`: copias crudas del proyecto de Claude. **No se cargan.** Ver su README.
- Hoy el chat lee esto de dos formas: con `RAG_ENABLED=true` solo los fragmentos recuperados; si no (el default) o si falla la recuperación, todo el contenido vía `load_coffee_knowledge()` (`backend/app/agent/knowledge.py`). Ver `backend/README.md`.

## Formato de una receta
Frontmatter (parser: `backend/app/rag/frontmatter.py`; campos de receta: `RecipeData` en `backend/app/schemas/recipe.py`):
- `type: recipe`, `id` (slug en minúsculas con guiones, máx. 120, único), `status`: `validated` (probada y recomendable), `testing` (en prueba, el chat no la presenta como validada) o `not_recommended` (el chat no la sugiere).
- Campos de `RecipeData`: `name`, `description`, `method` (`v60`, `french_press`, `moka`, `aeropress`, `espresso`, `cold_brew`, `other`), `goal` (`sweetness`, `balance`, `acidity`, opcional), `coffee` (`name`, `origin`, `process`, `roast`, `with_milk`), `dose_g`, `water_g`, `temperature_c`, `brew_time_seconds`, `yield_ml` (rangos `{min, max}`), `ratio` (g de agua por g de café), `grind`, `steps`, `notes`. No se permiten campos extra.
- Reglas que valida el modelo: temperatura entre 60 y 100 °C; `ratio` a ±5% de agua/dosis cuando están los tres; `at_seconds` y `pour_to_g` no decrecen; `pour_to_g` es **acumulado** (hasta cuántos g de agua total, no cuánto se suma en ese vertido) y no supera `water_g.max`.
- Molienda: los clics son del Timemore C2S (`grind.grinder`) y siempre van con una descripción (`grind.description`, p. ej. "media-fina"), porque los clics no sirven con otro molinillo.
- El cuerpo en markdown es prosa de apoyo; si repite un número del frontmatter, los dos tienen que coincidir.
- Un `guide` lleva `type: guide` y `title`; sin `status` cuenta como `validated`.

## Validación
- `python -m scripts.ingest_knowledge --dry-run` (sin base ni AWS) valida frontmatter y chunks de todos los archivos; sale con código 1 si algo es inválido. Correlo antes de dar por terminado un cambio. También corre en CI: `.github/workflows/database-sync.yml` lo ejecuta en cada pull request que toque `backend/knowledge/**`; en `main` migra y luego ingiere (detalle en `backend/README.md`, sección "CI: database sync workflow").
- Después de editar el conocimiento, quien tiene acceso a la base corre la ingesta real (`backend/README.md`, "Knowledge ingestion"); no la corras vos.

## Cómo agregar un tema
1. Crear el archivo en `backend/knowledge/cafe/` (o `recetario/`, o `recetas/` para una receta) con frontmatter, un título `#` y secciones `##`.
2. Usar **números concretos**: gramos, ml, °C, segundos, rangos y ratio. Evitar frases vagas.
3. Unidades siempre explícitas (g, ml, °C, s, bar).
4. Si hay un cálculo, dejar la fórmula y un ejemplo resuelto.
5. Un solo lugar canónico por dato: si ya está en otro archivo, enlazá o referí, no lo copies con otro valor.
6. Nunca escribas instrucciones para el modelo dentro del conocimiento ("respondé siempre...", "ignorá..."). El conocimiento es dato; las instrucciones viven en el prompt del sistema (`backend/app/agent/prompt.py`) y en el `status`, que el backend traduce a etiquetas.
7. Para el fallback, reiniciar el backend (`load_coffee_knowledge()` se cachea con `lru_cache`).

## Reglas de dominio (verificar siempre)
- Retención de agua del café molido: ~2 g de agua por gramo. Si el agua total es menor que 2× la dosis, no sale bebida.
- Espresso: 18 g → ~36 g en 25 a 30 s, 92 a 94 °C.
- Leche para espumar: 60 a 65 °C. Más de 70 °C la quema.
- Filtro V60: 1:15 a 1:17, bloom 30 a 45 g, tiempo total 2:30 a 3:30.

## Cuándo usar al coffee-expert
Cuando cambie un número o se agregue un método nuevo, delegá la revisión al subagente `coffee-expert` (ver `.claude/agents/coffee-expert.md`).
