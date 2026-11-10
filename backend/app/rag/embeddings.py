"""Text embeddings through Amazon Bedrock (Cohere models only).

The client is synchronous (boto3). Async callers use `app.rag.retrieval.retrieve_with_timeout`
(it enforces the 8-thread cap and the timeout). Nothing here touches AWS at import or
construction time: the boto3 client is built on the first `embed` call.
"""

import json
import math
import threading
import time
from collections.abc import Callable
from typing import Any, Literal, Protocol

from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    CredentialRetrievalError,
    InvalidRegionError,
    NoCredentialsError,
    NoRegionError,
    ParamValidationError,
    PartialCredentialsError,
)

Kind = Literal["document", "query"]

MAX_BATCH = 96
V4_MODEL = "cohere.embed-v4:0"
V3_MODEL = "cohere.embed-multilingual-v3"
# Bedrock only serves some models through a cross-region inference profile: the model id with a geo prefix.
PROFILE_PREFIXES = ("us.", "eu.", "apac.", "global.")
V3_DIMENSIONS = 1024
_INPUT_TYPES: dict[str, str] = {"document": "search_document", "query": "search_query"}
_RETRIED_MODEL_ERRORS = {"ModelTimeoutException", "ModelErrorException", "ModelNotReadyException"}
_TRANSIENT_CODES = {
    "ThrottlingException",
    "ServiceUnavailableException",
    "InternalServerException",
    "Throttling",
    "TooManyRequestsException",
    "RequestTimeout",
    "RequestTimeoutException",
    "ServiceUnavailable",
    "InternalFailure",
    "ModelStreamErrorException",
} | _RETRIED_MODEL_ERRORS
_QUOTA_CODE = "ServiceQuotaExceededException"
_TRANSIENT_STATUSES = {408, 429}
_CONFIG_ERRORS = (
    NoCredentialsError,
    PartialCredentialsError,
    CredentialRetrievalError,
    NoRegionError,
    InvalidRegionError,
)
# Online queries get a short budget; documents (offline ingestion) can wait longer.
_CLIENT_SETTINGS: dict[str, tuple[int, int]] = {"query": (2, 5), "document": (3, 10)}  # attempts, read timeout
_FATAL_CODES = {"AccessDeniedException", "ValidationException", "ResourceNotFoundException"}
_EXTRA_ATTEMPTS = 2  # provider-level retries, documents only
_BACKOFF_BASE_SECONDS = 0.5


class EmbeddingError(Exception):
    """Base class for embedding failures."""


class EmbeddingUnavailableError(EmbeddingError):
    """Transient failures (throttling, timeouts, outages) that outlasted the retries."""


class EmbeddingConfigurationError(EmbeddingError):
    """Fatal problems: access, model id, region, credentials or response shape."""


class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str], *, kind: Kind) -> list[list[float]]:
        """One vector per text, in the same order."""
        ...


