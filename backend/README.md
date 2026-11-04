# Coffee Master backend

FastAPI service: email-confirmed accounts (JWT sessions of 7 days) and the coffee agent.
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
| `DATABASE_URL` | no | Defaults to `sqlite:///./coffeemaster.db`. |
| `GMAIL_ADDRESS` | for email | The Gmail account codes are sent from. Without it, codes are not delivered (failures are logged; endpoints still answer as usual). |
| `GMAIL_APP_PASSWORD` | for email | A Google "app password" for `GMAIL_ADDRESS` (myaccount.google.com/apppasswords), not the account's real password. Requires 2-Step Verification on that Google account. |
| `EMAIL_FROM_NAME` | no | Display name shown in emails. Defaults to `Coffee Master`. The `From` address itself is always `GMAIL_ADDRESS` — Gmail's SMTP relay rejects sending as a different address. |
| `EMAIL_SEND_IN_BACKGROUND` | no | Defaults to `true`: emails go out after the response. Set to `false` if codes stop arriving in production. |
| `FRONTEND_URL` | yes | Base URL of the frontend app. Not used to build email links anymore (confirmation and reset now use 6-digit codes), kept for other frontend-facing uses. |
| `CORS_ORIGINS` | no | Comma-separated allowed origins. |
| `RATE_LIMIT_AUTH_PER_MINUTE` | no | Requests per minute per IP on `/api/auth/*`. Default 10. |
| `RATE_LIMIT_CHAT_PER_MINUTE` | no | Requests per minute per IP on `/api/chat`. Default 20. |
| `RATE_LIMIT_CONVERSATIONS_PER_MINUTE` | no | Requests per minute per IP on `/api/conversations/*`. Default 60. |

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
| GET | `/api/conversations/latest` | bearer | — | 200 `{conversation_id: int\|null, messages: [{role: "user"\|"assistant", content}]}`, chronological; `null` and `[]` when none | 401 session · 429 IP limit |

## Chat streaming
The server stores the history: the client sends only the new message. Before the stream starts, errors are normal JSON `{"detail": "<Spanish>"}`. After a `200`, the body is Server-Sent Events (`Cache-Control: no-cache`, `X-Accel-Buffering: no`), each as `event: <name>` + `data: <json>` + blank line:

| Event | Data | Meaning |
|---|---|---|
| `start` | `{"conversation_id": int}` | Always first. |
| `delta` | `{"text": str}` | Zero or more; append to the assistant bubble. |
| `replace` | `{"text": str}` | Replace the whole assistant bubble (the output guard blocked a leak). |
| `done` | `{}` | Terminal, success. |
| `error` | `{"code": "model_busy" \| "model_unavailable"}` | Terminal, failure. `model_busy` is Anthropic 429/529; everything else is `model_unavailable`. Details are only logged. |

If the model finishes without writing any text (for example, reasoning used up `max_tokens`), the turn ends with `replace` and `done`: the reply is a short message, and the turn is stored and counts for the quota because it was billed.

Persistence: the user message is committed before the model is called (so disconnecting cannot dodge the daily quota). On success the assistant's guarded text is saved. On a model error the user message is deleted (a retry does not duplicate it or burn quota). On client disconnect the user message stays and no partial reply is saved. No database connection is held while the model streams.

The daily quota counts the user's own messages since 00:00 UTC. The model context is the last `CHAT_CONTEXT_MESSAGES` stored messages, trimmed so the first one is from the user.

The machine-readable contract is `backend/openapi.json`. Regenerate it after changing any endpoint: `cd backend && .venv/bin/python -m scripts.export_openapi` (a test fails if it is stale).

## Token and code rules
- Access tokens: `purpose=access`, 7 days.
- Email confirmation and password reset use a 6-digit code (not a JWT), stored server-side with an expiry and an attempt counter. A code expires after 15 minutes or after 5 wrong guesses, whichever comes first.
- Password reset is two steps: `verify-reset-code` consumes the code and returns a short-lived JWT (`purpose=reset_password_verified`, 10 minutes) that the client holds in memory; `reset-password` consumes that JWT. It includes a fingerprint of the current password hash, so it works only once.
- Access tokens carry a `pwd` claim (fingerprint of the password hash). Changing the password invalidates every open session; a token without the claim is rejected.
- Per-email limits, per (user, purpose), from the stored code rows: no new code within `VERIFICATION_CODE_COOLDOWN_SECONDS` of the last one, and at most `VERIFICATION_CODE_MAX_PER_HOUR` per rolling hour (which also bounds total guesses). When limited nothing is sent, the current code stays valid, and the endpoint answers exactly as on success. Applies to register (re-issue), resend-confirmation and forgot-password.
- A token of one purpose is rejected by endpoints that expect another.

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
