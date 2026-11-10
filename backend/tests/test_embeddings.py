"""Embedding provider tests. A fake bedrock-runtime client is injected: no AWS, no network."""

import io
import json
import subprocess
import sys

import pytest
from botocore.exceptions import (
    ClientError,
    ConnectionClosedError,
    ConnectTimeoutError,
    CredentialRetrievalError,
    EndpointConnectionError,
    EndpointResolutionError,
    InvalidRegionError,
    NoCredentialsError,
    NoRegionError,
    ParamValidationError,
    PartialCredentialsError,
    ReadTimeoutError,
    ResponseStreamingError,
)

from app.rag.embeddings import (
    BedrockEmbeddingProvider,
    EmbeddingConfigurationError,
    EmbeddingUnavailableError,
)
from tests.fake_embeddings import FakeEmbeddingProvider

V4 = "cohere.embed-v4:0"
V3 = "cohere.embed-multilingual-v3"


class FakeBedrock:
    """Replays scripted outcomes (exceptions are raised); by default answers `dims` floats per text."""

    def __init__(self, dims: int = 4, outcomes: list | None = None, shape: str = "list") -> None:
        self.dims = dims
        self.outcomes = list(outcomes or [])
        self.shape = shape
        self.calls: list[dict] = []

    def invoke_model(self, **kwargs):
        self.calls.append(kwargs)
        if self.outcomes:
            outcome = self.outcomes.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            body = outcome
        else:
            texts = json.loads(kwargs["body"])["texts"]
            vectors = [[float(len(t))] * self.dims for t in texts]
            body = {"embeddings": {"float": vectors} if self.shape == "dict" else vectors}
        return {"body": io.BytesIO(json.dumps(body).encode())}

    def body(self, index: int = 0) -> dict:
        return json.loads(self.calls[index]["body"])


def client_error(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "boom"}}, "InvokeModel")


@pytest.fixture
def sleeps(monkeypatch) -> list[float]:
    return []


def make(client, model=V4, dims=4, sleeps=None) -> BedrockEmbeddingProvider:
    return BedrockEmbeddingProvider(
        model, "us-east-1", dims, client=client, sleep=(sleeps.append if sleeps is not None else lambda s: None)
    )


# request shape

def test_v4_request_shape_document() -> None:
    fake = FakeBedrock()
    make(fake).embed(["hola"], kind="document")
    call = fake.calls[0]
    assert call["modelId"] == V4
    assert call["contentType"] == "application/json" and call["accept"] == "application/json"
    assert fake.body() == {
        "texts": ["hola"],
        "input_type": "search_document",
        "truncate": "NONE",
        "embedding_types": ["float"],
        "output_dimension": 4,
    }


def test_query_kind_maps_to_search_query() -> None:
    fake = FakeBedrock()
    make(fake).embed(["hola"], kind="query")
    assert fake.body()["input_type"] == "search_query"


def test_v3_sends_neither_embedding_types_nor_output_dimension() -> None:
    fake = FakeBedrock(dims=1024)
    make(fake, model=V3, dims=1024).embed(["hola"], kind="document")
    assert fake.body() == {"texts": ["hola"], "input_type": "search_document", "truncate": "NONE"}


def test_200_texts_split_in_batches_keeping_order() -> None:
    fake = FakeBedrock()
    texts = ["x" * (i + 1) for i in range(200)]
    vectors = make(fake).embed(texts, kind="document")
    assert [len(json.loads(c["body"])["texts"]) for c in fake.calls] == [96, 96, 8]
    assert [v[0] for v in vectors] == [float(i + 1) for i in range(200)]


def test_empty_list_makes_no_call() -> None:
    fake = FakeBedrock()
    assert make(fake).embed([], kind="query") == []
    assert fake.calls == []


def test_empty_string_text_raises_value_error() -> None:
    fake = FakeBedrock()
    with pytest.raises(ValueError):
        make(fake).embed(["ok", ""], kind="document")
    assert fake.calls == []


# response parsing

