# Coffee Master backend

FastAPI service: email-confirmed accounts (JWT sessions of 7 days), the coffee agent, the recipe catalog and each user's recipe book.
Interactive docs with the same information: `http://localhost:8000/docs`.

## Setup
```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env      # then fill in ANTHROPIC_API_KEY, JWT_SECRET, GMAIL_ADDRESS, GMAIL_APP_PASSWORD
.venv/bin/python -m pytest -q
.venv/bin/uvicorn app.main:app --reload --port 8000
```

## Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | yes | Signs all tokens. Generate a long random value. |
| `ANTHROPIC_API_KEY` | for chat | Key for the Claude API. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-haiku-5-5`, the cheapest current model. |
| `ANTHROPIC_EFFORT` | no | Defaults to `low`. Higher effort reasons more and spends more tokens. |
| `ANTHROPIC_TIMEOUT_SECONDS` | no | Request timeout for the Claude client. Default 120. |
| `CHAT_DAILY_MESSAGE_LIMIT` | no | User messages per user per UTC day. Default 50. |
| `CHAT_CONTEXT_MESSAGES` | no | Last N stored messages sent to the model each turn. Default 40. |
| `VERIFICATION_CODE_COOLDOWN_SECONDS` | no | Minimum gap between codes for one (user, purpose). Default 60. |
| `VERIFICATION_CODE_MAX_PER_HOUR` | no | Max codes per (user, purpose) per rolling hour. Default 5. |
| `EMBEDDING_MODEL_ID` | no | Embedding model. Defaults to `us.cohere.embed-v4:0` (the cross-region inference profile: Bedrock rejects on-demand calls to the bare `cohere.embed-v4:0`); `cohere.embed-multilingual-v3` is also supported. The IAM policy must also allow the inference profile ARN, not only the foundation model. |
| `EMBEDDING_DIMENSIONS` | no | Vector size. Default 1024 (fixed at 1024 for the multilingual v3 model). |
| `BEDROCK_REGION` | no | AWS region for Bedrock. Default `us-east-2`. Not `AWS_REGION`, which Vercel sets to the function's own region. |
| `RAG_ENABLED` | no | Chat uses retrieval instead of the full knowledge. Default false (see "RAG in the chat"). |
| `RAG_FALLBACK_ON_EMPTY` | no | Empty retrieval falls back to the full knowledge. Default true. |
| `RAG_TOP_K` | no | Max chunks returned by retrieval. Default 5. |
| `RAG_MIN_SCORE` | no | Minimum cosine similarity. Default 0.25, not calibrated (see Retrieval). |
| `RAG_CONTEXT_MAX_CHARS` | no | Budget for the total text of the retrieved chunks. Default 6000. |
| `RAG_RETRIEVAL_TIMEOUT_SECONDS` | no | Time limit for one retrieval (embedding plus query). Default 5. |
| `DATABASE_URL` | no | Defaults to the local docker Postgres: `postgresql+psycopg://postgres:postgres@localhost:5432/coffeemaster`. |
| `GMAIL_ADDRESS` | for email | The Gmail account codes are sent from. Without it, codes are not delivered (failures are logged; endpoints still answer as usual). |
| `GMAIL_APP_PASSWORD` | for email | A Google "app password" for `GMAIL_ADDRESS` (myaccount.google.com/apppasswords), not the account's real password. Requires 2-Step Verification on that Google account. |
| `EMAIL_FROM_NAME` | no | Display name shown in emails. Defaults to `Coffee Master`. The `From` address itself is always `GMAIL_ADDRESS` — Gmail's SMTP relay rejects sending as a different address. |
| `EMAIL_SEND_IN_BACKGROUND` | no | Defaults to `true`: emails go out after the response. Set to `false` if codes stop arriving in production. |
| `FRONTEND_URL` | yes | Base URL of the frontend app. Not used to build email links (confirmation and reset use 6-digit codes), only for other frontend-facing uses. |
| `CORS_ORIGINS` | no | Comma-separated allowed origins. |
| `RATE_LIMIT_AUTH_PER_MINUTE` | no | Requests per minute per IP on `/api/auth/*`. Default 10. |
| `RATE_LIMIT_CHAT_PER_MINUTE` | no | Requests per minute per IP on `/api/chat`. Default 20. |
| `RATE_LIMIT_CONVERSATIONS_PER_MINUTE` | no | Requests per minute per IP on `/api/conversations/*`. Default 60. |
| `RATE_LIMIT_RECIPES_PER_MINUTE` | no | Requests per minute per IP on `/api/recipes/*`. Default 60. |

