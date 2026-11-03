# MasterCoffe backend

FastAPI service: email-confirmed accounts (JWT sessions of 7 days) and the coffee agent.
Interactive docs with the same information: `http://localhost:8000/docs`.

## Setup
```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env      # then fill in ANTHROPIC_API_KEY, JWT_SECRET, RESEND_API_KEY
.venv/bin/python -m pytest -q
.venv/bin/uvicorn app.main:app --reload --port 8000
```

## Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | yes | Signs all tokens. Generate a long random value. |
| `ANTHROPIC_API_KEY` | for chat | Key for the Claude API. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5-5`. |
| `DATABASE_URL` | no | Defaults to `sqlite:///./mastercoffee.db`. |
| `RESEND_API_KEY` | for email | Resend API key. Without it, registration returns 503. |
| `EMAIL_FROM` | no | Sender shown in emails. Use a domain verified in Resend in production. |
| `FRONTEND_URL` | yes | Base URL for links in emails (`/confirm-email`, `/reset-password`). |
| `CORS_ORIGINS` | no | Comma-separated allowed origins. |
| `RATE_LIMIT_AUTH_PER_MINUTE` | no | Requests per minute per IP on `/api/auth/*`. Default 10. |
| `RATE_LIMIT_CHAT_PER_MINUTE` | no | Requests per minute per IP on `/api/chat`. Default 20. |

## Authentication
- Sessions use `Authorization: Bearer <access_token>`.
- The access token lasts 7 days. There is no refresh token and no logout endpoint, by design (low-risk app).
- A new account can log in only after confirming its email.

## Endpoints

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/health` | none | — | 200 `{"status":"ok"}` | — |
| POST | `/api/auth/register` | none | `{name, email, password}` | 201 `{message}` | 409 email taken · 422 invalid · 503 mail not sent (account created) |
| POST | `/api/auth/resend-confirmation` | none | `{email}` | 202 `{message}` | 422 invalid email |
| POST | `/api/auth/confirm-email` | none | `{token}` | 200 `{message}` | 400 invalid or expired token |
| POST | `/api/auth/login` | none | `{email, password}` | 200 `{access_token, token_type, expires_in}` | 401 bad credentials · 403 email not confirmed |
| POST | `/api/auth/forgot-password` | none | `{email}` | 202 `{message}` (same for any email) | 422 invalid email |
| POST | `/api/auth/reset-password` | none | `{token, new_password}` | 200 `{message}` | 400 invalid, expired or used token · 422 invalid password |
| GET | `/api/auth/me` | bearer | — | 200 `{id, name, email}` | 401 missing or invalid session |
| POST | `/api/chat` | bearer | `{messages: [{role: "user"\|"assistant", content}]}` (max 40 messages, 4000 chars each) | 200 `{reply}` | 401 session · 422 invalid messages or last message not from user |

## Token rules
- Access tokens: `purpose=access`, 7 days.
- Confirmation tokens: `purpose=confirm_email`, 24 hours.
- Reset tokens: `purpose=reset_password`, 30 minutes. They include a fingerprint of the current password hash, so they work only once.
- A token of one purpose is rejected by endpoints that expect another.

## Security notes
- Passwords are hashed with argon2 (`pwdlib`).
- Forgot-password never reveals whether an email is registered.
- User text is sanitized before it reaches the model, and replies are checked for leaked prompt markers. See `.claude/skills/prompt-injection-guard`.
- Rate limiting: fixed window of 60 s per client IP and endpoint group. Over the limit, the API returns `429` with `Retry-After` and a Spanish `detail`. Counters live in process memory: fine for one instance, move them to Redis before running several.
- Behind a reverse proxy, the client IP is the proxy's address unless the server is configured to trust forwarded headers. Set that up at deploy time, or every user shares one limit.