def test_dict_by_type_response_is_parsed() -> None:
    vectors = make(FakeBedrock(shape="dict")).embed(["ab", "c"], kind="query")
    assert vectors == [[2.0] * 4, [1.0] * 4]


def test_wrong_vector_count_raises() -> None:
    fake = FakeBedrock(outcomes=[{"embeddings": [[0.1] * 4]}])
    with pytest.raises(EmbeddingConfigurationError):
        make(fake).embed(["a", "b"], kind="query")


def test_wrong_dimension_raises() -> None:
    fake = FakeBedrock(outcomes=[{"embeddings": [[0.1] * 3]}])
    with pytest.raises(EmbeddingConfigurationError):
        make(fake).embed(["a"], kind="query")


# retries

@pytest.mark.parametrize("code", ["ThrottlingException", "ServiceUnavailableException", "InternalServerException"])
def test_transient_codes_that_reach_the_provider_end_as_unavailable(code) -> None:
    fake = FakeBedrock(outcomes=[client_error(code)])
    with pytest.raises(EmbeddingUnavailableError):
        make(fake).embed(["a"], kind="query")


def test_connection_timeout_ends_as_unavailable() -> None:
    fake = FakeBedrock(outcomes=[ConnectTimeoutError(endpoint_url="https://x")])
    with pytest.raises(EmbeddingUnavailableError):
        make(fake).embed(["a"], kind="query")


@pytest.mark.parametrize("code", ["ModelTimeoutException", "ModelErrorException", "ModelNotReadyException"])
def test_model_errors_retried_twice_then_unavailable(code, sleeps) -> None:
    fake = FakeBedrock(outcomes=[client_error(code)] * 3)
    with pytest.raises(EmbeddingUnavailableError):
        make(fake, sleeps=sleeps).embed(["a"], kind="document")
    assert len(fake.calls) == 3
    assert len(sleeps) == 2


def test_model_timeout_succeeds_on_third_attempt_with_growing_sleeps(sleeps) -> None:
    fake = FakeBedrock(outcomes=[client_error("ModelTimeoutException")] * 2)
    vectors = make(fake, sleeps=sleeps).embed(["a"], kind="document")
    assert len(fake.calls) == 3 and vectors == [[1.0] * 4]
    assert sleeps == [0.5, 1.0]


@pytest.mark.parametrize("code", ["AccessDeniedException", "ValidationException", "ResourceNotFoundException"])
def test_fatal_codes_are_not_retried(code) -> None:
    fake = FakeBedrock(outcomes=[client_error(code), client_error(code)])
    with pytest.raises(EmbeddingConfigurationError) as info:
        make(fake).embed(["a"], kind="query")
    assert len(fake.calls) == 1
    if code == "AccessDeniedException":
        assert "Marketplace" in str(info.value)


@pytest.mark.parametrize("error", [NoCredentialsError(), NoRegionError()])
def test_missing_credentials_or_region_are_configuration_errors(error) -> None:
    with pytest.raises(EmbeddingConfigurationError):
        make(FakeBedrock(outcomes=[error])).embed(["a"], kind="query")


# construction

def test_unsupported_model_id_raises() -> None:
    with pytest.raises(EmbeddingConfigurationError):
        BedrockEmbeddingProvider("amazon.titan-embed-text-v2:0", "us-east-1", 1024)


def test_inference_profile_id_is_invoked_as_is_with_the_v4_body() -> None:
    client = FakeBedrock(dims=1024)
    provider = BedrockEmbeddingProvider("us." + V4, "us-east-2", 1024, client=client, sleep=lambda s: None)
    provider.embed(["a"], kind="query")
    call = client.calls[0]
    assert call["modelId"] == "us." + V4
    assert json.loads(call["body"])["output_dimension"] == 1024


def test_v3_with_other_dimensions_raises() -> None:
    with pytest.raises(EmbeddingConfigurationError):
        BedrockEmbeddingProvider(V3, "us-east-1", 512)


