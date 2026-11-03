"""Loads the coffee knowledge base (the agent's memory) from knowledge/cafe/**/*.md.

Raw sources in knowledge/_fuentes/ are outside cafe/ and are never loaded.
"""

from functools import lru_cache
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parents[3] / "knowledge" / "cafe"


@lru_cache(maxsize=1)
def load_coffee_knowledge() -> str:
    files = sorted(KNOWLEDGE_DIR.rglob("*.md"))
    if not files:
        raise RuntimeError(f"No coffee documents found in {KNOWLEDGE_DIR}")
    sections = [
        f"## Document: {f.relative_to(KNOWLEDGE_DIR).as_posix()}\n\n{f.read_text(encoding='utf-8').strip()}"
        for f in files
    ]
    return "\n\n---\n\n".join(sections)
