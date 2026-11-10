"""Deterministic stand-in for the embedding provider. Never touches the network."""

import hashlib
import struct
from collections.abc import Callable
from typing import Literal


class FakeEmbeddingProvider:
    def __init__(
        self,
        dimensions: int = 1024,
        vectors: dict[str, list[float]] | None = None,
        error: Exception | None = None,
        errors_for: dict[str, Exception] | None = None,
        on_embed: Callable[[], None] | None = None,
        model_id: str | None = None,
    ) -> None:
        self.dimensions = dimensions
        self.model_id = model_id  # None behaves like a provider that does not expose its model
        self.vectors = vectors or {}
        self.error = error
        self.errors_for = errors_for or {}  # raise when any text contains the key
        self.on_embed = on_embed  # runs at the start of every call, so a test can inspect state during the call
        self.calls: list[dict] = []

    def embed(self, texts: list[str], *, kind: Literal["document", "query"]) -> list[list[float]]:
        self.calls.append({"texts": list(texts), "kind": kind})
        if self.on_embed is not None:
            self.on_embed()
        if self.error is not None:
            raise self.error
        for needle, exc in self.errors_for.items():
            if any(needle in t for t in texts):
                raise exc
        return [self.vectors[t] if t in self.vectors else self._hash_vector(t) for t in texts]

    def _hash_vector(self, text: str) -> list[float]:
        # Stretch a SHA-256 stream into `dimensions` floats in [0, 1).
        out: list[float] = []
        counter = 0
        while len(out) < self.dimensions:
            digest = hashlib.sha256(f"{counter}:{text}".encode()).digest()
            out.extend(n / 2**32 for n in struct.unpack(">8I", digest))
            counter += 1
        return out[: self.dimensions]
