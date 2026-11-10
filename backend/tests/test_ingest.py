import hashlib
import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import event, func, select, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

import app.rag.ingest as ingest_module
import scripts.ingest_knowledge as cli
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.models.recipe import CatalogRecipe, SavedCatalogRecipe
from app.models.user import User
from app.rag.corpus import load_knowledge
from app.rag.embeddings import EmbeddingConfigurationError, EmbeddingUnavailableError
from app.rag.ingest import IngestAbort, IngestError, ingest_knowledge
from app.schemas.recipe import RecipeData
from tests.db_guard import TEST_DATABASE_URL
from tests.fake_embeddings import FakeEmbeddingProvider

REAL_ROOT = Path(__file__).resolve().parents[1] / "knowledge" / "cafe"


def recipe_file(root: Path, slug: str, status: str = "validated", method: str = "v60", body: str = "Pour slowly.") -> Path:
    path = root / "recetas" / f"{slug}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"---\ntype: recipe\nid: {slug}\nstatus: {status}\nname: Recipe {slug}\nmethod: {method}\n---\n\n# {slug}\n\n{body}\n",
        encoding="utf-8",
    )
    return path


def guide_file(root: Path, name: str, body: str = "Intro.\n\n## Part\n\nDetails.") -> Path:
    path = root / f"{name}.md"
    path.write_text(f"---\ntype: guide\ntitle: Guide {name}\n---\n\n# Guide {name}\n\n{body}\n", encoding="utf-8")
    return path


@pytest.fixture
def root(tmp_path: Path) -> Path:
    folder = tmp_path / "knowledge"
    folder.mkdir()
    recipe_file(folder, "alpha")
    recipe_file(folder, "beta", method="moka")
    guide_file(folder, "g1")
    return folder


@pytest.fixture
def db(db_engine):
    with Session(db_engine, autoflush=False, expire_on_commit=False) as session:
        yield session


def count(db: Session, model) -> int:
    db.rollback()
    return db.scalar(select(func.count()).select_from(model))


def catalog(db: Session, slug: str) -> CatalogRecipe:
    db.rollback()
    return db.scalars(select(CatalogRecipe).where(CatalogRecipe.slug == slug)).one()


def test_second_run_is_a_no_op_without_embedding_calls(db, root):
    provider = FakeEmbeddingProvider()
    first = ingest_knowledge(db, provider, root)
    counts = (count(db, KnowledgeDocument), count(db, KnowledgeChunk), count(db, CatalogRecipe))
    calls = len(provider.calls)
    second = ingest_knowledge(db, provider, root)
    assert (first.added, first.documents, first.chunks) == (3, 3, count(db, KnowledgeChunk))
    assert (second.unchanged, second.added, second.updated) == (3, 0, 0)
    assert len(provider.calls) == calls
    assert (count(db, KnowledgeDocument), count(db, KnowledgeChunk), count(db, CatalogRecipe)) == counts == (3, counts[1], 2)
    assert all(call["kind"] == "document" for call in provider.calls)


def test_editing_one_file_reembeds_only_that_file(db, root):
    provider = FakeEmbeddingProvider()
    ingest_knowledge(db, provider, root)
    provider.calls.clear()
    recipe_file(root, "alpha", body="Pour faster.")
    report = ingest_knowledge(db, provider, root)
    assert (report.updated, report.unchanged) == (1, 2)
    assert len(provider.calls) == 1
    assert "Pour faster." in provider.calls[0]["texts"][0]


