# Coffee Master v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured recipe catalog, a personal recipe book with favorites, recipe adaptation and generation through the chat, and a real RAG pipeline (pgvector) over the existing knowledge base, identical on web and mobile.

**Architecture:** Keep the existing FastAPI layers (routes, services, models), own JWT auth and chat flow. Recipes in `backend/knowledge/cafe/` become one markdown file per recipe with YAML frontmatter, parsed deterministically by an offline ingestion command that fills Postgres (`knowledge_chunks` with embeddings, `catalog_recipes`). The chat retrieves chunks per message; the old full-knowledge loader stays as the fallback. Claude proposes recipes through a `propose_recipe` tool; saving is always an explicit user action on a stored, validated proposal.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic (new), Postgres 16 + pgvector in docker (new), `pgvector` python package (new), Amazon Bedrock embeddings through `boto3`, behind an interface (decision D2), Next.js 16 + next-intl, Expo SDK 58 + react-i18next + Expo Router (decision D1), GitHub Actions (new).

**Spec:** `coffee-master-v2.md` (adapted: it assumes Supabase Auth/RLS, no migrations and a single frontend; this repo has its own JWT auth, no migrations yet, and web + mobile). Decisions from the planning conversation override the document where they differ.

## Global Constraints

- Code and comments in English. User-facing text (UI, emails, chat replies) in Spanish (rioplatense voseo in the chat).
- Frontend: logic in hooks, HTTP only through the axios client, validation with zod, UI with shadcn (web) / theme-aware RN components (mobile).
- Backend: layered (routes, services, models). Every endpoint documented: summary, responses, and a row in `backend/README.md`.
- i18n: no literal UI strings in `.tsx`/`.ts`. Everything through `next-intl` (`web/messages/{es,en}.json`) or `react-i18next` (`mobile/i18n/locales/{es,en}.json`). The `es`/`en` key sets must match exactly on each app.
- Theming: no hardcoded colors. Web uses the CSS vars in `web/app/globals.css`; mobile uses `useAppTheme()`.
- User text is data, not instructions (`prompt-injection-guard`).
- No tests or runs that call the Claude API (or the embeddings API) unless the user asks. Tests mock both. The one exception is production data loading: the local and CI `ingest_knowledge` run calls Bedrock for real, because that is the product, not a test.
- No commits or pushes without an explicit request. This plan therefore has no commit steps; the executor asks first.
- Reuse the existing auth (JWT, `get_current_user`). No Supabase Auth, no RLS: ownership is enforced in services.
- REST: GET, POST, PUT, PATCH, DELETE with correct semantics (PUT idempotent, PATCH partial).
- After any API change: `cd backend && .venv/bin/python -m scripts.export_openapi`, then `npm run gen:api` in `web/` and `mobile/`.
- Web and mobile ship identical functionality and copy.
- User-created recipes are private. Catalog recipes are read-only for users.
- Before rewriting `backend/knowledge/cafe/`, the git tag `pre-v2-knowledge-baseline` (commit `b865187`, local, not pushed) holds the current state. `knowledge/_fuentes/` is only 6.9 KB and is not a full backup.

## Decisions (2026-11-07)

- **D1** Confirmed: mobile navigation with Expo Router (bottom tabs + stacks).
- **D2** Confirmed: Amazon Bedrock for embeddings, behind the `EmbeddingProvider` interface. There is no AWS integration in the repo yet. Task 7 starts with a short spike that picks the Bedrock embedding model, the region and the credentials approach, and fixes `EMBEDDING_DIMENSIONS`. Needed before Phase 3.
- **D3** Confirmed: an `is_favorite` flag on the association rows. Favoriting a catalog recipe saves it; unfavoriting keeps it saved; removing deletes the row.
- **D4** Confirmed: the catalog lists only `status: validated` recipes. `testing` and `not_recommended` are indexed for RAG with that status in metadata, never listed.
- **D5** Confirmed: recipe content is always Spanish, in both UI languages; only labels are translated.
- **Execution:** subagent-driven. The owner reviewed and approved this plan on 2026-11-07, after D2 and the knowledge questions were closed.

## Non-Goals

Admin panel, deleting conversations, hybrid/full-text search, ANN index (exact scan on ~100 chunks), recipe revision history, RLS, a general test CI, store deployment.

## Review Focus

