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
- **Celular**: una app con las mismas funciones que la web. Todavía no está en las tiendas de aplicaciones, así que por ahora solo se puede probar con Expo Go.

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

## Para quienes desarrollan

- Instrucciones del proyecto: [CLAUDE.md](CLAUDE.md)
- Cómo publicar la app: [DEPLOY.md](DEPLOY.md)
- Diseño visual: [DESIGN.md](DESIGN.md)
- Especificación y plan de la versión 2: [docs/superpowers](docs/superpowers)
- Referencia de la API: [backend/README.md](backend/README.md)
