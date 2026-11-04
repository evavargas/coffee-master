# Deploy a producción (web + backend + base de datos)

La app va en tres piezas: la base en Supabase (PostgreSQL), el backend FastAPI en Vercel y la web Next.js en Vercel. La app móvil (APK) queda para más adelante.

Orden: base → backend → web → vuelta al backend para cerrar CORS. El orden importa porque la web necesita la URL del backend al compilarse, y el backend necesita la URL de la web para CORS y para los links de los mails.

## 1. Base de datos (Supabase)
1. Creá un proyecto en Supabase. Anotá la contraseña de la base.
2. En **Project Settings → Database → Connection string**, elegí **Transaction pooler** (puerto 6543).
3. Armá `DATABASE_URL` con el prefijo del driver `psycopg`:
   ```
   postgresql+psycopg://USER:PASSWORD@HOST:6543/postgres
   ```
   El código ya desactiva los prepared statements para el pooler (`app/db/session.py`).
4. Las tablas se crean solas al arrancar el backend. Para producción real, migrar a Alembic antes del próximo cambio de esquema.

## 2. Email (Resend)
- Con `onboarding@resend.dev`, Resend solo entrega a la dirección dueña de la cuenta. **Para usuarios reales hace falta un dominio verificado** en Resend (DNS con registros DKIM/SPF).
- Cuando el dominio esté verificado, poné en `EMAIL_FROM` algo como `MasterCoffee <no-reply@tudominio.com>`.

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
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` (opcional) |
| `RESEND_API_KEY` | tu clave de Resend |
| `EMAIL_FROM` | remitente del dominio verificado |
| `FRONTEND_URL` | URL de la web de producción (paso 5) |
| `CORS_ORIGINS` | la misma URL de la web, sin barra final |

4. Deploy. Anotá la URL del backend, por ejemplo `https://coffee-api.vercel.app`.
5. Prueba: `https://TU-BACKEND/api/health` debe responder `{"status":"ok"}`.

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
3. Probá recuperar contraseña y el rate limit (más de 10 intentos de login por minuto devuelven 429).

## Límites conocidos (aceptables para el lanzamiento)
- **Rate limit en memoria**: cada instancia de Vercel tiene sus propios contadores. Con tráfico alto, moverlos a Redis o a Supabase.
- **Detrás de proxy**: el IP del cliente es el del proxy de Vercel, así que todos los usuarios comparten el límite. Antes de subir el límite, configurar la lectura de `X-Forwarded-For`.
- **Sin migraciones**: `create_all` al arrancar. Alembic después del lanzamiento.
- **Cuota de Anthropic**: el chat consume tokens por mensaje. Revisar la facturación antes de abrirlo al público.

## Checklist antes de anunciar
- [ ] Dominio verificado en Resend y `EMAIL_FROM` actualizado.
- [ ] `JWT_SECRET` de producción distinto del de desarrollo.
- [ ] Clave de Anthropic con límite de gasto configurado.
- [ ] Ninguna clave en el repo (`git grep` sin resultados para `sk-ant-` ni `re_`).
- [ ] Prueba de punta a punta del paso 7 completa.
