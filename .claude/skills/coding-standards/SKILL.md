---
name: coding-standards
description: Reglas generales de código para todo el proyecto Coffee Master (inglés en código y comentarios, buenas prácticas, cambios pequeños y verificados). Usala en cualquier tarea que escriba o modifique código, en backend, web o mobile.
---

# Estándares de código (todo el proyecto)

## Idioma
- **Código y comentarios siempre en inglés**: nombres de variables, funciones, clases, archivos, tests, mensajes de commit y comentarios.
- Las cadenas que ve el usuario final (textos del chat, mensajes de error de la UI, mails) van en **español rioplatense**. Eso es contenido, no código.
- Los documentos de `backend/knowledge/cafe/` van en español porque son contenido para el agente.

## Calidad
- Cambios pequeños y enfocados. Una tarea, un cambio revisable.
- Sin código muerto, sin `print` de depuración, sin `TODO` sin dueño.
- Comentarios para explicar el **por qué**, no el qué. Evitar comentarios que repiten el código.
- No agregar dependencias sin justificarlo. Preferir la librería estándar o lo que ya está en el proyecto.
- Nunca commitear secretos (`.env`, claves). Los valores de ejemplo van en `.env.example`.

## Verificación antes de dar por terminado
- Backend: `pytest` pasa.
- Web: `npm run typecheck` y `npm run build` pasan.
- Si no se puede correr algo en el entorno, decirlo explícitamente y listar qué se verificó solo por lectura.

## Git
- No commitear ni hacer push sin pedido explícito.
- Mensajes de commit en inglés, en imperativo y cortos.

## Subagentes
- Un dominio por agente: `backend-dev` (backend/), `web-dev` (web/), `coffee-expert` (knowledge/), `reviewer` (solo lectura).
- Antes de cerrar una tarea grande, pasar el diff por `reviewer`.
