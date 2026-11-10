"""Corpus tests over the real backend/knowledge/cafe/ folder."""

from pathlib import Path

import pytest

from app.agent.knowledge import KNOWLEDGE_DIR, load_coffee_knowledge
from app.rag.frontmatter import ParsedDocument, parse_document
from app.schemas.recipe import RecipeStatus

RECIPES_DIR = KNOWLEDGE_DIR / "recetas"
UNTESTED_IDS = {"azahar-y-durazno-opcion-b", "origami-dripper-estandar", "v60-escalado-600-ml"}


def _recipe_files() -> list[Path]:
    return sorted(RECIPES_DIR.glob("*.md"))


def _guide_files() -> list[Path]:
    return sorted(f for f in KNOWLEDGE_DIR.rglob("*.md") if RECIPES_DIR not in f.parents)


@pytest.fixture(scope="module")
def recipes() -> list[ParsedDocument]:
    return [parse_document(f) for f in _recipe_files()]


def test_recipe_files_exist() -> None:
    assert _recipe_files()


def test_recipes_parse_as_recipes(recipes: list[ParsedDocument]) -> None:
    assert all(d.type == "recipe" and d.recipe is not None for d in recipes)


def test_ids_unique_and_match_file_name(recipes: list[ParsedDocument]) -> None:
    ids = [d.id for d in recipes]
    assert len(set(ids)) == len(ids)
    assert ids == [d.path.stem for d in recipes]


def test_status_is_valid(recipes: list[ParsedDocument]) -> None:
    assert all(d.status in set(RecipeStatus) for d in recipes)


@pytest.mark.parametrize("path", _guide_files(), ids=lambda p: p.name)
def test_guides_parse_as_guides(path: Path) -> None:
    assert parse_document(path).type == "guide"


def test_untested_recipes_are_testing(recipes: list[ParsedDocument]) -> None:
    by_id = {d.id: d for d in recipes}
    assert UNTESTED_IDS <= by_id.keys()
    assert all(by_id[i].status is RecipeStatus.TESTING for i in UNTESTED_IDS)


ESTADO_LINES = {
    RecipeStatus.TESTING: "Estado: en prueba, no recomendar como validada",
    RecipeStatus.NOT_RECOMMENDED: "Estado: no recomendada, no la sugieras",
}


def test_loaded_knowledge_shows_estado_per_document() -> None:
    sections = {
        s.split("\n", 1)[0]: s.split("\n")[1]
        for s in load_coffee_knowledge().split("\n\n---\n\n")
    }
    for f in _recipe_files() + _guide_files():
        doc = parse_document(f)
        header = f"## Document: {f.relative_to(KNOWLEDGE_DIR).as_posix()}"
        assert header in sections
        assert sections[header] == ESTADO_LINES.get(doc.status, "")
        assert not sections[header].startswith("type:")