1. A catalog recipe is renamed or removed in the files while users saved or favorited it: it is archived, stays in their library, nothing is orphaned (Task 10).
2. Claude proposes a recipe with inconsistent numbers (ratio vs dose/water, 150 °C, decreasing pour weights): rejected, never saved, the chat message still arrives (Tasks 4, 18).
3. The embeddings provider or vector query fails mid-chat: the reply is produced with the full-knowledge fallback, no 500 (Task 12).
4. Another user reads, edits, deletes or saves a private recipe or proposal: 404, indistinguishable from a missing id (Tasks 15, 16, 18).
5. Injection through a user recipe's notes/title or through a retrieved chunk, and prompt leakage through the new source display (Tasks 12, 18).

## Shared Contract (give verbatim to every agent)

**RecipeData** (Pydantic in `app/schemas/recipe.py`, same shape in OpenAPI, tool schema and frontmatter):

```
Range            { min: float, max: float | null }          # min <= max
RecipeData       { name: str(1..120), description: str|null(<=500),
                   method: "v60"|"french_press"|"moka"|"aeropress"|"espresso"|"cold_brew"|"other",
                   goal: "sweetness"|"balance"|"acidity"|null,   # variants of one coffee and method aim at different notes
                   coffee: { name, origin, process, roast: str|null, with_milk: bool|null },   # false = never with milk
                   dose_g: Range|null, water_g: Range|null, temperature_c: Range|null,
                   ratio: float|null,                        # grams of water per gram of coffee (espresso: grams of drink per gram, with `water_g` null)
                   grind: { grinder: str|null, clicks: Range|null, description: str|null }|null,
                   brew_time_seconds: Range|null, yield_ml: Range|null,
                   steps: [ { at_seconds: int|null, action: str, pour_to_g: float|null } ],  # pour_to_g is cumulative
                   notes: str|null }
```

Validation: temperature within 60-100 °C; `ratio` within 5% of mid(water)/mid(dose) when all three exist; `at_seconds` and `pour_to_g` non-decreasing; `pour_to_g` not above `water_g.max`.

**Responses add:** catalog `{slug, status, source:{document, section}}`; user recipe `{id, parent:{kind:"catalog"|"user", ref}|null, is_favorite, conversation_id|null, created_at, updated_at}`. `ref` is the slug (string) for catalog recipes and the id (integer) for user recipes; `recipe_ref` uses the same `{kind, ref}` shape. Catalog responses also carry `archived: bool`.

**Endpoints** (all need the bearer token; 401, 404 for foreign or missing, 422 validation, 429 rate limit):

| Verb | Path | Behavior |
|---|---|---|
| GET | `/api/recipes?q=&method=&limit=&offset=` | Catalog list (validated only, non-archived) |
| GET | `/api/recipes/{slug}` | Catalog detail (+ `is_saved`, `is_favorite` for the caller) |
| PUT | `/api/me/library/catalog/{slug}` | Save to book (idempotent, 204) |
| PATCH | `/api/me/library/catalog/{slug}` | `{is_favorite}`; saves if not saved |
| DELETE | `/api/me/library/catalog/{slug}` | Remove from book (204) |
| GET | `/api/me/recipes?filter=all\|favorites\|created\|saved` | Book: created ∪ saved catalog |
| POST | `/api/me/recipes` | Body `{recipe}` (manual) or `{proposal_id, overrides?}`, where `overrides` is a partial `RecipeData` merged over the proposal and validated again; 201 |
| GET/PUT/PATCH/DELETE | `/api/me/recipes/{id}` | Read / replace / `{is_favorite}` / delete |
| GET | `/api/conversations` | The caller's conversations, newest first |
| POST | `/api/conversations` | `{recipe_ref?: {kind, ref}}`; 201 |
| GET | `/api/conversations/{id}` | Messages + recipe ref. Each assistant message may carry `proposal: {proposal_id, recipe, saved_recipe_id\|null}` |
| GET | `/api/conversations/latest` | Same as today plus the optional `proposal` on each message (additive). Declared before `/{id}` in the router |
| POST | `/api/chat` | Unchanged request; stream adds `recipe` |

**SSE** `recipe` event: `{proposal_id: int, recipe: RecipeData}`, sent after the last `delta` and before `done`, only when the model called `propose_recipe` and validation passed.

---

## Phase 0: Foundations (backend-dev)

### Task 1: Postgres in docker for dev and tests