class BedrockEmbeddingProvider:
    def __init__(
        self,
        model_id: str,
        region: str,
        dimensions: int,
        client: Any | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        base = next((model_id[len(p) :] for p in PROFILE_PREFIXES if model_id.startswith(p)), model_id)
        if base not in (V4_MODEL, V3_MODEL):
            raise EmbeddingConfigurationError(f"Unsupported embedding model id: {model_id}.")
        if base == V3_MODEL and dimensions != V3_DIMENSIONS:
            raise EmbeddingConfigurationError(f"{V3_MODEL} has a fixed dimension of {V3_DIMENSIONS}.")
        self.model_id = model_id  # the id invoked, profile prefix included
        self._base = base
        self.region = region
        self.dimensions = dimensions
        self._injected_client = client
        self._clients: dict[str, Any] = {}
        self._client_lock = threading.Lock()
        self._sleep = sleep

    def embed(self, texts: list[str], *, kind: Kind) -> list[list[float]]:
        if any(not t for t in texts):
            raise ValueError("Cannot embed an empty text.")
        vectors: list[list[float]] = []
        for start in range(0, len(texts), MAX_BATCH):
            vectors.extend(self._embed_batch(texts[start : start + MAX_BATCH], kind))
        return vectors

    def _get_client(self, kind: Kind) -> Any:
        if self._injected_client is not None:
            return self._injected_client
        if kind not in self._clients:
            with self._client_lock:  # double-checked: embed runs in several worker threads
                if kind not in self._clients:
                    self._clients[kind] = self._create_client(kind)
        return self._clients[kind]

    def _create_client(self, kind: Kind) -> Any:
        import boto3
        from botocore.config import Config

        attempts, read_timeout = _CLIENT_SETTINGS[kind]
        return boto3.client(
            "bedrock-runtime",
            region_name=self.region,
            config=Config(
                retries={"mode": "standard", "total_max_attempts": attempts},
                connect_timeout=2,
                read_timeout=read_timeout,
            ),
        )

    def _request_body(self, texts: list[str], kind: Kind) -> str:
        body: dict[str, Any] = {"texts": texts, "input_type": _INPUT_TYPES[kind], "truncate": "NONE"}
        if self._base == V4_MODEL:
            body.update(embedding_types=["float"], output_dimension=self.dimensions)
        return json.dumps(body)

    def _embed_batch(self, texts: list[str], kind: Kind) -> list[list[float]]:
        body = self._request_body(texts, kind)
        extra_attempts = _EXTRA_ATTEMPTS if kind == "document" else 0
        for attempt in range(extra_attempts + 1):
            try:
                response = self._get_client(kind).invoke_model(
                    modelId=self.model_id, body=body, contentType="application/json", accept="application/json"
                )
                raw = _read_body(response)
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "")
                if code in _RETRIED_MODEL_ERRORS and attempt < extra_attempts:
                    self._sleep(_BACKOFF_BASE_SECONDS * 2**attempt)
                    continue
                raise _translate(exc, code) from exc
            except ParamValidationError as exc:  # a request-shape bug on our side
                raise EmbeddingConfigurationError(
                    f"The request sent to Amazon Bedrock was rejected locally as malformed (a bug in the request builder): {exc}"
                ) from exc
            except _CONFIG_ERRORS as exc:  # before BotoCoreError; InvalidRegionError is also a ValueError
                raise EmbeddingConfigurationError(
                    "AWS credentials or region are missing or invalid; configure the boto3 default credential chain."
                ) from exc
            except BotoCoreError as exc:
                raise EmbeddingUnavailableError(f"Could not get a response from Amazon Bedrock ({type(exc).__name__}).") from exc
            return self._parse(raw, len(texts))
        raise AssertionError("unreachable")  # the loop always returns or raises

    def _parse(self, raw: bytes, expected: int) -> list[list[float]]:
        try:
            payload = json.loads(raw)
        except (ValueError, RecursionError) as exc:  # invalid JSON, bad UTF-8, int digit limit, absurd nesting
            raise EmbeddingUnavailableError("Amazon Bedrock returned a truncated or invalid body.") from exc
        try:
            embeddings = payload["embeddings"]
            if isinstance(embeddings, dict):
                embeddings = embeddings["float"]
        except (KeyError, TypeError) as exc:
            raise EmbeddingConfigurationError("Unexpected embedding response shape.") from exc
        if not isinstance(embeddings, list) or len(embeddings) != expected:
            raise EmbeddingConfigurationError("The number of returned vectors does not match the number of texts.")
        for vector in embeddings:
            if not isinstance(vector, list) or len(vector) != self.dimensions:
                raise EmbeddingConfigurationError(
                    f"Returned vector dimension does not match the configured {self.dimensions}."
                )
            if not all(_is_finite_number(x) for x in vector):
                raise EmbeddingConfigurationError("Returned vectors contain non-numeric or non-finite values.")
        return embeddings


def _read_body(response: Any) -> bytes:
    try:
        raw = response["body"].read()
    except (KeyError, TypeError, AttributeError) as exc:
        raise EmbeddingConfigurationError("Unexpected response from Amazon Bedrock (no readable body).") from exc
    if not isinstance(raw, (bytes, bytearray, str)):
        raise EmbeddingConfigurationError("Amazon Bedrock returned a body that is not text or bytes.")
    return raw


def _is_finite_number(value: Any) -> bool:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:  # an int too large for a float is not a usable embedding value
        return False


def _translate(exc: ClientError, code: str) -> EmbeddingError:
    if code == "AccessDeniedException":
        return EmbeddingConfigurationError(
            "Access denied by Amazon Bedrock. Check the IAM policy; for about 15 minutes after the first use "
            "of a Cohere model it can also be the AWS Marketplace subscription still completing."
        )
    if code in _FATAL_CODES:
        return EmbeddingConfigurationError(f"Amazon Bedrock rejected the request ({code}).")
    if code == _QUOTA_CODE:
        return EmbeddingUnavailableError("The Amazon Bedrock service quota is exceeded; retry later.")
    if code in _TRANSIENT_CODES:
        return EmbeddingUnavailableError(f"Amazon Bedrock is temporarily unavailable ({code}).")
    status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    if isinstance(status, int) and (status in _TRANSIENT_STATUSES or status >= 500):
        return EmbeddingUnavailableError(f"Amazon Bedrock is temporarily unavailable ({code or 'unknown'}, HTTP {status}).")
    return EmbeddingConfigurationError(f"Amazon Bedrock rejected the request ({code or 'unknown'}).")