def test_construction_and_import_build_no_boto3_client(monkeypatch) -> None:
    import boto3

    def boom(*args, **kwargs):
        raise AssertionError("boto3.client must not be called")

    monkeypatch.setattr(boto3, "client", boom)
    BedrockEmbeddingProvider(V4, "us-east-1", 1024)
    code = "import boto3\n" "boto3.client = lambda *a, **k: (_ for _ in ()).throw(AssertionError())\n" "import app.rag.embeddings\n"
    subprocess.run([sys.executable, "-c", code], check=True)


def test_lazy_clients_per_kind_use_region_argument_and_their_own_config(monkeypatch) -> None:
    import boto3

    seen: list[dict] = []

    def fake_client(service, **kwargs):
        seen.append(dict(service=service, **kwargs))
        return FakeBedrock(dims=1024)

    monkeypatch.setattr(boto3, "client", fake_client)
    monkeypatch.setenv("AWS_REGION", "eu-west-9")
    provider = BedrockEmbeddingProvider(V4, "us-east-1", 1024)
    assert seen == []
    provider.embed(["a"], kind="query")
    provider.embed(["a"], kind="query")
    provider.embed(["a"], kind="document")
    assert len(seen) == 2  # one client per kind, each built once
    query, document = (item["config"] for item in seen)
    assert all(i["service"] == "bedrock-runtime" and i["region_name"] == "us-east-1" for i in seen)
    assert query.retries == {"mode": "standard", "total_max_attempts": 2}
    assert (query.connect_timeout, query.read_timeout) == (2, 5)
    assert document.retries == {"mode": "standard", "total_max_attempts": 3}
    assert (document.connect_timeout, document.read_timeout) == (2, 10)


def test_factory_builds_from_settings_without_calling_aws(monkeypatch) -> None:
    import boto3

    from app.api import deps
    from app.core.config import Settings

    monkeypatch.setattr(boto3, "client", lambda *a, **k: (_ for _ in ()).throw(AssertionError()))
    settings = Settings(
        jwt_secret="x", embedding_model_id=V3, embedding_dimensions=1024, bedrock_region="eu-west-1"
    )
    monkeypatch.setattr(deps, "get_settings", lambda: settings)
    deps.get_embedding_provider.cache_clear()
    try:
        provider = deps.get_embedding_provider()
        assert isinstance(provider, BedrockEmbeddingProvider)
        assert (provider.model_id, provider.region, provider.dimensions) == (V3, "eu-west-1", 1024)
    finally:
        deps.get_embedding_provider.cache_clear()


# fake provider

def test_fake_is_deterministic_and_distinct() -> None:
    fake = FakeEmbeddingProvider(dimensions=8)
    a1, a2, b = fake.embed(["a", "a", "b"], kind="document")
    assert a1 == a2 != b and len(a1) == 8


def test_fake_records_calls_and_pins_vectors() -> None:
    fake = FakeEmbeddingProvider(dimensions=2, vectors={"pin": [1.0, 0.0]})
    assert fake.embed(["pin"], kind="query") == [[1.0, 0.0]]
    assert fake.calls == [{"texts": ["pin"], "kind": "query"}]


def test_fake_raises_injected_error() -> None:
    fake = FakeEmbeddingProvider(error=EmbeddingUnavailableError("down"))
    with pytest.raises(EmbeddingUnavailableError):
        fake.embed(["a"], kind="query")
    assert len(fake.calls) == 1


# fix round 1: latency, error mapping, classification, parsing

def test_query_kind_makes_one_call_and_no_sleep(sleeps) -> None:
    fake = FakeBedrock(outcomes=[client_error("ModelTimeoutException")] * 3)
    with pytest.raises(EmbeddingUnavailableError):
        make(fake, sleeps=sleeps).embed(["a"], kind="query")
    assert len(fake.calls) == 1 and sleeps == []


def test_document_kind_still_retries(sleeps) -> None:
    fake = FakeBedrock(outcomes=[client_error("ModelErrorException")])
    assert make(fake, sleeps=sleeps).embed(["a"], kind="document") == [[1.0] * 4]
    assert len(fake.calls) == 2 and sleeps == [0.5]