## Database
- Start the local Postgres (pgvector) first: `docker compose up -d db` from `backend/`. It also creates `coffeemaster_test`, used by the tests.
- The init script runs only on a fresh volume: with an existing volume, run `docker compose down -v` to create the test database.

## Migrations
The app creates no tables at startup: the schema is managed with Alembic (`alembic.ini`, `migrations/`).

**Which database?** Alembic always takes its URL from the app settings, which read `backend/.env`. Without an inline `DATABASE_URL`, it runs against whatever `.env` points at, which may be Supabase. Always write the URL inline.

- Local setup: `docker compose up -d db`, then `DATABASE_URL='postgresql+psycopg://postgres:postgres@localhost:5432/coffeemaster' .venv/bin/alembic upgrade head`.
- New migration: `DATABASE_URL='postgresql+psycopg://postgres:postgres@localhost:5432/coffeemaster' .venv/bin/alembic revision --autogenerate -m "..."`, then review the generated file by hand.
- The recipe tables arrive with migration `0002_recipes`, so after stamping `0001_baseline` the normal `alembic upgrade head` applies it.
- The knowledge tables (RAG) arrive with `0003_knowledge`, which runs `CREATE EXTENSION IF NOT EXISTS vector`. On Supabase, either enable `vector` first from Database > Extensions (it then lives in the `extensions` schema and the migration skips it) or let the migration create it in `public` (the Security Advisor then warns about an extension in public: harmless but noisy). Both work because the column type resolves through the search path. The first `upgrade head` that includes `0003` needs a role allowed to create extensions (the `postgres` role in Supabase is). The deploy order rule is unchanged: run `upgrade head` before pushing code that needs the tables. Unverified against Supabase: that the `postgres` role can create extensions and that the unqualified type name resolves through the search path (`"$user", public, extensions`). Pre-check before the first Supabase `upgrade head`: run `SHOW search_path;` in the Supabase SQL editor and confirm it includes `extensions` (or `public` if the migration creates the extension there); if the path lacks the schema where the extension lives, the migration fails with `type "vector" does not exist`.
- Deploys: Vercel runs no migrations and the app creates no tables, so a fresh database (a new Supabase project or a preview environment) serves 500s on its first query. Before promoting a deploy that includes a new migration, run `DATABASE_URL='<the URL the app uses, see "Which Supabase URL" above>' .venv/bin/alembic upgrade head`. The "CI: database sync workflow" section automates this on pushes to `main`.
- Never run `alembic downgrade` against Supabase (`downgrade base` drops every table).
- Which Supabase URL: the one the app already uses in `backend/.env` (the Supabase transaction pooler, port 6543, scheme rewritten to `postgresql+psycopg://`) works for the check script, `alembic stamp` and `alembic upgrade head`: the engines used by Alembic and the script disable prepared statements, and the script sets read-only per transaction. The session pooler on port 5432 is the alternative. If a run fails with an error about prepared statements or about an unsupported startup parameter, switch to the 5432 URL. This was verified locally but not against Supabase's pooler.
- Supabase URL shape (same URL as the app): `postgresql+psycopg://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres`, where the host is the pooler host shown by Supabase. The Supabase dashboard shows `postgresql://`; rewrite the scheme to `postgresql+psycopg://`, otherwise SQLAlchemy looks for psycopg2. Percent-encode special characters in the password.

### Runbook: existing Supabase database (one time)
The tables were created by the old startup code, so never run `alembic upgrade` from scratch there. Stamp instead.

1. Read-only check, from `backend/` (do not use `alembic check`: on an unstamped database it fails with "Target database is not up to date" and compares nothing):
```
DATABASE_URL='<the URL the app uses, see "Which Supabase URL" above>' .venv/bin/python -m scripts.check_baseline_schema
```
   Stamp only if it prints `SAFE TO STAMP`. If it prints `NOT SAFE TO STAMP`, stop and investigate; do not stamp. Every transaction the script runs is read only, ignores only the objects added after `0001_baseline` (the recipe tables from `0002_recipes`, the knowledge tables from `0003_knowledge` and the indexes from `0004_fk_indexes`), and flags an existing `alembic_version` table. The script prints the target as `host:port/database` first: confirm it is the Supabase database before stamping. It is one-time: delete `scripts/check_baseline_schema.py` and its test after the production database is stamped.
   Deploy order for `0002_recipes`: promoting a deploy that includes it before it runs on Supabase makes `/api/chat` and `/api/conversations/latest` return 500 (the `Conversation` model selects two columns Supabase does not have yet). Safe order: see `SAFE TO STAMP`, stamp `0001_baseline`, run `alembic upgrade head` (inline `DATABASE_URL`), and only then push or promote the deploy. Migrating first is safe because `0002` only adds objects.
