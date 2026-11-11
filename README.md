# Coffee Master

Coffee Master es un chat para aprender a preparar mejor café en casa. Le preguntás a un barista virtual y te responde por tu nombre, en español y con consejos concretos.

## Qué podés hacer

- **Explorar el catálogo de recetas** validadas (V60, prensa francesa, moka, espresso y más), con ingredientes, pasos y molienda.
- **Armar tu recetario**: guardá recetas del catálogo, marcá tus favoritas y editá las tuyas.
- **Adaptar una receta con el chat**: preguntá sobre una receta o pedí una adaptación (otra cantidad, otro café) y, si te gusta, la guardás en tu recetario. Nada se guarda sin tu confirmación.
- **Pedir recetas** para métodos como V60, prensa francesa, moka o espresso.
- **Calcular cantidades**: decile cuánto café o agua tenés y te indica las proporciones.
- **Resolver problemas de sabor**: si tu café sale amargo o ácido, te sugiere qué cambiar, de a una cosa por vez.
- **Retomar tu conversación**: cuando volvés, la última charla sigue ahí, y podés abrir las anteriores desde el historial.

Las respuestas y las recetas se basan en una guía de café armada para este proyecto.

## Dónde se usa

- **Web**: desde cualquier navegador, en [coffeemasteruy.vercel.app](https://coffeemasteruy.vercel.app).
- **Celular (Android)**: una app con las mismas funciones que la web. **[Descargar el APK](https://github.com/evavargas/coffee-master/releases/latest/download/coffee-master.apk)**. Al abrirlo, Android puede pedirte permiso para instalar apps desde ese origen: aceptalo solo para esta instalación. No está en las tiendas de aplicaciones.

Las dos están disponibles en español e inglés, con modo claro y oscuro.

## Cómo empezar

1. Creá una cuenta con tu nombre, email y contraseña.
2. Escribí el código de 6 dígitos que te llega por mail.
3. Iniciá sesión y hacé tu primera pregunta.

Cada usuario tiene un límite de mensajes por día. Si olvidás tu contraseña, podés cambiarla con un código que te enviamos por mail.

## Con qué está hecho

| Parte | Tecnología |
|---|---|
| Inteligencia artificial | Claude, de Anthropic |
| Sitio web | Next.js y React |
| App para celular | Expo y React Native |
| Servidor | Python y FastAPI |
| Base de datos | PostgreSQL con pgvector, en Supabase (migraciones con Alembic) |
| Búsqueda en la guía (RAG, opcional) | Embeddings Cohere Embed v4 en Amazon Bedrock |
| Publicación | Vercel |
| Envío de mails | Gmail |

## Cómo funciona por dentro

- **Respuestas en streaming.** El chat usa Server-Sent Events: el texto aparece a medida que Claude lo escribe, igual en web y en el celular.
- **El servidor guarda el historial.** El cliente solo manda el mensaje nuevo; el servidor arma el contexto con los últimos mensajes guardados. Así el costo por mensaje no crece sin control.
- **Costo controlado.** Usa un modelo económico con esfuerzo de razonamiento bajo, un tope de mensajes de contexto y un límite diario por usuario (que se cuenta aunque el cliente se desconecte).
- **Recetas que no se guardan solas.** Claude puede *proponer* una receta, pero nada entra al recetario hasta que la persona la confirma, y el modelo nunca edita una receta ya guardada.
- **Texto del usuario = datos, no instrucciones.** Hay reglas contra prompt injection y casos de prueba para evaluar las respuestas (`backend/evals/casos.json`).
- **Conocimiento propio.** Las respuestas se basan en una guía de café en markdown dentro del repo; la búsqueda semántica (RAG con pgvector) es opcional.
- **Un solo contrato de API.** El backend genera `openapi.json` y web y móvil generan sus tipos desde ahí.
- **Cuentas seguras.** Código de 6 dígitos por mail, vencimiento e intentos limitados, y la misma respuesta exista o no el email, para no revelar quién está registrado.

## Cómo lo construí con IA

Coffee Master se desarrolló con desarrollo asistido por IA (Claude Code). El trabajo se apoya en documentos dentro del repo en lugar de en prompts sueltos:

- [CLAUDE.md](CLAUDE.md) define la estructura, las reglas no negociables (i18n, temas, capas del backend) y qué no hacer.
- [docs/superpowers](docs/superpowers) guarda la especificación y el plan de cada etapa.
- Los casos de `backend/evals/casos.json` sirven para verificar el chat después de cada cambio.

La idea: yo decido producto, diseño y límites; la IA acelera la implementación, y las reglas escritas y las pruebas son las que mantienen el resultado consistente.

## Para quienes desarrollan

- Instrucciones del proyecto: [CLAUDE.md](CLAUDE.md)
- Cómo publicar la app: [DEPLOY.md](DEPLOY.md)
- Diseño visual: [DESIGN.md](DESIGN.md)
- Especificación y plan de la versión 2: [docs/superpowers](docs/superpowers)
- Referencia de la API: [backend/README.md](backend/README.md)