@pytest.mark.parametrize(
    "error",
    [
        PartialCredentialsError(provider="p", cred_var="k"),
        CredentialRetrievalError(provider="p", error_msg="m"),
        InvalidRegionError(region_name="bad region"),
    ],
)
def test_more_credential_and_region_errors_are_configuration_errors(error) -> None:
    fake = FakeBedrock(outcomes=[error])
    with pytest.raises(EmbeddingConfigurationError) as info:
        make(fake).embed(["a"], kind="query")
    assert info.value.__cause__ is error


@pytest.mark.parametrize(
    "error",
    [
        EndpointConnectionError(endpoint_url="https://x"),
        ConnectTimeoutError(endpoint_url="https://x"),
        ReadTimeoutError(endpoint_url="https://x"),
        ConnectionClosedError(endpoint_url="https://x"),
        EndpointResolutionError(msg="x"),
    ],
)
def test_other_botocore_errors_are_unavailable(error) -> None:
    fake = FakeBedrock(outcomes=[error])
    with pytest.raises(EmbeddingUnavailableError) as info:
        make(fake).embed(["a"], kind="query")
    assert info.value.__cause__ is error


def test_missing_body_key_is_a_configuration_error() -> None:
    class NoBody:
        def invoke_model(self, **kwargs):
            return {}

    with pytest.raises(EmbeddingConfigurationError):
        make(NoBody()).embed(["a"], kind="query")


def test_failing_body_read_is_unavailable() -> None:
    class BadStream:
        def read(self):
            raise ResponseStreamingError(error="cut")

    class Broken:
        def invoke_model(self, **kwargs):
            return {"body": BadStream()}

    with pytest.raises(EmbeddingUnavailableError):
        make(Broken()).embed(["a"], kind="query")


@pytest.mark.parametrize("code", ["Throttling", "TooManyRequestsException", "RequestTimeout", "RequestTimeoutException",
                                  "ServiceUnavailable", "InternalFailure", "ModelStreamErrorException"])
def test_extra_transient_names_are_unavailable(code) -> None:
    with pytest.raises(EmbeddingUnavailableError):
        make(FakeBedrock(outcomes=[client_error(code)])).embed(["a"], kind="query")


def client_error_status(code: str, status: int | None) -> ClientError:
    response: dict = {"Error": {"Code": code, "Message": "boom"}}
    if status is not None:
        response["ResponseMetadata"] = {"HTTPStatusCode": status}
    return ClientError(response, "InvokeModel")


@pytest.mark.parametrize("status", [408, 429, 500, 503])
def test_unknown_code_with_transient_status_is_unavailable(status) -> None:
    with pytest.raises(EmbeddingUnavailableError):
        make(FakeBedrock(outcomes=[client_error_status("WeirdThing", status)])).embed(["a"], kind="query")


@pytest.mark.parametrize("status", [400, 404, None])
def test_unknown_code_with_other_or_missing_status_is_configuration(status) -> None:
    with pytest.raises(EmbeddingConfigurationError) as info:
        make(FakeBedrock(outcomes=[client_error_status("WeirdThing", status)])).embed(["a"], kind="query")
    assert "WeirdThing" in str(info.value)


def test_known_fatal_code_wins_over_transient_status() -> None:
    with pytest.raises(EmbeddingConfigurationError):
        make(FakeBedrock(outcomes=[client_error_status("ValidationException", 500)])).embed(["a"], kind="query")


def test_quota_exceeded_message() -> None:
    with pytest.raises(EmbeddingUnavailableError, match="quota.*later"):
        make(FakeBedrock(outcomes=[client_error_status("ServiceQuotaExceededException", 400)])).embed(["a"], kind="query")


@pytest.mark.parametrize("bad", [True, None, "1.0", [1.0], float("nan"), float("inf")])
def test_non_numeric_or_non_finite_elements_raise(bad) -> None:
    body = json.dumps({"embeddings": [[0.1, 0.2, 0.3, bad]]}, allow_nan=True)
    fake = FakeBedrock(outcomes=[json.loads(body)])
    with pytest.raises(EmbeddingConfigurationError):
        make(fake).embed(["a"], kind="query")


