import re
from pathlib import Path

import pytest

from app.rag.chunking import chunk_document
from app.rag.frontmatter import ParsedDocument, parse_document
from app.schemas.recipe import RecipeData, RecipeStatus

KNOWLEDGE = Path(__file__).resolve().parent.parent / "knowledge" / "cafe"


def guide(body: str, title: str = "Guia") -> ParsedDocument:
    return ParsedDocument(Path("g.md"), "guide", title, RecipeStatus.VALIDATED, None, None, body, {})


def recipe(body: str, name: str = "V60 base") -> ParsedDocument:
    data = RecipeData(name=name, method="v60")
    return ParsedDocument(Path("r.md"), "recipe", name, RecipeStatus.TESTING, "v60-base", data, body, {"type": "recipe"})


def test_recipe_is_one_chunk_with_title_first_and_no_frontmatter() -> None:
    body = "# V60 base\n\n## Pasos\n" + "- paso largo\n" * 400
    chunks = chunk_document(recipe(body), max_chars=100)
    assert len(chunks) == 1
    assert chunks[0].embed_text.startswith("V60 base\n\n# V60 base")
    assert "type: recipe" not in chunks[0].embed_text
    assert chunks[0].heading_path == "V60 base"


def test_guide_splits_at_h2_and_drops_h1_and_keeps_intro() -> None:
    chunks = chunk_document(guide("# Guia\n\nIntro.\n\n## A\nuno\n\n## B\ndos"))
    assert [(c.heading_path, c.text) for c in chunks] == [
        ("Guia", "Intro."),
        ("Guia > A", "uno"),
        ("Guia > B", "dos"),
    ]
    assert chunks[1].embed_text == "Guia\nGuia > A\n\nuno"
    assert all("# Guia" not in c.text for c in chunks)


def test_long_h2_splits_at_h3() -> None:
    body = "## S\nintro\n\n### X\n" + "x" * 30 + "\n\n### Y\n" + "y" * 30
    chunks = chunk_document(guide(body), max_chars=50)
    assert [c.heading_path for c in chunks] == ["Guia > S", "Guia > S > X", "Guia > S > Y"]


def test_long_section_splits_only_on_blank_lines_and_keeps_table_whole() -> None:
    table = "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |"
    paragraphs = [f"p{i} " + "w" * 40 for i in range(6)]
    paragraphs.insert(3, table)
    chunks = chunk_document(guide("## S\n" + "\n\n".join(paragraphs)), max_chars=120)
    assert len(chunks) > 1
    rebuilt = [p for c in chunks for p in c.text.split("\n\n")]
    assert rebuilt == paragraphs
    assert any(table in c.text for c in chunks)
    assert all(len(c.text) <= 120 for c in chunks)


def test_single_huge_paragraph_stays_whole() -> None:
    huge = "z" * 5000
    chunks = chunk_document(guide(f"## S\n{huge}"), max_chars=100)
    assert [c.text for c in chunks] == [huge]


def test_tiny_max_chars_terminates() -> None:
    chunks = chunk_document(guide("## S\none\n\ntwo\n\nthree"), max_chars=1)
    assert [c.text for c in chunks] == ["one", "two", "three"]


def test_meta_and_ordinals() -> None:
    chunks = chunk_document(guide("intro\n\n## A\nx\n\n## B\ny", title="T"))
    assert [c.ordinal for c in chunks] == [0, 1, 2]
    assert all(c.meta == {"type": "guide", "status": "validated", "recipe_id": None, "title": "T"} for c in chunks)
    (r,) = chunk_document(recipe("cuerpo"))
    assert r.meta == {"type": "recipe", "status": "testing", "recipe_id": "v60-base", "title": "V60 base"}


def test_hashes_are_stable_and_sensitive() -> None:
    body = "## A\nhola"
    base = chunk_document(guide(body))[0].content_hash
    assert base == chunk_document(guide(body))[0].content_hash
    assert base != chunk_document(guide("## A\nholb"))[0].content_hash
    assert base != chunk_document(guide(body, title="Otra"))[0].content_hash
    assert base != chunk_document(guide("## C\nhola"))[0].content_hash


def test_empty_body_gives_no_chunks() -> None:
    assert chunk_document(guide("")) == []
    assert chunk_document(guide("# Guia\n\n## Vacia\n")) == []
    assert chunk_document(recipe("  \n")) == []


def test_normalizes_whitespace() -> None:
    (c,) = chunk_document(guide("## A\nuno   \n\n\n\n\ndos"))
    assert c.text == "uno\n\ndos"


def test_corpus() -> None:
    docs = [parse_document(p) for p in sorted(KNOWLEDGE.rglob("*.md"))]
    assert docs
    hashes: list[str] = []
    for doc in docs:
        chunks = chunk_document(doc)
        assert chunks, doc.path
        assert [c.ordinal for c in chunks] == list(range(len(chunks)))
        for c in chunks:
            assert c.text.strip() and c.embed_text.startswith(doc.title)
        hashes += [c.content_hash for c in chunks]
        if doc.type == "recipe":
            joined = "\n".join(c.text for c in chunks)
            assert set(re.findall(r"\d+(?:[.,]\d+)?", doc.body)) <= set(re.findall(r"\d+(?:[.,]\d+)?", joined)), doc.path
    assert len(hashes) == len(set(hashes))