2. Optional second check, manual SQL cross-check, read-only: run it with `PGOPTIONS='-c default_transaction_read_only=on' psql "<postgresql:// URL>"`, or paste it in the Supabase SQL editor:
```
select table_name,column_name,data_type,character_maximum_length,is_nullable from information_schema.columns where table_schema='public' order by 1,ordinal_position;
select indexname,indexdef from pg_indexes where schemaname='public';
```
3. Stamp once: `DATABASE_URL='<the URL the app uses, see "Which Supabase URL" above>' .venv/bin/alembic stamp 0001_baseline`.
4. Confirm: `DATABASE_URL='<the URL the app uses, see "Which Supabase URL" above>' .venv/bin/alembic current` must print `0001_baseline` (without `(head)`: the head is `0005_enable_rls`).
5. From then on, `DATABASE_URL='<the URL the app uses, see "Which Supabase URL" above>' .venv/bin/alembic upgrade head` is the normal path.

## Security: Row Level Security

Migration `0005_enable_rls` runs `ENABLE ROW LEVEL SECURITY` (no policies) on every public table: `users`, `verification_codes`, `conversations`, `chat_messages`, `catalog_recipes`, `user_recipes`, `saved_catalog_recipes`, `recipe_proposals`, `knowledge_documents`, `knowledge_chunks` and `alembic_version`. On Supabase this denies the Data API (PostgREST, public anon key). The backend connects as the `postgres` role, which bypasses RLS, so the app is unaffected. The downgrade is a deliberate no-op.

Owner action: `0005` is idempotent over tables that already have RLS. After running the runbook, rerun the Security Advisor linter and confirm no `rls_disabled_in_public` finding remains. Any new table needs its own `ENABLE ROW LEVEL SECURITY` in its migration.

## Authentication
- Sessions use `Authorization: Bearer <access_token>`.
- The access token lasts 7 days. There is no refresh token and no logout endpoint, by design (low-risk app).
- A new account can log in only after confirming its email.