def test_integers_are_accepted() -> None:
    fake = FakeBedrock(outcomes=[{"embeddings": [[1, 2, 3, 4]]}])
    assert make(fake).embed(["a"], kind="query") == [[1, 2, 3, 4]]


@pytest.mark.parametrize("raw", [b'{"embeddings": [[0.1', b"not json", b"\xff\xfe"])
def test_invalid_or_truncated_body_is_unavailable_and_not_retried_for_query(raw) -> None:
    class RawBedrock(FakeBedrock):
        def invoke_model(self, **kwargs):
            self.calls.append(kwargs)
            return {"body": io.BytesIO(raw)}

    fake = RawBedrock()
    with pytest.raises(EmbeddingUnavailableError):
        make(fake).embed(["a"], kind="query")
    assert len(fake.calls) == 1


@pytest.mark.parametrize("body", [{}, {"embeddings": "x"}, {"embeddings": {"int8": []}}, []])
def test_valid_json_with_wrong_structure_is_configuration_error(body) -> None:
    with pytest.raises(EmbeddingConfigurationError):
        make(FakeBedrock(outcomes=[body])).embed(["a"], kind="query")


# fix round 2

def test_huge_int_element_is_a_configuration_error_not_overflow() -> None:
    raw = ('{"embeddings": [[1' + "0" * 400 + ", 0.1, 0.2, 0.3]]}").encode()

    class RawBedrock(FakeBedrock):
        def invoke_model(self, **kwargs):
            return {"body": io.BytesIO(raw)}

    with pytest.raises(EmbeddingConfigurationError):
        make(RawBedrock()).embed(["a"], kind="query")


@pytest.mark.parametrize("raw", [b"[" * 1000000 + b"]" * 1000000, b'{"embeddings": [[1' + b"0" * 5000 + b"]]}"])
def test_pathological_json_bodies_are_unavailable(raw) -> None:
    class RawBedrock(FakeBedrock):
        def invoke_model(self, **kwargs):
            return {"body": io.BytesIO(raw)}

    with pytest.raises(EmbeddingUnavailableError):
        make(RawBedrock()).embed(["a"], kind="query")


def test_attribute_error_inside_invoke_model_propagates_unchanged() -> None:
    class Buggy:
        def invoke_model(self, **kwargs):
            raise AttributeError("bug in the client")

    with pytest.raises(AttributeError, match="bug in the client"):
        make(Buggy()).embed(["a"], kind="query")


def test_param_validation_error_is_a_configuration_error() -> None:
    error = ParamValidationError(report="bad param")
    with pytest.raises(EmbeddingConfigurationError) as info:
        make(FakeBedrock(outcomes=[error])).embed(["a"], kind="query")
    assert info.value.__cause__ is error


# fix round 3

class _Body:
    def __init__(self, value) -> None:
        self.value = value

    def read(self):
        return self.value


@pytest.mark.parametrize("value", [None, 5])
def test_non_text_body_value_is_a_configuration_error(value) -> None:
    class Odd:
        def invoke_model(self, **kwargs):
            return {"body": _Body(value)}

    with pytest.raises(EmbeddingConfigurationError, match="not text or bytes"):
        make(Odd()).embed(["a"], kind="query")


@pytest.mark.parametrize("response", [{}, {"body": object()}])
def test_missing_body_key_or_read_method_is_a_configuration_error(response) -> None:
    class Odd:
        def invoke_model(self, **kwargs):
            return response

    with pytest.raises(EmbeddingConfigurationError):
        make(Odd()).embed(["a"], kind="query")


def test_param_validation_and_credentials_have_their_own_messages() -> None:
    with pytest.raises(EmbeddingConfigurationError) as param:
        make(FakeBedrock(outcomes=[ParamValidationError(report="bad param")])).embed(["a"], kind="query")
    assert "malformed" in str(param.value) and "bad param" in str(param.value)
    assert "credential" not in str(param.value)
    with pytest.raises(EmbeddingConfigurationError) as creds:
        make(FakeBedrock(outcomes=[NoCredentialsError()])).embed(["a"], kind="query")
    assert "credentials" in str(creds.value) and "malformed" not in str(creds.value)
