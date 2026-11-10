from pathlib import Path

import pytest

from app.rag.frontmatter import FrontmatterError, ParsedDocument, parse_document, split_frontmatter
from app.schemas.recipe import RecipeStatus

RECIPE = """---
type: recipe
id: mild-honey-v60-cuatro-vertidos
status: validated
name: Mild Honey V60, cuatro vertidos
method: v60
dose_g: {min: 20}
water_g: {min: 320, max: 330}
ratio: 16.25
temperature_c: {min: 88, max: 89}
grind: {grinder: Comandante, clicks: {min: 24, max: 25}}
steps:
  - {at_seconds: 0, action: Bloom, pour_to_g: 40}
  - {at_seconds: 30, action: Second pour, pour_to_g: 120}
  - {at_seconds: 60, action: Third pour, pour_to_g: 240}
  - {at_seconds: 120, action: Last pour, pour_to_g: 330}
---

Body text.
"""


def write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "doc.md"
    path.write_text(text, encoding="utf-8")
    return path


def test_valid_recipe(tmp_path: Path) -> None:
    doc = parse_document(write(tmp_path, RECIPE))
    assert isinstance(doc, ParsedDocument)
    assert doc.type == "recipe"
    assert doc.id == "mild-honey-v60-cuatro-vertidos"
    assert doc.status is RecipeStatus.VALIDATED
    assert doc.title == "Mild Honey V60, cuatro vertidos"
    assert doc.body == "Body text."
    assert doc.recipe is not None
    assert doc.recipe.water_g.upper == 330
    assert [s.pour_to_g for s in doc.recipe.steps] == [40, 120, 240, 330]
    assert doc.meta["type"] == "recipe"


def test_guide_defaults_to_validated(tmp_path: Path) -> None:
    doc = parse_document(write(tmp_path, "---\ntype: guide\ntitle: Granos\n---\nHola\n"))
    assert (doc.type, doc.title, doc.status, doc.id, doc.recipe) == (
        "guide", "Granos", RecipeStatus.VALIDATED, None, None
    )


def test_guide_testing(tmp_path: Path) -> None:
    doc = parse_document(write(tmp_path, "---\ntype: guide\ntitle: T\nstatus: testing\n---\nx"))
    assert doc.status is RecipeStatus.TESTING


def _recipe(**changes: str) -> str:
    lines = RECIPE.split("---\n")[1].splitlines()
    kept = [l for l in lines if l.split(":")[0] not in changes]
    return "---\n" + "\n".join(kept + [f"{k}: {v}" for k, v in changes.items() if v]) + "\n---\nbody"


BAD_CASES = {
    "no_frontmatter": "just text",
    "invalid_yaml": "---\na: [unclosed\n---\nbody",
    "not_mapping": "---\n- a\n- b\n---\nbody",
    "missing_type": "---\ntitle: x\n---\nbody",
    "unknown_type": "---\ntype: other\n---\nbody",
    "recipe_missing_id": _recipe(id=""),
    "recipe_missing_status": _recipe(status=""),
    "id_uppercase": _recipe(id="Bad_Id"),
    "id_too_long": _recipe(id="a" * 121),
    "invalid_status": _recipe(status="great"),
    "guide_without_title": "---\ntype: guide\n---\nbody",
    "recipe_validation": _recipe(method="teapot"),
}


@pytest.mark.parametrize("text", BAD_CASES.values(), ids=BAD_CASES.keys())
def test_strict_errors(tmp_path: Path, text: str) -> None:
    path = write(tmp_path, text)
    with pytest.raises(FrontmatterError) as exc:
        parse_document(path)
    assert str(exc.value).startswith(str(path))


def test_validation_error_includes_pydantic_message(tmp_path: Path) -> None:
    with pytest.raises(FrontmatterError, match="method"):
        parse_document(write(tmp_path, _recipe(method="teapot")))


def test_nan_rejected(tmp_path: Path) -> None:
    with pytest.raises(FrontmatterError):
        parse_document(write(tmp_path, _recipe(ratio=".nan")))


def test_python_tag_rejected(tmp_path: Path) -> None:
    text = "---\ntype: guide\ntitle: !!python/object/apply:os.system ['echo hi']\n---\nx"
    path = write(tmp_path, text)
    with pytest.raises(FrontmatterError) as exc:
        parse_document(path)
    assert str(exc.value).startswith(str(path))


def test_split_valid() -> None:
    assert split_frontmatter("---\na: 1\n---\nbody\n") == ({"a": 1}, "body", False)


def test_split_bom_prefix() -> None:
    assert split_frontmatter("\ufeff---\na: 1\n---\nbody") == ({"a": 1}, "body", False)


@pytest.mark.parametrize("text", ["plain", "---\na: 1\nno end"])
def test_split_no_frontmatter(text: str) -> None:
    assert split_frontmatter(text) == (None, text, False)


@pytest.mark.parametrize(
    "text", ["---\n- a\n---\nbody", "---\na: [x\n---\nbody", "---\nd: 2023-99-99\n---\nbody"]
)
def test_split_malformed_strips_block(text: str) -> None:
    assert split_frontmatter(text) == (None, "body", True)


def test_invalid_date_is_frontmatter_error(tmp_path: Path) -> None:
    path = write(tmp_path, "---\ntype: guide\ntitle: T\nd: 2023-99-99\n---\nx")
    with pytest.raises(FrontmatterError) as exc:
        parse_document(path)
    assert str(exc.value).startswith(str(path))


def test_bom_file_parses(tmp_path: Path) -> None:
    doc = parse_document(write(tmp_path, "\ufeff" + RECIPE))
    assert doc.id == "mild-honey-v60-cuatro-vertidos"