**Files:** Create `backend/docker-compose.yml`, `backend/docker/initdb/01-test-db.sql`; modify `backend/app/core/config.py`, `backend/.env.example`, `backend/tests/conftest.py`, `backend/README.md`.
**Interfaces:** Keeps the existing fixtures (`db_engine`, `email_sender`, `anthropic_client`, `client`), now backed by Postgres. `DATABASE_URL` default becomes `postgresql+psycopg://postgres:postgres@localhost:5432/coffeemaster`.
- [ ] Service `db` on image `pgvector/pgvector:pg16`, database `coffeemaster`, plus `coffeemaster_test` created by the init script.
- [ ] `conftest.py` swaps SQLite for the test database, truncating tables between tests.
- [ ] Done when `docker compose up -d db && .venv/bin/python -m pytest -q` passes with the existing tests unchanged.

### Task 2: Alembic baseline

**Files:** Create `backend/alembic.ini`, `backend/migrations/env.py`, `backend/migrations/versions/0001_baseline.py`, `backend/tests/test_migrations.py`; modify `backend/app/main.py` (remove `create_all`), `backend/tests/conftest.py`, `backend/requirements.txt`, `backend/README.md`.
**Interfaces:** `alembic upgrade head` creates users, verification_codes, conversations, chat_messages exactly as the models define.
- [ ] `test_upgrade_matches_models`: upgrade on an empty DB, then `alembic.autogenerate.compare_metadata` returns `[]`.
- [ ] `test_downgrade_base_leaves_no_tables`.
- [ ] `conftest.py` builds the test schema with `alembic upgrade head` once per session instead of `create_all`, so every migration is exercised by the whole suite.
- [ ] README runbook for the existing Supabase DB: `alembic stamp 0001_baseline`, never `upgrade` from scratch there. Migrations use the direct/session connection, not the transaction pooler.
- [ ] Done when both tests and the full suite pass with `create_all` removed.

### Task 3: CORS for REST verbs

**Files:** Modify `backend/app/main.py:~45`, `backend/tests/test_auth.py` (or a new `test_cors.py`).
- [ ] `test_preflight_allows_patch_put_delete`: OPTIONS with `Access-Control-Request-Method` PATCH/PUT/DELETE from an allowed origin returns those methods in `allow-methods`.
- [ ] `allow_methods=["GET","POST","PUT","PATCH","DELETE"]`.

## Phase 1: Recipe contract and schema (backend-dev)

### Task 4: RecipeData schema and validators

**Files:** Create `backend/app/schemas/recipe.py`, `backend/tests/test_recipe_schema.py`.
**Produces:** `Range`, `RecipeData`, `RecipeSource`, `CatalogRecipeOut`, `UserRecipeOut` as in the Shared Contract.
- [ ] Tests: valid full recipe; valid partial recipe (only name + method); `Range(min=5,max=3)` rejected; 150 °C rejected; ratio off by more than 5% rejected; decreasing `pour_to_g` rejected; `pour_to_g` above `water_g.max` rejected; unknown method rejected.

### Task 5: Recipe tables

**Files:** Create `backend/app/models/recipe.py`, `backend/migrations/versions/0002_recipes.py`, `backend/tests/test_recipe_models.py`; modify `backend/app/models/__init__.py`, `backend/app/models/chat.py`.
**Produces:** `CatalogRecipe(id, slug unique, status, method, data JSONB, source_document, source_section, source_hash, archived_at)`; `UserRecipe(id, user_id FK, data JSONB, parent_catalog_id FK null, parent_user_id FK null, conversation_id FK null, is_favorite, timestamps)` with CHECK at most one parent; `SavedCatalogRecipe(user_id, catalog_recipe_id, is_favorite, saved_at)` primary key on the pair; `RecipeProposal(id, message_id FK, data JSONB, saved_recipe_id FK null)`; `conversations.catalog_recipe_id` and `conversations.user_recipe_id` nullable with CHECK at most one (added with ALTER after both tables exist, because `user_recipes.conversation_id` points back at conversations: a circular foreign key).
- [ ] Tests: duplicate saved pair rejected; both parents set rejected; deleting a chat message cascades its proposals (the chat service deletes failed assistant messages); deleting a catalog recipe row is blocked while referenced (archive is the only path); migration test from Task 2 still passes.

## Phase 2: Restructure the knowledge (coffee-expert and backend-dev, then review)