## Endpoints

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/health` | none | — | 200 `{"status":"ok"}` | — |
| POST | `/api/auth/register` | none | `{name, email, password}` | 201 `{message}` (same for new, unconfirmed and confirmed emails) | 422 invalid · 429 IP limit |
| POST | `/api/auth/resend-confirmation` | none | `{email}` | 202 `{message}` | 422 invalid email |
| POST | `/api/auth/confirm-email` | none | `{email, code}` (code: 6-digit string) | 200 `{message}` | 400 invalid, expired or attempts-exhausted code |
| POST | `/api/auth/login` | none | `{email, password}` | 200 `{access_token, token_type, expires_in}` | 401 bad credentials · 403 email not confirmed |
| POST | `/api/auth/forgot-password` | none | `{email}` | 202 `{message}` (same for any email) | 422 invalid email |
| POST | `/api/auth/verify-reset-code` | none | `{email, code}` (code: 6-digit string) | 200 `{reset_token}` | 400 invalid, expired or attempts-exhausted code |
| POST | `/api/auth/reset-password` | none | `{reset_token, new_password}` | 200 `{message}` | 400 invalid, expired or used token · 422 invalid password |
| GET | `/api/auth/me` | bearer | — | 200 `{id, name, email}` | 401 missing or invalid session |
| POST | `/api/chat` | bearer | `{conversation_id: int\|null, message}` (message 1..4000 chars, `null` starts a new conversation) | 200 `text/event-stream` (see "Chat streaming") | 401 session · 404 conversation missing or not yours · 422 invalid or empty message · 429 IP limit or daily quota (`Retry-After`) |
| GET | `/api/conversations` | bearer | query `limit` (1..100, default 20), `offset` (>= 0) | 200 `{items: [{id, recipe_ref: {kind, ref}\|null, created_at, updated_at}], total, limit, offset}`; the caller's only, last activity first (`updated_at` = last message, or creation when empty; newest id breaks ties) | 401 session · 422 invalid query · 429 IP limit |
| POST | `/api/conversations` | bearer | `{recipe_ref?: {kind: "catalog"\|"user", ref: slug string\|int id}}` (no other fields) | 201 `{id, recipe_ref, created_at, updated_at}`; a catalog ref follows the `GET /api/recipes/{slug}` visibility rule (validated, or archived and saved by the caller); a user ref must be the caller's; the new conversation is empty so `/latest` does not return it (open it by id with `GET /{id}`) | 401 session · 404 unknown, unavailable, foreign or mismatched-type ref (same body) · 422 invalid body or extra field · 429 IP limit |
| GET | `/api/conversations/{id}` | bearer | — | 200 `{id, recipe_ref, messages: [{role, content, proposal}]}`, chronological; `recipe_ref` still shows an archived recipe on the caller's old conversations | 401 session · 404 unknown or not yours (same body) · 429 IP limit |
| GET | `/api/conversations/latest` | bearer | — | 200 `{conversation_id: int\|null, recipe_ref: {kind, ref}\|null, messages: [{role: "user"\|"assistant", content, proposal}]}`, chronological; `proposal` is `{proposal_id, recipe, saved_recipe_id\|null}` or null (also null when the stored data is unreadable); `recipe_ref` is the same as in `GET /{id}` (null when the conversation has none); `null`, `null` and `[]` when there is no conversation | 401 session · 429 IP limit |
| GET | `/api/recipes` | bearer | query `q` (substring of name, description or coffee name, max 100), `method` (v60, french_press, moka, aeropress, espresso, cold_brew, other), `limit` (1..100, default 20), `offset` (>= 0) | 200 `{items: [recipe], total, limit, offset}`; `total` counts every match, a page can hold fewer than `limit` items if a stored recipe is unreadable, so advance `offset` by `limit` (not by `len(items)`); validated, non-archived recipes by name; each has `slug, status, source, archived, is_saved, is_favorite` plus the recipe fields | 401 session · 422 invalid query (including `q` over 100 chars, not truncated) · 429 IP limit |
| GET | `/api/recipes/{slug}` | bearer | — | 200 recipe (same shape as a list item); an archived recipe only if the caller saved it | 401 session · 404 unknown, or archived and not saved · 429 IP limit |
| PUT | `/api/me/library/catalog/{slug}` | bearer | — | 204 no body; saves the recipe to the caller's book, idempotent (keeps `is_favorite` and `saved_at`) | 401 session · 404 unknown, not validated, or archived and not saved (same body) · 429 IP limit (shared with `/api/recipes`) |
| PATCH | `/api/me/library/catalog/{slug}` | bearer | `{is_favorite: bool}` (no other fields) | 200 `{slug, is_saved, is_favorite}`; `true` saves the recipe if needed, `false` keeps it saved and is a no-op (`is_saved: false`) when not saved | 401 session · 404 as PUT · 422 missing, extra or non-boolean field · 429 IP limit |
| DELETE | `/api/me/library/catalog/{slug}` | bearer | — | 204 no body; removes the caller's row, idempotent for an active recipe; works on an archived recipe the caller saved | 401 session · 404 unknown, or archived and not saved · 429 IP limit |
| GET | `/api/me/recipes` | bearer | query `filter` (all, favorites, created, saved; default all), `limit` (1..100, default 20), `offset` (>= 0) | 200 `{items: [{kind: "catalog"\|"user", recipe}], total, limit, offset}`; created recipes plus saved catalog recipes, newest activity first (`updated_at` for own recipes, `saved_at` for saved ones; favoriting never reorders); `favorites` spans both kinds; `total` counts unreadable rows too | 401 session · 422 invalid query · 429 IP limit |
| POST | `/api/me/recipes` | bearer | exactly one of `{recipe: RecipeData}` or `{proposal_id: int >= 1, overrides?: partial RecipeData}` | 201 user recipe `{id, parent, is_favorite, conversation_id, created_at, updated_at}` plus the recipe fields; from a proposal, `parent` and `conversation_id` come from its conversation and the proposal is marked saved; saving the same proposal again is 200 with the existing recipe (`overrides` ignored); `overrides` is a shallow merge: top-level keys replace whole values; its validation errors are 422 with `loc` starting `body, overrides` | 401 session · 404 proposal unknown or not the caller's (same body) · 422 neither or both sources, invalid recipe, or overrides that fail validation · 429 IP limit |
| GET | `/api/me/recipes/{id}` | bearer | — | 200 user recipe | 401 session · 404 unknown, not the caller's, or unreadable (same body) · 429 IP limit |
| PUT | `/api/me/recipes/{id}` | bearer | `RecipeData` (full replace; parent, conversation and favorite are kept) | 200 user recipe | 401 session · 404 as GET · 422 invalid recipe · 429 IP limit |
| PATCH | `/api/me/recipes/{id}` | bearer | `{is_favorite: bool}` (no other fields) | 200 user recipe; does not change `updated_at`; an unreadable stored recipe is 404 with no change | 401 session · 404 as GET · 422 invalid body · 429 IP limit |
| DELETE | `/api/me/recipes/{id}` | bearer | — | 204 no body; not idempotent; an unreadable stored recipe can still be deleted | 401 session · 404 as GET · 429 IP limit |

## Chat streaming
The server stores the history: the client sends only the new message. Before the stream starts, errors are normal JSON `{"detail": "<Spanish>"}`. After a `200`, the body is Server-Sent Events (`Cache-Control: no-cache`, `X-Accel-Buffering: no`), each as `event: <name>` + `data: <json>` + blank line:

| Event | Data | Meaning |
|---|---|---|
| `start` | `{"conversation_id": int}` | Always first. |
| `delta` | `{"text": str}` | Zero or more; append to the assistant bubble. |
| `replace` | `{"text": str}` | Replace the whole assistant bubble (the output guard blocked a leak). |
| `recipe` | `{"proposal_id": int, "recipe": RecipeData}` | At most one, after the last `delta`/`replace` and before `done`. Only when the model called `propose_recipe` and the input passed `RecipeData` validation (otherwise the text still arrives and the failure is only logged). Nothing enters the user's book until `POST /api/me/recipes {proposal_id}`. |
| `done` | `{}` | Terminal, success. |
| `error` | `{"code": "model_busy" \| "model_unavailable"}` | Terminal, failure. `model_busy` is Anthropic 429/529; everything else is `model_unavailable`. Details are only logged. |

If the model finishes without writing any text (for example, reasoning used up `max_tokens`), the turn ends with `replace` and `done`: the reply is a short message, and the turn is stored and counts for the quota because it was billed.

Recipe-aware chat: a conversation opened with a `recipe_ref` (`POST /api/conversations`) gets, every turn, (and so does any conversation without a ref once it holds a proposal) a delimited `<recipe_context>` system block with that recipe and the latest stored proposal (all data, `<` escaped, never instructions). The model always has the `propose_recipe` tool and decides whether to call it; it can never modify a saved recipe. If it calls the tool and writes no text, the reply is a short Spanish "proposal ready" line (sent as `replace`).

Persistence: the user message is committed before the model is called (so disconnecting cannot dodge the daily quota). On success the assistant's guarded text is saved (and the proposal, if any, in the same transaction). On a model error the user message is deleted (a retry does not duplicate it or burn quota). On client disconnect the user message stays and no partial reply is saved. No database connection is held while the model streams.

The daily quota counts the user's own messages since 00:00 UTC. The model context is the last `CHAT_CONTEXT_MESSAGES` stored messages, trimmed so the first one is from the user.

The machine-readable contract is `backend/openapi.json`. Regenerate it after changing any endpoint: `cd backend && .venv/bin/python -m scripts.export_openapi` (a test fails if it is stale).

## Token and code rules
- Access tokens: `purpose=access`, 7 days.
- Email confirmation and password reset use a 6-digit code (not a JWT), stored server-side with an expiry and an attempt counter. A code expires after 15 minutes or after 5 wrong guesses, whichever comes first.
- Password reset is two steps: `verify-reset-code` consumes the code and returns a short-lived JWT (`purpose=reset_password_verified`, 10 minutes) that the client holds in memory; `reset-password` consumes that JWT. It includes a fingerprint of the current password hash, so it works only once.
- Access tokens carry a `pwd` claim (fingerprint of the password hash). Changing the password invalidates every open session; a token without the claim is rejected.
- Per-email limits, per (user, purpose), from the stored code rows: no new code within `VERIFICATION_CODE_COOLDOWN_SECONDS` of the last one, and at most `VERIFICATION_CODE_MAX_PER_HOUR` per rolling hour (which also bounds total guesses). When limited nothing is sent, the current code stays valid, and the endpoint answers exactly as on success. Applies to register (re-issue), resend-confirmation and forgot-password.
- A token of one purpose is rejected by endpoints that expect another.

## Embeddings (Amazon Bedrock)
- Default model: Cohere Embed v4 through the cross-region inference profile `us.cohere.embed-v4:0` at 1024 dimensions. It distinguishes documents (`search_document`) from queries (`search_query`), a split designed for matching short queries against long documents. Only the Cohere family is implemented. `cohere.embed-multilingual-v3` is accepted by the code but is not available in `us-east-2`.
- One-time enablement: the Cohere models are AWS Marketplace products. The account owner must, once, from an identity with `aws-marketplace:Subscribe` and `aws-marketplace:ViewSubscriptions` and an account with a valid payment method, make one `invoke_model` call to the model in `us-east-2` (console playground or CLI), then check that `aws bedrock get-foundation-model-availability --model-id cohere.embed-v4:0` shows `AVAILABLE`. Until the subscription completes (about 15 minutes) calls fail with `AccessDeniedException`.
- Runtime IAM policy (add the multilingual v3 ARN only if you use it):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeEmbeddingModel",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": [
        "arn:aws:bedrock:us-east-2::foundation-model/cohere.embed-v4:0",
        "arn:aws:bedrock:us-east-2::foundation-model/cohere.embed-multilingual-v3"
      ]
    }
  ]
}
```
- Quota: the Embed V4 tokens-per-minute quota (Bedrock > Quotas, row "Embed V4 / Geo cross-region") must be above 0, otherwise calls fail with `ThrottlingException: Too many tokens per day`. The AWS default is 300,000.
- Credentials come from boto3's default chain (a Bedrock API key in `AWS_BEARER_TOKEN_BEDROCK` also works); no secrets live in the repo or in settings. Locally: `AWS_PROFILE` or the exported API key, never `backend/.env`. Vercel: for now a dedicated least-privilege IAM user, with its access keys as sensitive environment variables. GitHub Actions: an OIDC role (set up in a later task).
- The client is synchronous; async callers use `retrieve_with_timeout` (it enforces the 8-thread cap and the timeout).
- Not stated in the AWS docs: vector normalization (retrieval uses cosine distance, which does not need it).
- Not stated in the AWS docs: Cohere v4's Spanish quality and its price. Confirm retrieval quality later against `backend/evals/casos.json`.
- Tests never call AWS: they inject a fake client or `FakeEmbeddingProvider` (`tests/fake_embeddings.py`).

