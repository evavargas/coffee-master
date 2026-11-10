# Deploy a producción (web + backend + base de datos)

La app va en tres piezas: la base en Supabase (PostgreSQL), el backend FastAPI en Vercel y la web Next.js en Vercel. La app móvil (APK) queda para más adelante.

Orden: base → backend → web → vuelta al backend para cerrar CORS. El orden importa porque la web necesita la URL del backend al compilarse, y el backend necesita la URL de la web para CORS.

## 1. Base de datos (Supabase)
1. Creá un proyecto en Supabase. Anotá la contraseña de la base.
2. En **Project Settings → Database → Connection string**, elegí **Transaction pooler** (puerto 6543).
3. Armá `DATABASE_URL` con el prefijo del driver `psycopg`:
   ```
   postgresql+psycopg://USER:PASSWORD@HOST:6543/postgres
   ```
   El código ya desactiva los prepared statements para el pooler (`app/db/session.py`).
4. **Las tablas las crea Alembic.** En una base nueva: `cd backend && DATABASE_URL='<la URL del paso 3>' .venv/bin/alembic upgrade head`. En una base que ya tenía tablas del código viejo, seguí el "Runbook" de `backend/README.md` (chequeo, `stamp 0001_baseline`, `upgrade head`). Nunca corras `alembic downgrade` contra Supabase.
5. Cargá el catálogo de recetas: `DATABASE_URL='...' .venv/bin/python -m scripts.ingest_knowledge --catalog-only`.
6. RLS: las migraciones lo activan en todas las tablas. Revisá el Security Advisor de Supabase.

## 2. Email (Gmail)
- Los mails salen de una cuenta de Gmail propia. No hace falta verificar un dominio.
- Activá la verificación en dos pasos en esa cuenta y creá una contraseña de aplicación en myaccount.google.com/apppasswords. Esa contraseña, no la de tu cuenta, va en `GMAIL_APP_PASSWORD`.
- Gmail permite unos 500 envíos por día. Si la app llega a ese límite, hay que pasar a un proveedor de email transaccional.

## 3. Generar secretos de producción
Usá valores nuevos, no los de desarrollo:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```
Ese valor es `JWT_SECRET` en producción.

## 4. Backend en Vercel
1. Vercel → **Add New → Project**, importá `evavargas/coffee-master` (o el repo que creaste).
2. **Root Directory**: `backend`. Vercel detecta FastAPI por `index.py`.
3. Variables de entorno (Production):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la URL de Supabase del paso 1 |
| `JWT_SECRET` | el secreto del paso 3 |
| `ANTHROPIC_API_KEY` | tu clave de Anthropic |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` (opcional). Es el valor por defecto y el más económico. Esta variable tiene prioridad sobre el código |
| `ANTHROPIC_EFFORT` | `low` (opcional). Subirlo mejora el razonamiento, pero gasta más tokens |
| `GMAIL_ADDRESS` | la cuenta de Gmail del paso 2 |
| `GMAIL_APP_PASSWORD` | la contraseña de aplicación del paso 2 |
| `FRONTEND_URL` | URL de la web de producción (paso 5) |
| `CORS_ORIGINS` | la misma URL de la web, sin barra final |
| `BEDROCK_REGION` | región de Bedrock, `us-east-2` (opcional: es el valor por defecto) |
| `AWS_BEARER_TOKEN_BEDROCK` | API key de Bedrock. Solo hace falta si vas a usar RAG |

Opcionales, con valor por defecto:

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `CHAT_DAILY_MESSAGE_LIMIT` | `50` | Mensajes por usuario al día. Es el tope de gasto en Anthropic. |
| `CHAT_CONTEXT_MESSAGES` | `40` | Mensajes anteriores que recibe el modelo en cada turno. |
| `EMAIL_SEND_IN_BACKGROUND` | `true` | Envía los mails después de responder. Ver el paso 7. |
| `RAG_ENABLED` | `false` | Con `true` el chat busca en la guía con embeddings en vez de cargarla entera. Activalo solo después de la ingesta real y de calibrar `RAG_MIN_SCORE`. Ver `backend/README.md`. |

4. Deploy. Anotá la URL del backend, por ejemplo `https://coffee-api.vercel.app`.
5. Prueba: `https://TU-BACKEND/api/health` debe responder `{"status":"ok"}`.

