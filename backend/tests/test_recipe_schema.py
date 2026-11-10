"""Tests for the RecipeData schema and its validators."""

from datetime import UTC, datetime
from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.recipe import (
    CatalogRecipeOut,
    Range,
    RecipeData,
    UserRecipeOut,
)


def geisha() -> dict[str, Any]:
    return {
        "name": "Geisha V60 (12 people, first batch)",
        "method": "v60",
        "goal": "balance",
        "dose_g": {"min": 26},
        "water_g": {"min": 390},
        "ratio": 15,
        "temperature_c": {"min": 93},
        "grind": {"grinder": "Timemore C2S", "clicks": {"min": 23}},
        "steps": [
            {"at_seconds": 0, "action": "Bloom", "pour_to_g": 52},
            {"at_seconds": 45, "action": "Second pour", "pour_to_g": 234},
            {"at_seconds": 90, "action": "Final pour", "pour_to_g": 390},
        ],
    }


def mild_honey() -> dict[str, Any]:
    return {
        "name": "Mild Honey V60 four pours",
        "method": "v60",
        "dose_g": {"min": 20},
        "water_g": {"min": 320, "max": 330},
        "ratio": 16.25,
        "temperature_c": {"min": 88, "max": 89},
        "grind": {"clicks": {"min": 24, "max": 25}},
        "steps": [
            {"at_seconds": 0, "action": "Bloom", "pour_to_g": 40},
            {"at_seconds": 30, "action": "Pour", "pour_to_g": 120},
            {"at_seconds": 60, "action": "Pour", "pour_to_g": 240},
            {"at_seconds": 120, "action": "Pour", "pour_to_g": 330},
        ],
    }


def test_valid_full_recipe() -> None:
    recipe = RecipeData.model_validate(geisha())
    assert recipe.steps[-1].pour_to_g == 390
    assert recipe.grind is not None and recipe.grind.clicks == Range(min=23)


def test_valid_range_recipe() -> None:
    assert RecipeData.model_validate(mild_honey()).water_g == Range(min=320, max=330)


def test_valid_partial_recipe() -> None:
    recipe = RecipeData.model_validate({"name": "Basic", "method": "moka"})
    assert recipe.steps == []
    assert recipe.dose_g is None


def test_range_min_above_max_rejected() -> None:
    with pytest.raises(ValidationError, match="min must be less than or equal to max"):
        Range(min=5, max=3)


def test_temperature_out_of_bounds_rejected() -> None:
    data = geisha() | {"temperature_c": {"min": 93, "max": 150}}
    with pytest.raises(ValidationError, match="temperature_c must be between 60 and 100"):
        RecipeData.model_validate(data)


def test_ratio_off_by_more_than_5_percent_rejected() -> None:
    with pytest.raises(ValidationError, match="ratio"):
        RecipeData.model_validate(geisha() | {"ratio": 17})


def test_ratio_within_5_percent_accepted() -> None:
    RecipeData.model_validate(geisha() | {"ratio": 15.5})


def test_decreasing_pour_to_g_rejected() -> None:
    data = geisha()
    data["steps"][1]["pour_to_g"] = 30
    with pytest.raises(ValidationError, match="pour_to_g must not decrease"):
        RecipeData.model_validate(data)


def test_pour_above_water_max_rejected() -> None:
    data = mild_honey()
    data["steps"][-1]["pour_to_g"] = 400
    with pytest.raises(ValidationError, match="pour_to_g must not exceed water_g"):
        RecipeData.model_validate(data)


def test_decreasing_at_seconds_rejected() -> None:
    data = geisha()
    data["steps"][2]["at_seconds"] = 10
    with pytest.raises(ValidationError, match="at_seconds must not decrease"):
        RecipeData.model_validate(data)


def test_unknown_method_rejected() -> None:
    with pytest.raises(ValidationError):
        RecipeData.model_validate({"name": "X", "method": "chemex"})


def test_unknown_field_rejected() -> None:
    with pytest.raises(ValidationError):
        RecipeData.model_validate({"name": "X", "method": "v60", "color": "red"})


def test_response_models_build_and_validate() -> None:
    catalog = CatalogRecipeOut.model_validate(
        geisha() | {"slug": "geisha", "status": "validated", "source": {"document": "11-v60.md"}}
    )
    assert catalog.archived is False and catalog.source.section is None
    now = datetime.now(UTC)
    user = UserRecipeOut.model_validate(
        mild_honey()
        | {"id": 1, "parent": {"kind": "catalog", "ref": "geisha"}, "created_at": now, "updated_at": now}
    )
    assert user.parent is not None and user.parent.ref == "geisha"
    with pytest.raises(ValidationError):
        UserRecipeOut.model_validate(
            geisha() | {"id": 1, "created_at": now, "updated_at": now, "ratio": 30}
        )


def test_json_schema_generates() -> None:
    assert "properties" in RecipeData.model_json_schema()


def _without_water(d: dict[str, Any]) -> None:
    d.pop("water_g")
    d.pop("ratio")


NON_FINITE_CASES = {
    "dose_g_min_nan": lambda d: d.update(dose_g={"min": float("nan")}),
    "ratio_nan": lambda d: d.update(ratio=float("nan")),
    # With water_g null the cumulative-pour check never compares, so only allow_inf_nan can reject it.
    "pour_to_g_inf": lambda d: (_without_water(d), d["steps"][0].update(pour_to_g=float("inf"))),
    "temperature_inf": lambda d: d.update(temperature_c={"min": float("inf")}),
}


@pytest.mark.parametrize("mutate", NON_FINITE_CASES.values(), ids=NON_FINITE_CASES.keys())
def test_non_finite_numbers_rejected_in_python(mutate) -> None:
    data = geisha()
    mutate(data)
    with pytest.raises(ValidationError):
        RecipeData.model_validate(data)


@pytest.mark.parametrize("mutate", NON_FINITE_CASES.values(), ids=NON_FINITE_CASES.keys())
def test_non_finite_numbers_rejected_in_json(mutate) -> None:
    import json

    data = geisha()
    mutate(data)
    payload = json.dumps(data)  # emits the bare NaN / Infinity tokens
    assert "NaN" in payload or "Infinity" in payload
    with pytest.raises(ValidationError):
        RecipeData.model_validate_json(payload)


@pytest.mark.parametrize(
    "patch",
    [
        {"notes": "x" * 2001},
        {"coffee": {"origin": "x" * 121}},
        {"grind": {"description": "x" * 301}},
        {"grind": {"grinder": "x" * 121}},
        {"steps": [{"action": "x" * 501}]},
        {"steps": [{"action": "a"}] * 31},
    ],
)
def test_oversized_text_fields_rejected(patch: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        RecipeData.model_validate({**geisha(), "steps": [], **patch})


def test_limits_accept_exact_maximum() -> None:
    RecipeData.model_validate({**geisha(), "notes": "x" * 2000, "steps": [{"action": "a"}] * 30})


def test_recipe_context_caps_oversized_legacy_row() -> None:
    from app.agent.prompt import RECIPE_CONTEXT_MAX_CHARS, render_recipe_context

    out = render_recipe_context("user", {"notes": "x" * 5_000_000}, {"notes": "y" * 5_000_000})
    assert out is not None
    assert len(out) < 2 * RECIPE_CONTEXT_MAX_CHARS + 200
    assert out.startswith("<recipe_context>\n") and out.endswith("\n</recipe_context>")
    assert out.count("[truncated]") == 2
