"""The `propose_recipe` tool: the only way the model can hand a structured recipe to the app.

The input schema comes from `RecipeData`, so the tool and the server-side validation never drift apart.
"""

from typing import Any

from app.schemas.recipe import RecipeData

TOOL_NAME = "propose_recipe"


def _inline_refs(node: Any, defs: dict[str, Any]) -> Any:
    """Replace every `$ref` with its definition: the tool schema must be self-contained."""
    if isinstance(node, dict):
        if "$ref" in node:
            target = defs[node["$ref"].rsplit("/", 1)[-1]]
            siblings = {k: v for k, v in node.items() if k != "$ref"}
            return {**_inline_refs(target, defs), **_inline_refs(siblings, defs)}
        return {k: _inline_refs(v, defs) for k, v in node.items() if k != "$defs"}
    if isinstance(node, list):
        return [_inline_refs(item, defs) for item in node]
    return node


def _build_input_schema() -> dict[str, Any]:
    schema = RecipeData.model_json_schema()
    return _inline_refs(schema, schema.get("$defs", {}))


PROPOSE_RECIPE_TOOL: dict[str, Any] = {
    "name": TOOL_NAME,
    "description": (
        "Propose a new recipe version. Call it ONLY when the user asks to adapt a recipe or to create a new one, "
        "never for ordinary questions. It does not modify any saved recipe: the user decides whether to save it. "
        "Write all recipe text content (name, description, steps, notes) in Spanish. Cumulative pour_to_g and "
        "at_seconds must not decrease. Also reply to the user in text explaining the proposal."
    ),
    "input_schema": _build_input_schema(),
}