**Prerequisite gate (answers done 2026-11-07):** the owner answered the knowledge inconsistency questions; the answers are in `docs/superpowers/plans/2026-11-07-knowledge-decisions.md`. coffee-expert applied the content corrections to the existing markdown as an uncommitted diff against the tag `pre-v2-knowledge-baseline` (`git diff pre-v2-knowledge-baseline -- backend/knowledge`). The owner reviewed and approved that diff on 2026-11-07. Structural items stay deferred to Task 6: frontmatter and `status`, one file per recipe, splitting `12` into recipes and guides, consolidating duplicated facts, moving model-addressed instructions out of the files, removing cross-file links, and the `goal` and `with_milk` fields.

### Task 6: Recipes as frontmatter files

**Ownership:** coffee-expert writes everything under `backend/knowledge/**`; backend-dev writes `backend/app/**` and `backend/tests/**`. backend-dev goes first (parser, loader and file tests), so coffee-expert can check its output by running `pytest tests/test_knowledge_files.py`.
**Files:** Create `backend/knowledge/cafe/recetas/<slug>.md` (one per recipe), `backend/app/rag/frontmatter.py`, `backend/tests/test_knowledge_files.py`; modify the guides in `backend/knowledge/cafe/` (minimal frontmatter `type: guide`, `title`), `backend/app/agent/knowledge.py` (strip frontmatter), `backend/tests/test_knowledge.py`.
**Interfaces:** `parse_document(path: Path) -> ParsedDocument(type: "recipe"|"guide", title: str, status: str, recipe: RecipeData|None, body: str, meta: dict)`. A recipe's frontmatter is `RecipeData` plus `id` (stable slug) and `status` (`validated`|`testing`|`not_recommended`). Guides default to `status: validated` unless their frontmatter says `testing`. `load_coffee_knowledge()` strips the frontmatter but renders a visible line for every non-validated document (for example `Estado: en prueba, no recomendar como validada`), so the fallback prompt keeps what `status` says.
- [ ] coffee-expert converts every recipe in `recetario/` and `en-prueba.md` without changing any number, starting from the corrected markdown and `2026-11-07-knowledge-decisions.md`; rules and negative results stay in guides unless the decisions file says otherwise. It sets `goal` and `with_milk` only where the decisions file states them (never with milk: Azahar y Durazno / Geisha, Fruit Punch, Berry Bloom). Incomplete recipes stay incomplete (the Azahar y Durazno 88 a 90 °C variant has no dose or water; Kasuya has no temperature).
- [ ] Tests: every `recetas/*.md` parses and validates as `RecipeData`; ids are unique and match the file name; `status` is one of the three values; the recipes the decisions file marks as `testing` (Azahar opción B, Origami, V60 escalado a 600 ml) are not `validated`; `load_coffee_knowledge()` output has one `## Document:` header per file, no `---` frontmatter blocks, and shows the `Estado:` line for every non-validated document.
- [ ] **Review gate:** the user reads the git diff of `backend/knowledge/` before Phase 3 uses it.

## Phase 3: RAG (backend-dev)

### Task 7: Embeddings service

**Files:** Create `backend/app/rag/embeddings.py`, `backend/tests/test_embeddings.py`; modify `backend/app/core/config.py`, `backend/app/api/deps.py`, `backend/.env.example`, `backend/requirements.txt`.
**Produces:** `EmbeddingProvider` protocol with `embed(texts: list[str], *, kind: Literal["document","query"]) -> list[list[float]]` (`kind` is ignored by models without input types); `get_embedding_provider() -> EmbeddingProvider`, exposed as a dependency in `backend/app/api/deps.py` next to `get_anthropic_client` so tests override it the same way; `FakeEmbeddingProvider` (deterministic, for tests); errors `EmbeddingUnavailableError`.
- [ ] Step 0 (spike): D2 is decided (Amazon Bedrock). With the current AWS docs, pick the embedding model (candidates: Titan Text Embeddings V2 and a Cohere multilingual embedding model; verify model id, dimensions, region availability, price and input limits), confirm model access is enabled in the chosen region, and define a least-privilege IAM policy (`bedrock:InvokeModel` on that model only). Decide how credentials reach each runtime: for Vercel, OIDC federation to an AWS role if it is available, otherwise a dedicated least-privilege IAM user; for GitHub Actions, OIDC role assumption with no stored access keys. Record model id, `EMBEDDING_DIMENSIONS`, region and the credentials approach in the README.
- [ ] Implement `BedrockEmbeddingProvider(model_id: str, region: str, dimensions: int)` using the `bedrock-runtime` client from `boto3`, selected by `get_embedding_provider()` from settings (`EMBEDDING_MODEL_ID`, `EMBEDDING_DIMENSIONS`, `AWS_REGION`). The content is Spanish, so the model must be multilingual.
- [ ] Tests (boto3 client stubbed, no AWS call): throttling and transient service errors are retried with backoff and then raise `EmbeddingUnavailableError`; a wrong returned dimension raises; requests respect the chosen model's input limits (one request per text if the model takes a single input); missing region or credentials raises a configuration error, not a crash at import.