## Knowledge ingestion
Fills `knowledge_documents`, `knowledge_chunks` (embedded) and the recipe catalog `catalog_recipes` from `backend/knowledge/cafe/`. It is an offline batch command, never part of a chat request. Run it after editing `backend/knowledge/cafe/`.
```bash
cd backend
.venv/bin/python -m scripts.ingest_knowledge --dry-run                      # validate and chunk only
DATABASE_URL='<url>' .venv/bin/python -m scripts.ingest_knowledge          # ingest
DATABASE_URL='<url>' .venv/bin/python -m scripts.ingest_knowledge --force  # re-embed everything
DATABASE_URL='<url>' .venv/bin/python -m scripts.ingest_knowledge --catalog-only  # catalog only, no AWS
```
- `--dry-run` needs no database and no AWS; it needs no settings or secrets at all. It prints the number of documents, chunks and recipe files.
- Without `--dry-run` the CLI refuses to run (exit 2) unless `DATABASE_URL` is set in the shell (it never reads `backend/.env`), and prints the target as `host:port/database` before connecting. It calls Amazon Bedrock for real (credentials from the default chain, see Embeddings). The cost is small (about 100 short chunks per full run), but the model price is not stated in the AWS docs.
- Unchanged files (same content hash and model) are skipped with no embedding call. Changed files replace their chunks in one transaction per document; files that disappeared are removed. A different embedding model or dimension aborts unless `--force`.
- Changing the chunker, `RecipeData` or the embedding model needs `--force`: unchanged file hashes are skipped, so the stored catalog `data` and the chunks would stay stale otherwise.
- `--catalog-only` syncs only `catalog_recipes` (same upsert and archive rules as a normal run, same validation, same safeguards) and writes no documents or chunks. It builds no embedding provider, so it needs no AWS credentials, but it still loads the app settings (`JWT_SECRET` and the rest, through the environment or `backend/.env`). It does NOT refresh chunks: only a normal run does, so after a catalog-only archive the chunks keep their old label until the next normal run (which re-syncs the catalog of unchanged documents and relinks their chunks without any embedding call). Use it for a database that has no chunks yet (before the AWS account is ready) and to keep the catalog in sync when a normal run is not possible. It cannot be combined with `--dry-run` (exit 2).
- A normal run also repairs the catalog of an unchanged document without embedding (for example after `--catalog-only` archived its row): a repaired validated recipe counts as `updated`; a repaired guide or `testing`/`not_recommended` recipe counts as `unchanged` plus `archived` when a row was archived.
- Safety: an empty or missing root is an error, and a run that would remove more than half of the documents (and more than 3) aborts unless `--force` (in `--catalog-only`, the same rule applies to archived catalog rows).
- Exit codes: 0 success, 1 invalid knowledge, a document that failed to embed (the rest are still ingested) or a database error, 2 usage, abort, configuration or connection problem.
- Catalog recipes are archived, never deleted: only `validated` recipes are in the catalog; a recipe that becomes `testing`/`not_recommended` or whose file is removed is archived, and an archived recipe whose file returns is un-archived.
- Add a recipe: a new file in `backend/knowledge/cafe/recetas/` with the frontmatter described by `RecipeData` (`type: recipe`, `id`, `status`, plus the recipe fields). Remove one: delete the file; its catalog row is archived and users who saved it keep it.

