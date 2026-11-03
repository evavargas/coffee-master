"""Defenses against prompt injection.

User-controlled text is treated as data: it is validated and sanitized here
before it reaches the model, and the model's output is checked for leaks of
internal prompt markers before it reaches the client.
See .claude/skills/prompt-injection-guard for the full rule set.
"""

import logging
import re
import unicodedata

logger = logging.getLogger(__name__)

NAME_MAX_LENGTH = 60
MESSAGE_MAX_LENGTH = 4000
GENERIC_GREETING_NAME = "usuario"

# Letters (any script), spaces, hyphens and apostrophes. Anything else is dropped.
_ALLOWED_NAME_CHARS = re.compile(r"[^\w \-']", re.UNICODE)

# Markers that must never appear in a reply: they belong to the internal prompt.
_INTERNAL_MARKERS = ("<user_profile>", "</user_profile>", "## Document:", "# Coffee knowledge base")

SAFE_LEAK_REPLY = (
    "No puedo compartir mi configuración interna. "
    "Sí puedo ayudarte con recetas, ratios y diagnóstico de café."
)


def strip_unsafe_characters(text: str) -> str:
    """Remove control, format (e.g. bidi overrides) and private-use characters, keeping newlines and tabs."""
    cleaned = []
    for char in text:
        if char in "\n\t":
            cleaned.append(char)
            continue
        category = unicodedata.category(char)
        if category.startswith("C") or category == "Co":
            continue
        cleaned.append(char)
    return "".join(cleaned)


def sanitize_message(text: str) -> str:
    return strip_unsafe_characters(text).strip()[:MESSAGE_MAX_LENGTH]


def sanitize_user_name(raw_name: str) -> str:
    """Return a name safe to place in the prompt, or a generic fallback."""
    name = strip_unsafe_characters(raw_name)
    name = _ALLOWED_NAME_CHARS.sub("", name)
    name = re.sub(r"\s+", " ", name).strip()[:NAME_MAX_LENGTH]
    return name or GENERIC_GREETING_NAME


def guard_output(reply: str) -> str:
    """Replace the reply if it leaks internal prompt markers."""
    lowered = reply.lower()
    if any(marker.lower() in lowered for marker in _INTERNAL_MARKERS):
        logger.warning("Blocked a model reply that contained internal prompt markers")
        return SAFE_LEAK_REPLY
    return reply