### Task 8: Chunking

**Files:** Create `backend/app/rag/chunking.py`, `backend/tests/test_chunking.py`.
**Produces:** `chunk_document(doc: ParsedDocument, *, max_chars: int = 1500) -> list[Chunk(ordinal, heading_path, text, content_hash, meta)]`. Recipes are one chunk (params and steps never split); guides split by `##`/`###`, then by paragraph above `max_chars`. Each chunk's embed text is prefixed with the document title and heading path.
- [ ] Tests: a recipe stays one chunk; a long guide section splits on paragraphs only; every chunk carries `status` and `type`; hashes are stable across runs and change with the text.

### Task 9: Knowledge tables

**Files:** Create `backend/app/models/knowledge.py`, `backend/migrations/versions/0003_knowledge.py`, `backend/tests/test_knowledge_models.py`.
**Produces:** `KnowledgeDocument(id, path unique, type, title, content_hash, embedding_model, ingested_at, last_error)`; `KnowledgeChunk(id, document_id FK cascade, ordinal, heading_path, text, content_hash, status, meta JSONB, embedding vector(N), catalog_recipe_id FK null)` with unique `(document_id, ordinal)`, where N is the literal dimension fixed by the Task 7 spike (a migration never reads settings; changing the dimension later means a new migration plus `--force` re-embedding). This task depends on Task 7 Step 0. The migration runs `CREATE EXTENSION IF NOT EXISTS vector`. No ANN index (`shortcut: exact scan is faster below a few thousand chunks, add HNSW when chunks exceed ~5000`).
- [ ] Tests: unique `(document_id, ordinal)`; deleting a document cascades its chunks; a nearest-neighbor query by cosine returns the closest of three known vectors.

### Task 10: Ingestion command

**Files:** Create `backend/app/rag/ingest.py`, `backend/scripts/ingest_knowledge.py`, `backend/tests/test_ingest.py`.
**Interfaces:** Consumes Tasks 6-9. Produces `ingest_knowledge(db, provider, root: Path, *, dry_run=False, force=False) -> IngestReport(added, updated, unchanged, removed, archived)`. CLI: `python -m scripts.ingest_knowledge [--dry-run] [--force]`, exit code 1 on any invalid file.
- [ ] One transaction per document; unchanged `content_hash` skips the embedding call; a changed document replaces its chunks; a deleted file removes its document and chunks; the same transaction upserts `catalog_recipes` by slug (validated recipes only) and archives rows whose file disappeared or whose status is no longer `validated`. A different `embedding_model` or dimension without `--force` aborts.
- [ ] Tests: running twice yields identical row counts and zero embedding calls the second time; editing one file re-embeds only that file; removing a file removes its chunks and archives its catalog row while a user's `SavedCatalogRecipe` rows remain (Review Focus 1); `--dry-run` writes nothing; an invalid recipe file fails the run with its path in the message; model change without `--force` aborts.

### Task 11: Retrieval

**Files:** Create `backend/app/rag/retrieval.py`, `backend/tests/test_retrieval.py`; modify `backend/app/core/config.py`.
**Produces:** `retrieve(db, provider, query: str, *, k: int, min_score: float, max_chars: int, statuses: tuple[str, ...] = ("validated","testing","not_recommended")) -> list[RetrievedChunk(text, title, heading_path, score, status)]`; raises `RetrievalUnavailableError` on provider or DB failure. Dedupe by chunk, trim to `max_chars`, drop below `min_score`. Settings: `RAG_TOP_K`, `RAG_MIN_SCORE`, `RAG_CONTEXT_MAX_CHARS`.
- [ ] Tests (fake provider): below-threshold chunks are dropped, so an unrelated query returns `[]`; results ordered by score; context budget respected; provider failure raises `RetrievalUnavailableError`; every result carries its `status`.

