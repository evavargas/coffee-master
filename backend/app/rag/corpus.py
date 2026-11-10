"""Loads and chunks the knowledge folder. Imports no database, settings or web code, so `--dry-run` needs no secrets."""

import hashlib
from dataclasses import dataclass
from pathlib import Path

from app.rag.chunking import Chunk, chunk_document
from app.rag.frontmatter import FrontmatterError, ParsedDocument, parse_document


class IngestError(Exception):
    """Invalid knowledge (missing or empty root, unparsable file, duplicate recipe id); the message names the paths."""


@dataclass(frozen=True)
class KnowledgeItem:
    key: str  # path relative to the root, as POSIX text
    doc: ParsedDocument
    content_hash: str
    chunks: list[Chunk]


def load_knowledge(root: Path) -> list[KnowledgeItem]:
    """Parses and chunks every markdown file under root; raises IngestError listing every offending path."""
    if not root.is_dir():
        raise IngestError(f"Knowledge root is missing or not a folder: {root}")
    paths = sorted(root.rglob("*.md"))
    if not paths:
        raise IngestError(f"Knowledge root is empty (no .md files): {root}")
    items: list[KnowledgeItem] = []
    errors: list[str] = []
    recipe_files: dict[str, list[str]] = {}
    for path in paths:
        key = path.relative_to(root).as_posix()
        try:
            doc = parse_document(path)
        except FrontmatterError as exc:
            errors.append(str(exc))
            continue
        except UnicodeDecodeError:
            errors.append(f"{path}: not valid UTF-8")
            continue
        if doc.id is not None:
            recipe_files.setdefault(doc.id, []).append(key)
        content_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        items.append(KnowledgeItem(key, doc, content_hash, chunk_document(doc)))
    errors.extend(f"duplicate recipe id {rid!r}: {', '.join(keys)}" for rid, keys in recipe_files.items() if len(keys) > 1)
    if errors:
        raise IngestError("Invalid knowledge:\n" + "\n".join(errors))
    return items
