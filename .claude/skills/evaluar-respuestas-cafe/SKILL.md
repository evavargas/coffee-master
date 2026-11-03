---
name: evaluar-respuestas-cafe
description: Evalúa las respuestas del chat de café contra los casos de prueba (backend/evals/casos.json) y contra la base de conocimiento. Usala cuando cambie knowledge/cafe/, el prompt del agente o el modelo, o cuando el usuario pida revisar si el chat responde bien.
---

# Evaluar respuestas del chat de café

## Cuándo usarla
- Después de cambiar `knowledge/cafe/` (recetas, ratios, tiempos).
- Después de cambiar `backend/app/agent.py` (prompt) o `ANTHROPIC_MODEL`.
- Antes de desplegar.

## Qué evalúa
Cada caso de `backend/evals/casos.json` tiene:
- `pregunta`: lo que pregunta un usuario.
- `debe_incluir`: textos que deben aparecer (sin distinguir mayúsculas).
- `no_debe_incluir`: textos que nunca deben aparecer.
- `criterio`: qué respuesta correcta esperamos, en palabras.

Además de los textos, revisar a mano:
1. **Exactitud numérica**: ratios, gramos, ml, °C y segundos. Comparar con `knowledge/cafe/`.
2. **Uso de la base**: la respuesta sale del conocimiento y no inventa recetas.
3. **Cálculos**: ratio = agua ÷ café; agua retenida ≈ 2 × dosis.
4. **Honestidad**: si la fuente se contradice o el dato está en prueba, lo dice.
5. **Estilo**: español rioplatense (voseo), pasos numerados para preparaciones, un cambio por vez en diagnósticos.

## Cómo correrla
1. Tener el backend levantado en `http://localhost:8000` (ver `.claude/launch.json`).
2. Para cada caso, pedir la respuesta:

```bash
curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"PREGUNTA"}]}'
```

3. Revisar `debe_incluir` y `no_debe_incluir` (sin distinguir mayúsculas).
4. Revisar `criterio` y los puntos de la sección "Qué evalúa".
5. Armar una tabla: caso, pasa o falla, motivo.

## Salida esperada
| Caso | Resultado | Motivo |
|---|---|---|
| ratio-inviable | ✅ / ❌ | ... |

Terminar con: total de casos, cuántos pasan, y los fallos con la respuesta exacta.

## Qué hacer con un fallo
- **Fallo de dato** (número o receta incorrecta): corregir en `knowledge/cafe/` con el subagente `coffee-expert`, no en el prompt.
- **Fallo de comportamiento** (inventa, no advierte contradicciones, no sigue el estilo): ajustar `INSTRUCTIONS` en `backend/app/agent.py`.
- **Caso mal planteado** (el criterio no coincide con el conocimiento): corregir el caso, no la respuesta.
- No cambiar el conocimiento para que pase un caso sin antes verificar la fuente.

## Notas
- Los casos son una red mínima. Agregar un caso nuevo por cada error real que aparezca.
- Las respuestas de un modelo varían. Si un caso falla por un detalle de redacción, marcarlo como "revisar" y no como error de dato.