### Task 12: Chat uses retrieval, with fallback

**Files:** Modify `backend/app/agent/prompt.py`, `backend/app/agent/prompt_guard.py`, `backend/app/services/chat.py:~176-200` (`stream_turn`), `backend/tests/test_chat.py`, `backend/tests/test_prompt_guard.py`.
**Interfaces:** `build_system_blocks(user_name: str, retrieved: list[RetrievedChunk] | None) -> list[dict]`: `None` means fallback (the full knowledge block, cached as today); a list means a short cached instructions block plus an uncached `<retrieved_knowledge>` block, each chunk labeled with its title and status. Retrieval runs before the stream starts (in the threadpool, with the user's message as the query) and its database connection is released before the model call, keeping the existing rule that no connection is held while the model streams. `get_embedding_provider` is overridden in tests like `get_anthropic_client`.
- [ ] Prompt text: retrieved material is reference data; documented facts are separated from general advice; chunks marked `testing` are never presented as validated; say so when the base lacks the answer. Sources shown to users are document titles, never paths; the guard blocks paths and new internal markers.
- [ ] Tests: existing chat tests still pass; `RetrievalUnavailableError` produces a normal reply through the fallback (Review Focus 3); a retrieved chunk containing "ignore your rules" does not change behavior and its text is delimited as data (Review Focus 5); the guard blocks a streamed path or `<retrieved_knowledge>` marker.

### Task 13: Retrieval evals (only when the user asks)

**Files:** Modify `backend/evals/casos.json`.
- [ ] Add cases whose expected answer depends on one specific chunk, one on a `testing` recipe, and one with no answer in the base. Run with the `evaluar-respuestas-cafe` skill (this calls the API: ask first). Calibrate `RAG_MIN_SCORE` from the logged scores.

## Phase 4: Recipes API (backend-dev)

### Task 14: Catalog endpoints

**Files:** Create `backend/app/services/recipes.py`, `backend/app/api/routes/recipes.py`, `backend/tests/test_recipes_api.py`; modify `backend/app/main.py`.
**Produces:** `list_catalog(db, user_id, q, method, limit, offset)`, `get_catalog(db, user_id, slug)`.
- [ ] Tests: lists only validated, non-archived recipes; `q` matches name and description case-insensitively; `method` filters; detail returns `is_saved`/`is_favorite` for the caller; an archived recipe is not listed, but its detail is still returned (with `archived: true`) to a user who saved it and is 404 for anyone else; unknown slug is 404; unauthenticated is 401.

### Task 15: Library of catalog recipes

**Files:** Modify `backend/app/services/recipes.py`; create `backend/app/api/routes/library.py`, `backend/tests/test_library_api.py`.
- [ ] Tests: PUT twice is one row and 204 both times; PATCH `{is_favorite:true}` on an unsaved recipe saves it; PATCH false keeps it saved; DELETE removes and is idempotent; saving an archived recipe is allowed only if already saved; favorites persist across a new session; user B never sees user A's rows.

### Task 16: User recipes

**Files:** Modify `backend/app/services/recipes.py`, `backend/app/api/routes/library.py`; test `backend/tests/test_user_recipes_api.py`.
- [ ] POST with `{recipe}` creates a private recipe (`parent` null); POST with `{proposal_id}` copies the stored proposal (merging `overrides`), sets `parent` from the conversation's recipe ref and `conversation_id`, and marks the proposal saved; PUT replaces; PATCH toggles favorite; DELETE removes. `GET /api/me/recipes?filter=` unions created and saved as the contract says.
- [ ] Tests: each filter returns the expected set; invalid `RecipeData` is 422; another user's id is 404 for GET, PUT, PATCH and DELETE, and a foreign `proposal_id` is 404 (Review Focus 4); saving the same proposal twice returns the existing recipe.

### Task 17: Conversations REST

**Files:** Modify `backend/app/api/routes/conversations.py`, `backend/app/services/chat.py`, `backend/app/schemas/chat.py`; test `backend/tests/test_conversations_api.py`.
- [ ] `GET /api/conversations`, `POST /api/conversations` (optional `recipe_ref`; a catalog ref must exist, a user ref must be the caller's), `GET /api/conversations/{id}`. `/latest` keeps its behavior and is declared before `/{id}` so "latest" is not parsed as an id. Assistant messages in `/latest` and `/{id}` may carry the optional `proposal` (`StoredMessage` gains it; additive), so a refreshed chat still shows its Save cards.
- [ ] Tests: list is the caller's only and newest first; foreign id is 404; creating with another user's `recipe_ref` is 404; `/latest` still answers and is not shadowed by `/{id}`; a message with a proposal returns it in both endpoints.

### Task 18: Recipe-aware chat and proposals

**Files:** Create `backend/app/agent/recipe_tool.py`; modify `backend/app/services/chat.py`, `backend/app/agent/prompt.py`, `backend/app/api/routes/chat.py` (`format_sse`), `backend/tests/test_chat_recipes.py`.
**Interfaces:** `PROPOSE_RECIPE_TOOL: dict` (input schema generated from `RecipeData`); `build_system_blocks` gains a third parameter `recipe_context: str | None = None`, rendered as an uncached block after the retrieved one; the chat service builds, each turn, a delimited `<recipe_context>` block from the conversation's base recipe plus its latest proposal, with every field treated as data; after the stream, a valid `tool_use` input is validated with `RecipeData`, stored as `RecipeProposal(message_id)`, then emitted as `recipe`.
- [ ] Step 0: read the `claude-api` skill to confirm tool-use and streaming parameter shapes for the configured model.
- [ ] Tests (Claude mocked): a turn from a catalog recipe sends the recipe in context and never modifies it; a valid tool call emits `recipe` with a stored `proposal_id`; an invalid tool input (decreasing pours) emits no `recipe`, still delivers the text and is logged (Review Focus 2); a user recipe whose notes say "ignore previous instructions" stays inside the data block (Review Focus 5); nothing is saved without `POST /api/me/recipes`; **flow 1:** open catalog recipe, ask to adapt, receive proposal, save, it appears in `GET /api/me/recipes?filter=created` with its `parent`, favorite it, refetch with a new token and it persists; **flow 2:** a new conversation generates a recipe, save, it appears in the book.

### Task 19: Docs and contract export

**Files:** Modify `backend/README.md` (endpoint rows, env vars, SSE `recipe`), `backend/openapi.json`, `backend/tests/test_openapi.py`; run `gen:api` in `web/` and `mobile/`.
- [ ] Done when `export_openapi` produces no diff after a second run, `test_openapi` passes, and both apps typecheck against the new `schema.gen.ts`.

## Phase 5: Web (web-dev)

### Task 20: App shell and navigation

**Files:** Create `web/app/(app)/layout.tsx`, `web/components/layout/AppNav.tsx`; move `web/app/chat/page.tsx` to `web/app/(app)/chat/page.tsx`; modify `web/messages/{es,en}.json` (`nav`).
- [ ] The layout owns the auth guard (`useRequireAuth`), `Brand`, `AppControls`, sign out and a nav with Chat, Recipes, My recipes. Tests: nav labels exist in both locales; unauthenticated visits redirect to `/login`; `npm run typecheck && npm run test && npm run build` pass.

### Task 21: Catalog list and detail

**Files:** Create `web/app/(app)/recipes/page.tsx`, `web/app/(app)/recipes/[slug]/page.tsx`, `web/components/recipes/{RecipeCard,RecipeDetail,RecipeFilters}.tsx`, `web/hooks/{useRecipes,useRecipe,useRecipeLibrary}.ts`.
- [ ] The page title is "Recetas sugeridas por Coffee Master" (an i18n key, translated in English); cards with name, method, coffee and description; search and method filter; detail with every optional field handled when missing; save, favorite, Ask and Adapt actions; a "Coffee Master" vs "Mine" badge. Tests (hooks): list, filter, save, favorite toggle update the cache; missing fields do not crash `RecipeDetail`.

### Task 22: My recipes

**Files:** Create `web/app/(app)/my-recipes/page.tsx`, `web/app/(app)/my-recipes/[id]/page.tsx`, `web/components/recipes/{RecipeForm,MyRecipesTabs}.tsx`, `web/hooks/useMyRecipes.ts`.
- [ ] Tabs All, Favorites, Created by me, Saved; open, remove, favorite; edit own recipes only (the form validates with the zod mirror of `RecipeData`); empty and error states.

### Task 23: Chat integration

**Files:** Modify `web/components/chat/ChatView.tsx`, the chat hook and `web/lib/api` SSE parser; create `web/components/chat/{RecipeProposalCard,ConversationSwitcher}.tsx`, `web/hooks/{useConversations,useSaveProposal}.ts`.
- [ ] Ask and Adapt create a conversation with `recipe_ref` and open it with a "talking about X" banner; the stream's `recipe` event renders a card with a preview and an explicit Save button; the user can pick which proposal to save when there are several; a switcher lists conversations. Tests: parser handles `recipe`; saving calls `POST /api/me/recipes` once; the existing chat tests still pass.

## Phase 6: Mobile (general-purpose agent, `react-native-app` skill loaded first)

### Task 24: Expo Router navigation

**Files:** Modify `mobile/package.json`, `mobile/app.json`, `mobile/index.ts`; replace the `useState` screen switching in `mobile/App.tsx` with `mobile/app/` routes (`(auth)`, `(tabs)/{chat,recipes,my-recipes}`); modify `mobile/i18n/locales/{es,en}.json` (`nav`).
- [ ] Auth routes and tabs keep every current behavior (login, register, forgot password, confirmation, session in SecureStore). D1 is decided; first confirm the Expo Router version that is compatible with SDK 58. Done when `npm run typecheck && npm run test` pass and Expo Go opens login, then the tabs.

### Task 25-27: Screens mirroring web Tasks 21-23

**Files:** `mobile/app/(tabs)/recipes/*`, `mobile/app/(tabs)/my-recipes/*`, chat components, `mobile/components/recipes/*`, `mobile/hooks/*` with the same names as web.
- [ ] Same fields, actions, tabs, proposal card, conversation switcher and copy keys as web. Theme-aware components only. Tests: the hooks' tests mirror the web ones; the `es`/`en` key sets match.

## Phase 7: CI, docs, verification

### Task 28: Knowledge workflow

**Files:** Create `.github/workflows/database-sync.yml`; modify `backend/README.md`.
- [ ] `pull_request` on `backend/knowledge/**`, `backend/app/rag/**` and `backend/migrations/**`: install, run `ingest_knowledge --dry-run` with no secrets. `push` to `main` on the same paths: `alembic upgrade head`, then `ingest_knowledge` (a migration-only commit must still migrate the database). Migrations must be backward compatible with the code that is live (expand, then contract), because Vercel deploys in parallel with this workflow. `workflow_dispatch` with a `force` input. `concurrency` group so two runs never overlap. Secrets: `DATABASE_URL`; AWS access through an OIDC role (`aws-actions/configure-aws-credentials`), with no stored access keys. Spike first: GitHub runners are IPv4, so confirm the Supabase session pooler is the connection to use. The workflow commits and pushes nothing.

### Task 29: Project docs

**Files:** Modify `CLAUDE.md`, `.claude/skills/{coffee-knowledge,python-fastapi-backend,react-native-app,frontend-react-nextjs}/SKILL.md`, `.claude/agents/coffee-expert.md`.
- [ ] Document: the recipe file format, `ingest_knowledge`, docker and Alembic commands, REST endpoints, new env vars, navigation structure, the fallback loader and why it stays.

### Task 30: Review and verification

- [ ] `reviewer` agent reads each phase's diff; the orchestrator checks the contract-critical files itself (`schemas/recipe.py`, `openapi.json`, both `schema.gen.ts`).
- [ ] Run and report real output: `cd backend && .venv/bin/python -m pytest -q`, `cd web && npm run typecheck && npm run test && npm run build`, `cd mobile && npm run typecheck && npm run test`.
- [ ] Walk flow 1 and flow 2 by hand in the running web app and in Expo Go (the `run` skill).
- [ ] Final report: what changed, what was verified, what is pending (the real 600 ml V60 test, Azahar opción B, Origami, 4:6 in the press, the ANN index threshold).

## Order and Ownership

Phase 0, then Phase 1, then Task 6 (backend-dev first, then coffee-expert) in parallel with Task 7 (its Bedrock spike comes first). Task 8 needs Task 6's parser, and Task 9 needs the dimension fixed by Task 7's spike. Then Tasks 10 to 13 and Phase 4 in sequence on the backend. Web and mobile start once Task 19 exports the contract and then run in parallel. Phase 7 closes. `reviewer` runs at the end of every phase.