def test_frontmatter_only_change_archives_the_catalog_row(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    recipe_file(root, "alpha", status="testing")
    report = ingest_knowledge(db, FakeEmbeddingProvider(), root)
    assert (report.updated, report.archived) == (1, 1)
    assert catalog(db, "alpha").archived_at is not None
    chunks = db.scalars(select(KnowledgeChunk).join(KnowledgeDocument).where(KnowledgeDocument.path == "recetas/alpha.md")).all()
    assert chunks and all(c.catalog_recipe_id is None and c.meta["status"] == "testing" for c in chunks)


def test_removed_file_removes_chunks_and_archives_but_keeps_saved_rows(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    alpha = catalog(db, "alpha")
    user = User(name="Ana", email="ana@example.com", password_hash="x")
    db.add(user)
    db.flush()
    db.add(SavedCatalogRecipe(user_id=user.id, catalog_recipe_id=alpha.id))
    db.commit()
    (root / "recetas" / "alpha.md").unlink()
    report = ingest_knowledge(db, FakeEmbeddingProvider(), root)
    assert (report.removed, report.archived) == (1, 1)
    assert db.scalar(select(KnowledgeDocument).where(KnowledgeDocument.path == "recetas/alpha.md")) is None
    assert catalog(db, "alpha").archived_at is not None
    assert count(db, SavedCatalogRecipe) == 1
    # A second run does not count the already archived row again.
    assert ingest_knowledge(db, FakeEmbeddingProvider(), root).archived == 0


def test_archived_recipe_is_unarchived_when_it_comes_back(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    path = root / "recetas" / "alpha.md"
    original = path.read_text(encoding="utf-8")
    path.unlink()
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    path.write_text(original, encoding="utf-8")
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    row = catalog(db, "alpha")
    assert row.archived_at is None
    assert db.scalars(select(KnowledgeChunk.catalog_recipe_id).join(KnowledgeDocument).where(KnowledgeDocument.path == "recetas/alpha.md")).all() == [row.id]


def test_catalog_method_and_data_come_from_the_recipe(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    row = catalog(db, "beta")
    assert row.method == "moka" == row.data["method"]
    assert RecipeData.model_validate(row.data).name == "Recipe beta"
    assert (row.status, row.source_document, row.source_section) == ("validated", "recetas/beta.md", None)


def test_dry_run_without_db_or_provider(root):
    report = ingest_knowledge(None, None, root, dry_run=True)
    assert (report.documents, report.chunks, report.added) == (3, 4, 0)


def test_dry_run_with_database_writes_nothing(db, root):
    provider = FakeEmbeddingProvider()
    ingest_knowledge(db, provider, root)
    provider.calls.clear()
    (root / "recetas" / "beta.md").unlink()
    recipe_file(root, "gamma")
    report = ingest_knowledge(db, provider, root, dry_run=True)
    assert report.documents == 3 and report.removed == 0 and provider.calls == []
    assert {p for p in db.scalars(select(KnowledgeDocument.path))} == {"recetas/alpha.md", "recetas/beta.md", "g1.md"}
    assert count(db, CatalogRecipe) == 2


def test_invalid_file_raises_with_path_and_writes_nothing(db, root):
    bad = root / "recetas" / "bad.md"
    bad.write_text("---\ntype: recipe\nid: bad\nstatus: validated\nname: Bad\nmethod: nope\n---\nbody\n", encoding="utf-8")
    provider = FakeEmbeddingProvider()
    with pytest.raises(IngestError, match="bad.md"):
        ingest_knowledge(db, provider, root)
    assert provider.calls == [] and count(db, KnowledgeDocument) == 0 and count(db, CatalogRecipe) == 0


def test_duplicate_recipe_ids_name_both_files(db, root):
    (root / "recetas" / "alpha-copy.md").write_text((root / "recetas" / "alpha.md").read_text(encoding="utf-8"), encoding="utf-8")
    with pytest.raises(IngestError) as exc:
        ingest_knowledge(db, FakeEmbeddingProvider(), root)
    assert "recetas/alpha.md" in str(exc.value) and "recetas/alpha-copy.md" in str(exc.value)


def test_changed_model_aborts_without_force_and_reembeds_with_force(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    other = FakeEmbeddingProvider()
    other.model_id = "cohere.embed-multilingual-v3"
    with pytest.raises(IngestAbort, match="--force"):
        ingest_knowledge(db, other, root)
    assert other.calls == []
    report = ingest_knowledge(db, other, root, force=True)
    assert report.updated == 3 and len(other.calls) == 3
    assert set(db.scalars(select(KnowledgeDocument.embedding_model))) == {"cohere.embed-multilingual-v3"}


def test_dimension_mismatch_aborts_without_force(db, root, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "embedding_dimensions", 512)
    with pytest.raises(IngestAbort, match="--force"):
        ingest_knowledge(db, FakeEmbeddingProvider(), root)


def test_force_reembeds_unchanged_documents(db, root):
    provider = FakeEmbeddingProvider()
    ingest_knowledge(db, provider, root)
    provider.calls.clear()
    assert ingest_knowledge(db, provider, root, force=True).updated == 3
    assert len(provider.calls) == 3


def test_unavailable_embedding_keeps_old_rows_records_error_and_continues(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    old_chunks = count(db, KnowledgeChunk)
    recipe_file(root, "alpha", body="Changed body.")
    recipe_file(root, "beta", body="Also changed.")
    provider = FakeEmbeddingProvider(errors_for={"Changed body.": EmbeddingUnavailableError("throttled")})
    report = ingest_knowledge(db, provider, root)
    assert (report.failed, report.updated) == (1, 1)
    alpha = db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.path == "recetas/alpha.md")).one()
    assert alpha.last_error == "throttled"
    texts = db.scalars(select(KnowledgeChunk.text).join(KnowledgeDocument).where(KnowledgeDocument.path == "recetas/alpha.md")).all()
    assert all("Changed body." not in t for t in texts) and count(db, KnowledgeChunk) == old_chunks
    beta = db.scalars(select(KnowledgeChunk.text).join(KnowledgeDocument).where(KnowledgeDocument.path == "recetas/beta.md")).all()
    assert any("Also changed." in t for t in beta)
    # The failed document is retried and the error cleared on the next successful run.
    assert ingest_knowledge(db, FakeEmbeddingProvider(), root).updated == 1
    assert db.scalars(select(KnowledgeDocument.last_error).where(KnowledgeDocument.path == "recetas/alpha.md")).one() is None


def test_configuration_error_aborts(db, root):
    provider = FakeEmbeddingProvider(error=EmbeddingConfigurationError("no credentials"))
    with pytest.raises(IngestAbort, match="no credentials"):
        ingest_knowledge(db, provider, root)


def test_testing_recipe_has_chunk_status_and_no_catalog_row(db, root):
    recipe_file(root, "trial", status="testing")
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    db.rollback()
    assert db.scalars(select(CatalogRecipe).where(CatalogRecipe.slug == "trial")).first() is None
    chunks = db.scalars(select(KnowledgeChunk).join(KnowledgeDocument).where(KnowledgeDocument.path == "recetas/trial.md")).all()
    assert chunks and all(c.meta["status"] == "testing" and c.status == "testing" and c.catalog_recipe_id is None for c in chunks)


def test_cli_dry_run(root, tmp_path, capsys):
    assert cli.main(["--dry-run", "--root", str(root)]) == 0
    assert "documents=3 chunks=4 recipe_files=2" in capsys.readouterr().out
    (root / "recetas" / "bad.md").write_text("no frontmatter", encoding="utf-8")
    assert cli.main(["--dry-run", "--root", str(root)]) == 1
    assert "bad.md" in capsys.readouterr().err


def test_cli_refuses_without_database_url(root, monkeypatch, capsys):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    def fail(*args, **kwargs):
        raise AssertionError("must not connect")

    monkeypatch.setattr(cli, "_make_engine", fail)
    assert cli.main(["--root", str(root)]) == 2
    assert "DATABASE_URL" in capsys.readouterr().err


def test_cli_ingests_and_prints_target_without_credentials(root, db_engine, monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setattr(cli, "_make_provider", lambda: FakeEmbeddingProvider())
    assert cli.main(["--root", str(root)]) == 0
    out = capsys.readouterr().out
    assert "Target: localhost:5432/coffeemaster_test" in out and "postgres:postgres" not in out
    with Session(db_engine) as session:
        assert session.scalar(select(func.count()).select_from(KnowledgeDocument)) == 3


def test_cli_exit_1_when_a_document_failed(root, db_engine, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    failing = FakeEmbeddingProvider(errors_for={"Pour slowly.": EmbeddingUnavailableError("down")})
    monkeypatch.setattr(cli, "_make_provider", lambda: failing)
    assert cli.main(["--root", str(root)]) == 1


def test_real_knowledge_folder(db):
    items = load_knowledge(REAL_ROOT)
    expected_chunks = sum(len(i.chunks) for i in items)
    validated = {i.doc.id for i in items if i.doc.type == "recipe" and i.doc.status == "validated"}
    provider = FakeEmbeddingProvider()
    report = ingest_knowledge(db, provider, REAL_ROOT)
    assert (report.documents, report.chunks) == (len(items), expected_chunks)
    assert set(db.scalars(select(CatalogRecipe.slug))) == validated
    rows = db.execute(select(KnowledgeChunk.embedding, KnowledgeChunk.catalog_recipe_id, KnowledgeChunk.meta)).all()
    assert len(rows) == expected_chunks and all(len(r.embedding) == 1024 for r in rows)
    assert all((r.catalog_recipe_id is not None) == (r.meta["recipe_id"] in validated) for r in rows)
    calls = len(provider.calls)
    assert ingest_knowledge(db, provider, REAL_ROOT).unchanged == len(items) and len(provider.calls) == calls


def test_cli_dry_run_counts_recipe_files_from_parsed_documents(root, capsys):
    recipe_file(root, "elsewhere").rename(root / "elsewhere.md")
    assert cli.main(["--dry-run", "--root", str(root)]) == 0
    out = capsys.readouterr().out
    assert "documents=4" in out and "recipe_files=3" in out


DRY_RUN_SCRIPT = """
import sys
from scripts.ingest_knowledge import main
code = main(["--dry-run", "--root", sys.argv[1]])
loaded = [m for m in ("app.core.config", "app.db.session", "app.models", "sqlalchemy", "app.api.deps", "app.rag.ingest") if m in sys.modules]
print("LOADED", loaded)
sys.exit(code)
"""


def run_dry_run(root: Path) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if k not in ("JWT_SECRET", "DATABASE_URL")}
    return subprocess.run(
        [sys.executable, "-c", DRY_RUN_SCRIPT, str(root)],
        cwd=Path(__file__).resolve().parents[1], env=env, capture_output=True, text=True, timeout=60,
    )


def test_dry_run_needs_no_secrets_and_loads_no_database_code(root):
    result = run_dry_run(root)
    assert result.returncode == 0, result.stderr
    assert "LOADED []" in result.stdout
    (root / "recetas" / "bad.md").write_text("no frontmatter", encoding="utf-8")
    result = run_dry_run(root)
    assert result.returncode == 1 and "bad.md" in result.stderr and "LOADED []" in result.stdout


def cli_env(monkeypatch, provider=None):
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setattr(cli, "_make_provider", lambda: provider or FakeEmbeddingProvider())


def test_cli_exit_2_on_configuration_error_building_the_provider(root, db_engine, monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)

    def broken():
        raise EmbeddingConfigurationError("Unsupported embedding model id: x.")

    monkeypatch.setattr(cli, "_make_provider", broken)
    assert cli.main(["--root", str(root)]) == 2
    assert "Unsupported embedding model id" in capsys.readouterr().err


def test_cli_exit_2_on_configuration_error_while_embedding(root, db_engine, monkeypatch):
    cli_env(monkeypatch, FakeEmbeddingProvider(error=EmbeddingConfigurationError("no credentials")))
    assert cli.main(["--root", str(root)]) == 2


def test_cli_exit_2_on_model_mismatch_abort(root, db_engine, monkeypatch, capsys):
    cli_env(monkeypatch)
    assert cli.main(["--root", str(root)]) == 0
    other = FakeEmbeddingProvider()
    other.model_id = "cohere.embed-multilingual-v3"
    monkeypatch.setattr(cli, "_make_provider", lambda: other)
    assert cli.main(["--root", str(root)]) == 2
    assert "--force" in capsys.readouterr().err


def test_cli_exit_2_on_unreachable_database_without_leaking_the_url(root, monkeypatch, capsys):
    cli_env(monkeypatch)

    def unreachable(*args, **kwargs):
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr(ingest_module, "ingest_knowledge", unreachable)
    assert cli.main(["--root", str(root)]) == 2
    err = capsys.readouterr().err
    assert "connection refused" in err and "postgres:postgres" not in err and len(err.strip().splitlines()) == 1


def test_cli_exit_1_on_other_database_errors(root, monkeypatch, capsys):
    cli_env(monkeypatch)

    def broken(*args, **kwargs):
        raise IntegrityError("INSERT", {}, Exception("duplicate key"))

    monkeypatch.setattr(ingest_module, "ingest_knowledge", broken)
    assert cli.main(["--root", str(root)]) == 1
    err = capsys.readouterr().err
    assert "nothing from it was written" in err and len(err.strip().splitlines()) == 1


def test_cli_target_defaults_the_port(root, db_engine, monkeypatch, capsys):
    cli_env(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL.replace(":5432", ""))
    cli.main(["--root", str(root)])
    out = capsys.readouterr().out
    assert "Target: localhost:5432/coffeemaster_test" in out and "None" not in out


def test_missing_or_empty_root_raises_before_any_call(db, tmp_path):
    provider = FakeEmbeddingProvider()
    with pytest.raises(IngestError, match="missing"):
        ingest_knowledge(db, provider, tmp_path / "missing")
    (tmp_path / "empty").mkdir()
    with pytest.raises(IngestError, match="empty"):
        ingest_knowledge(db, provider, tmp_path / "empty")
    assert provider.calls == []


def test_removing_most_documents_aborts_unless_forced(db, root):
    for n in range(4):
        guide_file(root, f"extra{n}")
    ingest_knowledge(db, FakeEmbeddingProvider(), root)  # 7 documents
    for path in [*root.glob("extra*.md"), root / "g1.md"]:
        path.unlink()
    with pytest.raises(IngestAbort, match="--force"):
        ingest_knowledge(db, FakeEmbeddingProvider(), root)
    assert count(db, KnowledgeDocument) == 7
    assert ingest_knowledge(db, FakeEmbeddingProvider(), root, force=True).removed == 5


def test_removing_three_of_five_does_not_abort(db, root):
    for n in range(2):
        guide_file(root, f"extra{n}")
    ingest_knowledge(db, FakeEmbeddingProvider(), root)  # 5 documents
    for path in [*root.glob("extra*.md"), root / "g1.md"]:  # more than half, but not more than 3
        path.unlink()
    assert ingest_knowledge(db, FakeEmbeddingProvider(), root).removed == 3


def test_removing_four_of_six_aborts(db, root):
    for n in range(3):
        guide_file(root, f"extra{n}")
    ingest_knowledge(db, FakeEmbeddingProvider(), root)  # 6 documents
    for path in [*root.glob("extra*.md"), root / "g1.md"]:  # more than 3 and more than half
        path.unlink()
    with pytest.raises(IngestAbort, match="--force"):
        ingest_knowledge(db, FakeEmbeddingProvider(), root)


def test_changed_recipe_id_archives_the_old_slug(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    path = root / "recetas" / "alpha.md"
    path.write_text(path.read_text(encoding="utf-8").replace("id: alpha", "id: alpha-new"), encoding="utf-8")
    report = ingest_knowledge(db, FakeEmbeddingProvider(), root)
    assert report.archived == 1
    assert catalog(db, "alpha").archived_at is not None
    assert catalog(db, "alpha-new").archived_at is None


def test_recipe_rewritten_as_a_guide_archives_its_row(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    (root / "recetas" / "alpha.md").write_text("---\ntype: guide\ntitle: Now a guide\n---\n\nText.\n", encoding="utf-8")
    report = ingest_knowledge(db, FakeEmbeddingProvider(), root)
    assert report.archived == 1 and catalog(db, "alpha").archived_at is not None


def test_moved_recipe_keeps_its_catalog_row_active(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    (root / "recetas" / "alpha.md").rename(root / "recetas" / "alpha2.md")
    report = ingest_knowledge(db, FakeEmbeddingProvider(), root)
    row = catalog(db, "alpha")
    assert (row.archived_at, row.source_document) == (None, "recetas/alpha2.md")
    assert (report.removed, report.archived) == (1, 0)


def test_no_transaction_is_open_while_embedding(db, root):
    seen: list[bool] = []

    def check() -> None:
        seen.append(db.in_transaction())
        assert not db.in_transaction(), "a transaction was open during the embedding call"

    ingest_knowledge(db, FakeEmbeddingProvider(on_embed=check), root)
    recipe_file(root, "alpha", body="edited")
    ingest_knowledge(db, FakeEmbeddingProvider(on_embed=check), root)
    assert seen and not any(seen)


def test_database_failure_after_the_catalog_upsert_rolls_everything_back(db, root, monkeypatch):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    before = (catalog(db, "alpha").source_hash, catalog(db, "alpha").data, count(db, KnowledgeChunk))
    old_hash = db.scalars(select(KnowledgeDocument.content_hash).where(KnowledgeDocument.path == "recetas/alpha.md")).one()
    recipe_file(root, "alpha", body="edited")

    def boom(*args, **kwargs):
        raise OperationalError("INSERT", {}, Exception("connection lost"))

    monkeypatch.setattr(ingest_module, "_replace_chunks", boom)
    with pytest.raises(OperationalError):
        ingest_knowledge(db, FakeEmbeddingProvider(), root)
    assert (catalog(db, "alpha").source_hash, catalog(db, "alpha").data, count(db, KnowledgeChunk)) == before
    doc = db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.path == "recetas/alpha.md")).one()
    assert doc.content_hash == old_hash and doc.last_error is None


def concurrent_run_during_first_embed(db_engine, root: Path) -> FakeEmbeddingProvider:
    """Provider whose first embedding call lets a second session ingest the whole folder (a concurrent run)."""
    fired: list[bool] = []

    def rival() -> None:
        if fired:
            return
        fired.append(True)
        with Session(db_engine, autoflush=False, expire_on_commit=False) as other:
            ingest_knowledge(other, FakeEmbeddingProvider(), root)

    return FakeEmbeddingProvider(on_embed=rival)


def assert_consistent(db: Session, expected_documents: int) -> None:
    db.rollback()
    assert count(db, KnowledgeDocument) == expected_documents
    for document in db.scalars(select(KnowledgeDocument)):
        ordinals = db.scalars(select(KnowledgeChunk.ordinal).where(KnowledgeChunk.document_id == document.id).order_by(KnowledgeChunk.ordinal)).all()
        assert ordinals == list(range(len(ordinals))) and ordinals


def test_concurrent_run_writing_a_new_document_is_not_duplicated(db, db_engine, root):
    report = ingest_knowledge(db, concurrent_run_during_first_embed(db_engine, root), root)
    # The rival wrote the first document while we were embedding: we must skip it, not insert it again.
    assert (report.added, report.updated, report.unchanged) == (0, 0, 3)
    assert_consistent(db, 3)


def test_concurrent_run_writing_a_changed_document_is_treated_as_unchanged(db, db_engine, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    recipe_file(root, "alpha", body="edited while another run was embedding")
    report = ingest_knowledge(db, concurrent_run_during_first_embed(db_engine, root), root)
    assert (report.added, report.updated, report.unchanged) == (0, 0, 3)
    assert_consistent(db, 3)
    texts = db.scalars(select(KnowledgeChunk.text).join(KnowledgeDocument).where(KnowledgeDocument.path == "recetas/alpha.md")).all()
    assert any("edited while" in t for t in texts)
    stored = db.scalars(select(KnowledgeDocument.content_hash).where(KnowledgeDocument.path == "recetas/alpha.md")).one()
    assert stored == hashlib.sha256((root / "recetas" / "alpha.md").read_bytes()).hexdigest()


@pytest.mark.parametrize("url", ["postgresql+psycopg://u:secretpw@localhost:notaport/db", "secretpw-not-a-url"])
def test_cli_exit_2_on_malformed_database_url(root, monkeypatch, capsys, url):
    monkeypatch.setenv("DATABASE_URL", url)
    assert cli.main(["--root", str(root)]) == 2
    err = capsys.readouterr().err
    assert "DATABASE_URL is not a valid database URL" in err and "secretpw" not in err and len(err.strip().splitlines()) == 1


def test_removing_four_of_nine_does_not_abort(db, root):
    for n in range(6):
        guide_file(root, f"extra{n}")
    ingest_knowledge(db, FakeEmbeddingProvider(), root)  # 9 documents
    for path in sorted(root.glob("extra*.md"))[:4]:  # more than 3, but not more than half
        path.unlink()
    assert ingest_knowledge(db, FakeEmbeddingProvider(), root).removed == 4


def test_unrelated_value_error_is_not_reported_as_a_bad_url(root, monkeypatch, capsys):
    cli_env(monkeypatch)

    def broken(*args, **kwargs):
        raise ValueError("unrelated bug")

    monkeypatch.setattr(ingest_module, "ingest_knowledge", broken)
    with pytest.raises(ValueError, match="unrelated bug"):
        cli.main(["--root", str(root)])
    assert "not a valid database URL" not in capsys.readouterr().err


def test_advisory_lock_runs_once_before_the_first_write_of_each_document(db, db_engine, root):
    # Statements are grouped into transactions by the commit/rollback events. Every transaction that writes
    # (INSERT/UPDATE/DELETE) must contain exactly one pg_advisory_xact_lock, and it must come before the first write.
    transactions: list[list[str]] = [[]]

    def record(conn, cursor, statement, parameters, context, executemany):
        transactions[-1].append(statement)

    def end_transaction(conn):
        transactions.append([])

    event.listen(db_engine, "before_cursor_execute", record)
    event.listen(db_engine, "commit", end_transaction)
    event.listen(db_engine, "rollback", end_transaction)
    try:
        ingest_knowledge(db, FakeEmbeddingProvider(), root)
    finally:
        event.remove(db_engine, "before_cursor_execute", record)
        event.remove(db_engine, "commit", end_transaction)
        event.remove(db_engine, "rollback", end_transaction)

    def is_write(statement: str) -> bool:
        return statement.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))

    writing = [t for t in transactions if any(is_write(s) for s in t)]
    assert len(writing) == 3  # one write transaction per added document
    for statements in writing:
        locks = [i for i, s in enumerate(statements) if "pg_advisory_xact_lock" in s]
        first_write = next(i for i, s in enumerate(statements) if is_write(s))
        assert len(locks) == 1 and locks[0] < first_write


def catalog_only(db, root, **kwargs):
    return ingest_knowledge(db, None, root, catalog_only=True, **kwargs)


def active_slugs(db) -> set[str]:
    db.rollback()
    return set(db.scalars(select(CatalogRecipe.slug).where(CatalogRecipe.archived_at.is_(None))))


def test_catalog_only_fills_the_catalog_without_documents_chunks_or_provider(db, root):
    recipe_file(root, "trial", status="testing")
    provider = FakeEmbeddingProvider()
    report = ingest_knowledge(db, provider, root, catalog_only=True)
    assert active_slugs(db) == {"alpha", "beta"}
    assert count(db, KnowledgeDocument) == 0 and count(db, KnowledgeChunk) == 0 and provider.calls == []
    assert (report.added, report.updated) == (2, 0)
    row = catalog(db, "beta")
    assert row.method == "moka" == row.data["method"] and row.source_document == "recetas/beta.md"
    assert row.source_hash == hashlib.sha256((root / "recetas" / "beta.md").read_bytes()).hexdigest()


def test_catalog_only_twice_is_a_no_op(db, root):
    catalog_only(db, root)
    report = catalog_only(db, root)
    assert (report.added, report.updated, report.archived, report.unchanged) == (0, 0, 0, 3)
    assert active_slugs(db) == {"alpha", "beta"}


def test_catalog_only_status_flip_archives(db, root):
    catalog_only(db, root)
    recipe_file(root, "alpha", status="testing")
    assert catalog_only(db, root).archived == 1
    assert active_slugs(db) == {"beta"}
    assert catalog_only(db, root).archived == 0


def test_catalog_only_renamed_slug_archives_the_old_row(db, root):
    catalog_only(db, root)
    path = root / "recetas" / "alpha.md"
    path.write_text(path.read_text(encoding="utf-8").replace("id: alpha", "id: alpha-new"), encoding="utf-8")
    assert catalog_only(db, root).archived == 1
    assert active_slugs(db) == {"alpha-new", "beta"}


def test_catalog_only_removed_file_archives_its_row(db, root):
    catalog_only(db, root)
    (root / "recetas" / "alpha.md").unlink()
    assert catalog_only(db, root).archived == 1
    assert active_slugs(db) == {"beta"}


def test_catalog_only_moved_recipe_is_not_archived(db, root):
    catalog_only(db, root)
    (root / "recetas" / "alpha.md").rename(root / "recetas" / "alpha2.md")
    report = catalog_only(db, root)
    assert report.archived == 0 and catalog(db, "alpha").source_document == "recetas/alpha2.md"
    assert active_slugs(db) == {"alpha", "beta"}


def test_catalog_only_removal_safety_net(db, root):
    for n in range(4):
        recipe_file(root, f"extra{n}")
    catalog_only(db, root)  # 6 active rows
    for n in range(4):
        (root / "recetas" / f"extra{n}.md").unlink()
    with pytest.raises(IngestAbort, match="--force"):
        catalog_only(db, root)
    assert len(active_slugs(db)) == 6
    assert catalog_only(db, root, force=True).archived == 4


def test_catalog_only_validates_like_a_normal_run(db, root):
    (root / "recetas" / "bad.md").write_text("no frontmatter", encoding="utf-8")
    with pytest.raises(IngestError, match="bad.md"):
        catalog_only(db, root)
    assert count(db, CatalogRecipe) == 0


def test_normal_run_needs_a_provider(db, root):
    with pytest.raises(IngestAbort):
        ingest_knowledge(db, None, root)


def test_normal_run_after_catalog_only_links_the_chunks(db, root):
    catalog_only(db, root)
    ids = {r.slug: r.id for r in db.scalars(select(CatalogRecipe))}
    report = ingest_knowledge(db, FakeEmbeddingProvider(), root)
    assert report.added == 3 and count(db, CatalogRecipe) == 2
    linked = db.scalars(select(KnowledgeChunk.catalog_recipe_id).where(KnowledgeChunk.catalog_recipe_id.is_not(None))).all()
    assert sorted(linked) == sorted(ids.values())
    assert ingest_knowledge(db, FakeEmbeddingProvider(), root).unchanged == 3


def test_catalog_only_on_the_real_folder(db):
    items = load_knowledge(REAL_ROOT)
    validated = {i.doc.id for i in items if i.doc.type == "recipe" and i.doc.status == "validated"}
    report = catalog_only(db, REAL_ROOT)
    assert active_slugs(db) == validated and report.added == len(validated)
    assert count(db, KnowledgeDocument) == 0


def test_cli_catalog_only_never_builds_a_provider(root, db_engine, monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)

    def fail():
        raise AssertionError("must not build a provider")

    monkeypatch.setattr(cli, "_make_provider", fail)
    assert cli.main(["--catalog-only", "--root", str(root)]) == 0
    assert "Target: localhost:5432/coffeemaster_test" in capsys.readouterr().out
    with Session(db_engine) as session:
        assert session.scalar(select(func.count()).select_from(CatalogRecipe)) == 2
        assert session.scalar(select(func.count()).select_from(KnowledgeDocument)) == 0


def test_cli_catalog_only_requires_database_url_and_excludes_dry_run(root, monkeypatch, capsys):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(cli, "_make_engine", lambda url: (_ for _ in ()).throw(AssertionError("must not connect")))
    assert cli.main(["--catalog-only", "--root", str(root)]) == 2
    assert "DATABASE_URL" in capsys.readouterr().err
    assert cli.main(["--catalog-only", "--dry-run", "--root", str(root)]) == 2
    assert "--catalog-only" in capsys.readouterr().err


def alpha_chunk_links(db) -> list[int | None]:
    db.rollback()
    return db.scalars(
        select(KnowledgeChunk.catalog_recipe_id).join(KnowledgeDocument).where(KnowledgeDocument.path == "recetas/alpha.md")
    ).all()


def test_normal_run_repairs_a_catalog_row_archived_by_catalog_only(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    path = root / "recetas" / "alpha.md"
    original = path.read_bytes()
    path.unlink()
    assert catalog_only(db, root).archived == 1
    path.write_bytes(original)
    provider = FakeEmbeddingProvider()
    report = ingest_knowledge(db, provider, root)
    assert provider.calls == []  # still no embedding for an unchanged document
    assert (report.added, report.unchanged, report.updated) == (0, 2, 1)
    row = catalog(db, "alpha")
    assert row.archived_at is None and alpha_chunk_links(db) == [row.id]
    assert ingest_knowledge(db, provider, root).unchanged == 3  # now a real no-op


def test_normal_run_archives_an_active_row_of_an_unchanged_testing_document(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    recipe_file(root, "alpha", status="testing")
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    row = catalog(db, "alpha")
    db.execute(update(CatalogRecipe).where(CatalogRecipe.id == row.id).values(archived_at=None))
    db.execute(update(KnowledgeChunk).where(KnowledgeChunk.status == "testing").values(catalog_recipe_id=row.id))
    db.commit()
    provider = FakeEmbeddingProvider()
    report = ingest_knowledge(db, provider, root)
    assert provider.calls == [] and report.archived == 1
    assert catalog(db, "alpha").archived_at is not None and alpha_chunk_links(db) == [None]


def test_catalog_only_after_a_normal_run_changes_nothing(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    before = (alpha_chunk_links(db), count(db, KnowledgeChunk), active_slugs(db))
    report = catalog_only(db, root)
    assert (report.added, report.updated, report.archived) == (0, 0, 0)
    assert (alpha_chunk_links(db), count(db, KnowledgeChunk), active_slugs(db)) == before


def record_statements(engine) -> tuple[list[str], callable]:
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    return statements, lambda: event.remove(engine, "before_cursor_execute", record)


def assert_read_only(statements: list[str], allow_lock: bool = False) -> None:
    assert statements, "the listener recorded nothing"
    writes = [s for s in statements if s.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
    assert writes == []
    if not allow_lock:
        assert not [s for s in statements if "pg_advisory_xact_lock" in s]


def test_unchanged_runs_write_nothing_and_embed_nothing(db, db_engine, root):
    recipe_file(root, "trial", status="testing")
    ingest_knowledge(db, FakeEmbeddingProvider(), root)  # validated recipes, a testing recipe and a guide
    provider = FakeEmbeddingProvider()
    statements, stop = record_statements(db_engine)
    try:
        for _ in range(2):
            assert ingest_knowledge(db, provider, root).unchanged == 4
    finally:
        stop()
    assert provider.calls == []
    assert_read_only(statements)


def test_catalog_only_after_a_normal_run_writes_nothing(db, db_engine, root):
    recipe_file(root, "trial", status="testing")
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    statements, stop = record_statements(db_engine)
    try:
        report = catalog_only(db, root)
    finally:
        stop()
    assert (report.added, report.updated, report.archived, report.unchanged) == (0, 0, 0, 4)
    assert_read_only(statements, allow_lock=True)  # catalog-only still takes the per-document lock before deciding


def test_repair_relinks_chunks_whose_catalog_link_was_lost(db, root):
    ingest_knowledge(db, FakeEmbeddingProvider(), root)
    db.execute(update(KnowledgeChunk).values(catalog_recipe_id=None))
    db.commit()
    provider = FakeEmbeddingProvider()
    report = ingest_knowledge(db, provider, root)
    assert provider.calls == [] and (report.updated, report.unchanged) == (2, 1)
    assert alpha_chunk_links(db) == [catalog(db, "alpha").id]