## Retrieval (RAG)
`app/rag/retrieval.py`. The query is embedded first (`kind="query"`, no database access before it), then one SQL statement picks the nearest `k * 3` chunks by cosine distance. Scores are cosine similarity (1.0 identical, 0.0 orthogonal).
- In Python, in rank order: drop chunks below `RAG_MIN_SCORE`, collapse duplicate texts, stop at `RAG_TOP_K`, and keep whole chunks within `RAG_CONTEXT_MAX_CHARS` (a chunk is never truncated; one that does not fit is skipped, the first is always kept).
- Settings: `RAG_TOP_K` (5), `RAG_MIN_SCORE` (0.25), `RAG_CONTEXT_MAX_CHARS` (6000), `RAG_RETRIEVAL_TIMEOUT_SECONDS` (5). The `0.25` threshold is NOT calibrated: it is a conservative starting point to tune with retrieval evals on real Cohere embeddings.
- `testing` and `not_recommended` chunks are returned with their `status`, so the prompt can label them.
- Any embedding or database failure, or a timeout in `retrieve_with_timeout`, raises `RetrievalUnavailableError`, so the chat can fall back to the full knowledge.

## RAG in the chat
Settings: `RAG_ENABLED` (default `false`) and `RAG_FALLBACK_ON_EMPTY` (default `true`). While `RAG_ENABLED` is false nothing changes for users: the chat sends the whole knowledge base and never calls the embedding provider.
To turn it on:
1. Ingest the knowledge into the target database (`python -m scripts.ingest_knowledge`).
2. Have the AWS account and Bedrock model access ready (the chat embeds each message).
3. Set `RAG_ENABLED=true`.
4. Calibrate `RAG_MIN_SCORE` with the retrieval evals: 0.25 is uncalibrated.

