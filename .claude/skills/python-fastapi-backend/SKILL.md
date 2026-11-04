---
name: python-fastapi-backend
description: Buenas prácticas para el backend Python de MasterCoffe (FastAPI, Pydantic v2, SQLAlchemy, JWT, Gmail SMTP, agente Claude). Usala al crear o modificar endpoints, servicios, modelos, el agente o los tests en backend/. Incluye la documentación obligatoria de endpoints.
---

# Backend Python (FastAPI)

Para código y comentarios, aplicar `coding-standards` (inglés siempre).
Para seguridad del agente (prompt injection), aplicar `prompt-injection-guard`.

## Estructura
```
backend/app/
  main.py              app factory: middlewares, routers, lifespan
  core/config.py       Settings (pydantic-settings), leídos del entorno
  core/security.py     hashing de contraseñas, creación y validación de JWT
  core/deps.py         dependencias (sesión de DB, usuario actual)
  db/session.py        engine, SessionLocal, Base
  models/              modelos SQLAlchemy
  schemas/             modelos Pydantic de entrada y salida
  services/            lógica de negocio y servicios externos (email, agente)
  api/routes/          routers por dominio: auth.py, chat.py, conversations.py, health.py
  agent/               prompt, conocimiento y guard del agente
backend/scripts/       export_openapi.py: genera backend/openapi.json
backend/openapi.json   contrato del que web y mobile generan sus tipos (`npm run gen:api`)
backend/tests/         pytest, TestClient, base SQLite temporal
backend/evals/         casos de prueba del chat
```

## Reglas
1. **Capas**: la ruta valida y llama al servicio; el servicio no conoce HTTP; el modelo no conoce negocio.
2. **Pydantic v2** para todo input y output. Limitar longitudes (`max_length`) y formatos (`EmailStr`, patrones).
3. **Dependencias inyectadas** con `Depends` (sesión de DB, cliente de Claude, sender de email). Así los tests reemplazan lo externo con `app.dependency_overrides`.
4. **Secretos** solo desde el entorno (`Settings`). Nunca loguear ni devolver claves, tokens ni contraseñas.
5. **Contraseñas** con un hash fuerte (argon2 vía `pwdlib`). Nunca guardarlas en texto plano.
6. **Errores**: `HTTPException` con mensajes claros en español (son contenido visible) y códigos HTTP correctos (401 credenciales o token, 403 email no confirmado, 404, 422 validación, 429 límite). Una vez iniciado el stream del chat, los fallos se informan con el evento `error` y un código, nunca con el detalle interno.
7. **No revelar existencia de cuentas**: en register, resend-confirmation y forgot-password, la respuesta es siempre la misma.
8. **Async** en rutas que llaman al SDK de Anthropic. No retener una conexión a la base durante la llamada al modelo. El envío por SMTP es bloqueante: va en `BackgroundTasks`, con su propia sesión, para que el tiempo de respuesta no revele si se envió un mail.
9. **CORS** desde `CORS_ORIGINS`. Nunca `*` en producción.
10. **Tests**: un test por comportamiento. Base SQLite temporal, sender de email falso, cliente de Claude falso. Ningún test llama a la red.

## Documentación de endpoints (obligatoria)
Cada endpoint se documenta con:
- `summary` y `description` en el decorador (aparecen en `/docs`).
- `response_model` explícito y `responses` con los códigos de error que puede devolver.
- Una tabla en `backend/README.md` con: método, path, auth requerida, body, respuesta y errores.

Ejemplo de decorador:
```python
@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in with email and password",
    description="Returns a JWT valid for 7 days. The email must be confirmed.",
    responses={401: {"description": "Invalid credentials"}, 403: {"description": "Email not confirmed"}},
)
```

## Autenticación (decisiones del proyecto)
- JWT HS256, expiración de 7 días, sin refresh ni logout (la app no tiene riesgo alto).
- Claims: `sub` (id de usuario), `exp`, `iat`.
- Tokens de mail (confirmación y reset) son JWT aparte, con claim `purpose` (`confirm_email` o `reset_password`) y expiración corta (24 h y 30 min).
- El token de reset incluye un fragmento del hash de la contraseña actual (`pwd`). Al cambiar la contraseña, el link queda inválido: es de un solo uso.

## Comandos
```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q
.venv/bin/uvicorn app.main:app --reload --port 8000
```

## Escalado
- Si el conocimiento supera lo que cabe en el prompt, pasar a búsqueda semántica (ver `coffee-knowledge`).
