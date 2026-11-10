"""Loads the coffee knowledge base (the agent's memory) from backend/knowledge/cafe/**/*.md.

Raw sources in knowledge/_fuentes/ are outside cafe/ and are never loaded.
This is the fallback prompt, so a malformed file must never make it raise.
"""

from functools import lru_cache
from pathlib import Path

from app.rag.frontmatter import split_frontmatter
from app.schemas.recipe import RecipeStatus

KNOWLEDGE_DIR = Path(__file__).resolve().parents[2] / "knowledge" / "cafe"

_STATUS_LINES = {
    RecipeStatus.TESTING.value: "Estado: en prueba, no recomendar como validada",
    RecipeStatus.NOT_RECOMMENDED.value: "Estado: no recomendada, no la sugieras",
}


_UNVERIFIED_LINE = "Estado: sin verificar, no recomendar como validada"


def _render(path: Path) -> str:
    meta, body, malformed = split_frontmatter(path.read_text(encoding="utf-8"))
    header = f"## Document: {path.relative_to(KNOWLEDGE_DIR).as_posix()}"
    status = meta.get("status") if meta else None
    status_line = _STATUS_LINES.get(status) if isinstance(status, str) else None
    if malformed:
        status_line = _UNVERIFIED_LINE
    if status_line:
        header += f"\n{status_line}"
    return f"{header}\n\n{body.strip()}"


@lru_cache(maxsize=1)
def load_coffee_knowledge() -> str:
    files = sorted(KNOWLEDGE_DIR.rglob("*.md"))
    if not files:
        raise RuntimeError(f"No coffee documents found in {KNOWLEDGE_DIR}")
    return "\n\n---\n\n".join(_render(f) for f in files)