Per message, before the model call and with no database connection held, the chat retrieves with the current user message. The model then gets only the retrieved chunks inside `<retrieved_knowledge>` (data, labeled `validada` / `en prueba` / `no recomendada`, cited by title only). On `RetrievalUnavailableError` (embedding, database or timeout) it falls back to the full knowledge, exactly as with RAG off. An empty retrieval also falls back, unless `RAG_FALLBACK_ON_EMPTY=false`, in which case the model is told nothing relevant was found. Each turn logs (no text) `rag`, `fallback_error`, `fallback_empty` or `disabled`, the chunk count and the best score.
Known limitation: only the current message is embedded, so very short follow-ups ("and with less water?") retrieve weakly.

## CI: database sync workflow
`.github/workflows/database-sync.yml`. It commits and pushes nothing.
- Pull requests touching `backend/knowledge/**`, `backend/app/rag/**`, `backend/migrations/**`, `backend/app/schemas/recipe.py`, `backend/scripts/ingest_knowledge.py`, `backend/requirements.txt` or the workflow: `ingest_knowledge --dry-run` with no secrets, no database and no AWS (so a `RecipeData` change that breaks a recipe file is caught before merge).
- Push to `main` on `backend/knowledge/**`, `backend/app/rag/**`, `backend/migrations/**`, `backend/app/schemas/recipe.py` or `backend/scripts/ingest_knowledge.py` (not on the workflow file itself): `alembic upgrade head` first, with no AWS involved (a migration-only commit must still migrate), then the ingestion. The ingestion is the full `ingest_knowledge` (AWS OIDC role + Bedrock) only when the repository variable `RAG_INGEST` is `true`; otherwise it runs `ingest_knowledge --catalog-only`, which needs no AWS. Runs never overlap (`concurrency: database-sync`, no cancellation).
- Manual run (Actions > Database sync > Run workflow, on `main`): the boolean `force` input adds `--force` (re-embed everything; needed after changing the chunker, `RecipeData` or the embedding model).
- Configure in the repo settings: secret `DATABASE_URL`, secret `AWS_ROLE_ARN`, variables `BEDROCK_REGION` (optional, defaults to `us-east-2`) and `RAG_INGEST` (`true` once AWS and the Cohere subscription are ready; leave unset until then). No AWS access keys are stored: the job (the only one with `id-token: write`) assumes the role through GitHub OIDC.
- `DATABASE_URL` must be the Supabase session pooler URI (port 5432, `*.pooler.supabase.com`) with the scheme `postgresql+psycopg://`. GitHub runners are IPv4-only and Supabase's direct host is IPv6-only, so the direct host is unreachable. The transaction pooler (6543) also works in this repo (prepared statements are disabled) but the session pooler is the documented choice for migrations. Note the app on Vercel keeps using its own URL.
- IAM role: trust policy for `token.actions.githubusercontent.com` (OIDC provider, audience `sts.amazonaws.com`) with `StringEquals` on `token.actions.githubusercontent.com:sub` = `repo:<owner>/<repo>:ref:refs/heads/main` (and `:aud` = `sts.amazonaws.com`); permissions: the `bedrock:InvokeModel` policy from "Embeddings (Amazon Bedrock)".
- Expand-then-contract: Vercel deploys the app in parallel with this workflow, so while a migration runs the live code may be the old or the new one. This protects OLD code against the NEW schema: migrations must only add (tables, nullable columns, indexes) in one release; drops and renames go in a later release, once no live code uses the old shape. The reverse window also exists: code that needs a NEW database object must ship in a release AFTER the migration has run, otherwise the new code can serve before `upgrade head` finishes and answer 500.
- The workflow runs `alembic upgrade head`, so a database that already has tables from before Alembic must be stamped `0001_baseline` first (see the runbook); on an unstamped database it would run from scratch.
- Python is 3.14 in CI, same as the local venv.
- Known risk: timing-based tests may be flaky on slow runners (the workflow does not run the test suite; keep it that way or loosen those tests first).
- Known risk: `Settings` requires `JWT_SECRET`, which alembic and the real ingestion load. The sync job sets a dummy placeholder for it (neither uses it); the dry-run job needs none because it imports no settings.

