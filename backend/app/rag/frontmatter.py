"""Parses the YAML frontmatter of knowledge documents (recipes and guides)."""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, NamedTuple

import yaml
from pydantic import ValidationError

from app.schemas.recipe import RecipeData, RecipeStatus

ID_PATTERN = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
ID_MAX_LENGTH = 120
_FRONTMATTER = re.compile(r"\A---[ \t]*\r?\n(.*?)^---[ \t]*(?:\r?\n|\Z)", re.DOTALL | re.MULTILINE)


_YAML_ERRORS = (yaml.YAMLError, ValueError, RecursionError)  # safe_load raises ValueError on e.g. 2023-99-99


class FrontmatterError(ValueError):
    """Invalid knowledge document; the message starts with the file path."""


@dataclass(frozen=True)
class ParsedDocument:
    path: Path
    type: Literal["recipe", "guide"]
    title: str
    status: RecipeStatus
    id: str | None
    recipe: RecipeData | None
    body: str
    meta: dict[str, Any]


class SplitResult(NamedTuple):
    meta: dict[str, Any] | None
    body: str
    malformed: bool  # a frontmatter block exists but is not a valid mapping


def _split_raw(text: str) -> tuple[str | None, str]:
    """Returns (raw YAML, body), or (None, text) when there is no frontmatter block."""
    text = text.removeprefix("\ufeff")
    match = _FRONTMATTER.match(text)
    if match is None:
        return None, text
    return match.group(1), text[match.end():].strip()


def split_frontmatter(text: str) -> SplitResult:
    """Tolerant split, never raises. A malformed block is stripped from the body and flagged."""
    raw, body = _split_raw(text)
    if raw is None:
        return SplitResult(None, body, False)
    try:
        meta = yaml.safe_load(raw)
    except _YAML_ERRORS:
        return SplitResult(None, body, True)
    return SplitResult(meta, body, False) if isinstance(meta, dict) else SplitResult(None, body, True)


def parse_document(path: Path) -> ParsedDocument:
    """Strict parse; raises FrontmatterError on any problem."""
    def fail(reason: str) -> FrontmatterError:
        return FrontmatterError(f"{path}: {reason}")

    raw, body = _split_raw(path.read_text(encoding="utf-8"))
    if raw is None:
        raise fail("missing frontmatter")
    try:
        meta = yaml.safe_load(raw)
    except _YAML_ERRORS as exc:
        raise fail(f"invalid YAML: {exc}") from exc
    if not isinstance(meta, dict):
        raise fail("frontmatter must be a mapping")

    doc_type = meta.get("type")
    if doc_type not in ("recipe", "guide"):
        raise fail(f"unknown or missing type: {doc_type!r}")
    try:
        status = RecipeStatus(meta.get("status", RecipeStatus.VALIDATED if doc_type == "guide" else None))
    except (ValueError, TypeError) as exc:
        raise fail(f"invalid or missing status: {meta.get('status')!r}") from exc

    if doc_type == "guide":
        title = meta.get("title")
        if not isinstance(title, str) or not title.strip():
            raise fail("guide requires a title")
        return ParsedDocument(path, "guide", title, status, None, None, body, meta)

    doc_id = meta.get("id")
    if not isinstance(doc_id, str) or len(doc_id) > ID_MAX_LENGTH or not ID_PATTERN.fullmatch(doc_id):
        raise fail(f"invalid or missing id: {doc_id!r}")
    data = {k: v for k, v in meta.items() if k not in ("type", "id", "status")}
    try:
        recipe = RecipeData.model_validate(data)
    except ValidationError as exc:
        raise fail(f"invalid recipe: {exc}") from exc
    return ParsedDocument(path, "recipe", recipe.name, status, doc_id, recipe, body, meta)