### GitHub Actions (sync de la base)
`.github/workflows/database-sync.yml`: en cada pull request valida el conocimiento; en cada push a `main` corre `alembic upgrade head` y sincroniza el catálogo. Configurá en el repo (Settings → Secrets and variables → Actions):
- Secret `DATABASE_URL`: la URI del **session pooler** de Supabase (puerto 5432), con `postgresql+psycopg://`. Los runners de GitHub solo tienen IPv4.
- Variable `RAG_INGEST=true` y secret `AWS_ROLE_ARN`: solo cuando AWS esté listo y quieras la ingesta con embeddings en cada push.
Vercel despliega en paralelo y no corre migraciones: el código que necesite una tabla nueva tiene que salir en un release posterior a la migración.

## 5. Web en Vercel
1. Vercel → **Add New → Project**, mismo repo.
2. **Root Directory**: `web`. Framework: Next.js.
3. Variable de entorno (Production), **antes del primer deploy**:
   - `NEXT_PUBLIC_API_URL` = la URL del backend del paso 4 (sin barra final).
4. Deploy. Anotá la URL de la web, por ejemplo `https://coffee-master.vercel.app`.

## 6. Cerrar la configuración
Volvé al proyecto del backend en Vercel, poné `FRONTEND_URL` y `CORS_ORIGINS` con la URL de la web del paso 5, y redeployá.

## 7. Verificación de punta a punta
1. Abrí la web de producción, registrate con un email real y confirmá con el código que llega por mail.
2. Iniciá sesión y mandá una pregunta al barista. La respuesta debe llamarte por tu nombre.
3. **Streaming**: la respuesta tiene que aparecer de a poco. Si aparece toda junta al final, Vercel está almacenando la respuesta: el chat funciona, pero sin ese efecto.
4. **Conversaciones**: recargá la página. La conversación tiene que seguir ahí.
5. **Mails**: pedí recuperar la contraseña varias veces, con más de un minuto entre pedidos, y confirmá que llega cada código. Los mails salen después de responder y no está comprobado que Vercel siempre termine ese trabajo. Si no llegan, poné `EMAIL_SEND_IN_BACKGROUND=false` y redeployá: vuelven a enviarse antes de responder, aunque el tiempo de respuesta puede dar una pista de qué emails están registrados.
6. **Consola del navegador**: no tiene que haber errores de `Content-Security-Policy`.
7. Probá el rate limit: más de 10 intentos de login por minuto devuelven 429.

## Orden de despliegue
- Web y backend cambian juntos: si cambia el contrato de la API, desplegá primero el backend y enseguida la web. En el medio, la web vieja puede fallar.
- Corré las migraciones pendientes **antes** de desplegar el código que las necesita.

## Límites conocidos (aceptables para el lanzamiento)
- **Rate limit en memoria**: cada instancia de Vercel tiene sus propios contadores. Con tráfico alto, moverlos a Redis o a Supabase.
- **Detrás de proxy**: el IP del cliente es el del proxy de Vercel, así que todos los usuarios comparten el límite. Antes de subir el límite, configurar la lectura de `X-Forwarded-For`.
- **RAG apagado**: con `RAG_ENABLED=false` el chat carga toda la guía en cada pedido. Prenderlo requiere el cupo de Bedrock aprobado y la ingesta real.
- **Gasto en Anthropic**: cada usuario tiene un tope diario de mensajes, pero el gasto total crece con la cantidad de usuarios. Revisar la facturación antes de abrirlo al público.
- **Límites de mails**: se permite un código por minuto y 5 por hora por email. Alguien que pida códigos para un email ajeno puede invalidar el código en uso y agotar ese cupo.

## Checklist antes de anunciar
- [ ] `GMAIL_ADDRESS` y `GMAIL_APP_PASSWORD` configuradas, y mails de prueba recibidos.
- [ ] `ANTHROPIC_MODEL` con un modelo válido, probado con un mensaje real.
- [ ] `JWT_SECRET` de producción distinto del de desarrollo.
- [ ] Clave de Anthropic con límite de gasto configurado.
- [ ] Ninguna clave en el repo (`git grep` sin resultados para `sk-ant-`).
- [ ] Prueba de punta a punta del paso 7 completa.