## Security notes
- Passwords are hashed with argon2 (`pwdlib`).
- Forgot-password and register never reveal whether an email is registered (register always answers 201 with the same message; if the email already has a confirmed account, nothing is sent). Registering again on an unconfirmed account replaces its name and password, so a pre-registration cannot keep access once the mailbox owner registers and confirms.
- Rejected code checks spend the same hashing time as real ones, and attempts and consumption are atomic updates, so parallel guesses cannot exceed the limit or reuse a code.
- Register, resend-confirmation and forgot-password send email after responding, so response time does not reveal whether an account exists. `EMAIL_SEND_IN_BACKGROUND=false` sends before responding instead, for hosts that stop the function once it responds; that brings the timing difference back.
- Login verifies against a dummy hash when the email is unknown, to even out timing.
- User names are HTML-escaped in emails.
- User text is sanitized before it reaches the model, and streamed replies pass an incremental filter that holds back enough trailing text so a prompt marker split across chunks is never emitted. See `.claude/skills/prompt-injection-guard`.
- Rate limiting: fixed window of 60 s per client IP and endpoint group. Over the limit, the API returns `429` with `Retry-After` and a Spanish `detail`. Counters live in process memory: fine for one instance, move them to Redis before running several.
- Behind a reverse proxy, the client IP is the proxy's address unless the server is configured to trust forwarded headers. Set that up at deploy time, or every user shares one limit.
- Email goes out through `GMAIL_ADDRESS`'s own Gmail account (chosen deliberately for a small user base — no domain to verify). Regular Gmail accounts cap at ~500 sends/day; if that's ever a real ceiling, move to a provider with a verified-domain or single-sender setup (SendGrid, Brevo, SES) instead.
