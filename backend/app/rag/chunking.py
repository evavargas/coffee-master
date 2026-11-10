"""Splits parsed knowledge documents into chunks for embedding and retrieval.

Only the title and the body are embedded, never the frontmatter (it duplicates the body).
There is no overlap between chunks: documents are small and every section is self-contained.
"""

import hashlib
import re
from dataclasses import dataclass
from typing import Any

from app.rag.frontmatter import ParsedDocument

_H1 = re.compile(r"^# .*(?:\n|\Z)", re.MULTILINE)
_H2_SPLIT = re.compile(r"^## +(.*?)[ \t]*$", re.MULTILINE)
_H3_SPLIT = re.compile(r"^### +(.*?)[ \t]*$", re.MULTILINE)
_BLANK_RUNS = re.compile(r"\n{3,}")
_PARAGRAPH_BREAK = re.compile(r"\n\n+")


@dataclass(frozen=True)
class Chunk:
    ordinal: int
    heading_path: str
    text: str
    embed_text: str
    content_hash: str
    meta: dict[str, Any]


def _normalize(text: str) -> str:
    lines = "\n".join(line.rstrip() for line in text.splitlines())
    return _BLANK_RUNS.sub("\n\n", lines).strip()


def _split_headings(text: str, pattern: re.Pattern[str]) -> tuple[str, list[tuple[str, str]]]:
    """Returns (text before the first heading, [(heading, body)])."""
    parts = pattern.split(text)
    return parts[0], [(parts[i], parts[i + 1]) for i in range(1, len(parts), 2)]


def _pack_paragraphs(text: str, max_chars: int) -> list[str]:
    """Greedily packs whole paragraphs up to max_chars; never cuts inside a paragraph, list or table."""
    # shortcut: a single paragraph larger than max_chars is not split, revisit if the knowledge ever has one
    packed: list[str] = []
    current = ""
    for paragraph in _PARAGRAPH_BREAK.split(text):
        if current and len(current) + 2 + len(paragraph) > max_chars:
            packed.append(current)
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}" if current else paragraph
    if current:
        packed.append(current)
    return packed


def _guide_pieces(title: str, body: str, max_chars: int) -> list[tuple[str, str]]:
    """Returns [(heading_path, text)] for a guide body, in document order."""
    intro, sections = _split_headings(_H1.sub("", _normalize(body), count=1), _H2_SPLIT)
    pieces = [(title, intro)]
    for h2, section in sections:
        path = f"{title} > {h2}"
        section = section.strip()
        if len(section) <= max_chars:
            pieces.append((path, section))
            continue
        h2_intro, subsections = _split_headings(section, _H3_SPLIT)
        pieces.append((path, h2_intro))
        pieces.extend((f"{path} > {h3}", sub) for h3, sub in subsections)
    result: list[tuple[str, str]] = []
    for path, text in pieces:
        text = text.strip()
        if len(text) <= max_chars:
            result.append((path, text))
        else:
            result.extend((path, part) for part in _pack_paragraphs(text, max_chars))
    return result


def _pieces(doc: ParsedDocument, max_chars: int) -> list[tuple[str, str]]:
    if doc.type == "recipe":
        return [(doc.title, _normalize(doc.body))]
    return _guide_pieces(doc.title, doc.body, max_chars)


def chunk_document(doc: ParsedDocument, *, max_chars: int = 1500) -> list[Chunk]:
    meta = {
        "type": doc.type,
        "status": str(doc.status),
        "recipe_id": doc.id if doc.type == "recipe" else None,
        "title": doc.title,
    }
    chunks: list[Chunk] = []
    for path, text in _pieces(doc, max_chars):
        if not text:
            continue
        header = f"{doc.title}\n{path}" if doc.type == "guide" else doc.title
        embed_text = f"{header}\n\n{text}"
        chunks.append(
            Chunk(
                ordinal=len(chunks),
                heading_path=path,
                text=text,
                embed_text=embed_text,
                content_hash=hashlib.sha256(embed_text.encode("utf-8")).hexdigest(),
                meta=dict(meta),
            )
        )
    return chunks
