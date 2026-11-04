---
name: frontend-react-nextjs
description: Reglas para el frontend de MasterCoffe en web/ (Next.js App Router, React, TypeScript). Hooks para reutilizar lógica, shadcn/ui para componentes, axios para HTTP, zod para validación. Usala al crear o modificar páginas, componentes, hooks o llamadas a la API.
---

# Frontend: React + Next.js + TypeScript

Para decisiones visuales (layout, tipografía, color, estados), invocar también la skill `anthropic-skills:frontend-design`.
Para código y comentarios, aplicar `coding-standards` (inglés siempre).

## Stack obligatorio
- **Next.js App Router** + React + TypeScript estricto (`strict: true`, sin `any`).
- **shadcn/ui** para todos los componentes de UI (Button, Input, Card, Label, Form). No crear componentes de UI desde cero si shadcn ya tiene uno.
- **Tailwind CSS** como base de shadcn. Los estilos globales viven en `app/globals.css` (variables de tema).
- **axios** para todas las llamadas HTTP, a través de la instancia de `lib/api/client.ts`. Nada de `fetch` directo en componentes.
- **zod** para esquemas de formularios y de respuestas de la API. Los tipos se infieren de los esquemas (`z.infer`).
- **react-hook-form** + `@hookform/resolvers/zod` para formularios. Un formulario = un esquema zod.
- **yup**: no se usa en este proyecto. Zod ya cubre la validación; tener dos librerías de validación genera dos fuentes de verdad.
- **next-intl** para i18n: mensajes en `messages/{es,en}.json`, `useTranslations()` en componentes y hooks. Las claves de `es`/`en` siempre tienen que coincidir. Español por defecto (cookie `NEXT_LOCALE`), sin prefijo de idioma en la URL.
- **next-themes** para el tema (sistema/claro/oscuro): variables CSS en `app/globals.css` (`:root` + `.dark`), nunca colores hardcodeados.

## Hooks para reutilizar lógica
La lógica de estado y de efectos vive en hooks de `hooks/`, no en componentes:
- `useCurrentUser`, `useRequireAuth`: sesión actual y redirect a `/login` si no hay sesión.
- `useLoginForm`, `useRegisterForm`, `useForgotPasswordForm`: formulario + llamada + estado de error y de éxito.
- `useConfirmEmailCode`, `useVerifyResetCode`, `useResetPasswordForm`: confirmación de email y recuperación de contraseña por código de 6 dígitos (ver `CLAUDE.md`, sección Auth). `useCountdown`: cuenta regresiva de vencimiento del código.
- `useResendConfirmation`: reenvío del código de confirmación.
- `useChat`: mensajes, envío, estado de carga y error.

Reglas:
1. Un componente de página solo compone hooks y markup. Sin `axios` ni `localStorage` directo.
2. Un hook no devuelve JSX.
3. Si la misma lógica aparece en dos lugares, moverla a un hook antes de copiarla.
4. Los hooks que hacen llamadas exponen `isLoading`, `error` y la acción. Nunca lanzan errores hacia la UI sin capturarlos.

## Estructura
```
web/
  app/                 rutas (App Router), layouts y páginas
  components/
    ui/                componentes de shadcn (no editar a mano salvo necesidad)
    auth/              formularios de autenticación (usan hooks)
    chat/              componentes del chat
  hooks/               lógica reutilizable
  lib/
    api/client.ts      instancia de axios y interceptor de token
    api/auth.ts        funciones de la API de auth (tipadas con zod)
    api/chat.ts        funciones de la API de chat
    schemas/           esquemas zod compartidos
    utils.ts           cn() y utilidades pequeñas
```

## Autenticación en el cliente
- El token JWT se guarda en `localStorage` bajo una sola clave (definida en `lib/session.ts`).
- El interceptor de axios agrega `Authorization: Bearer <token>`. Si la API responde 401, se limpia la sesión y se redirige a `/login`.
- Las páginas protegidas usan `useRequireAuth`.

## Configuración
- `NEXT_PUBLIC_API_URL` apunta al backend (ver `web/.env.example`). No hardcodear hosts.

## Accesibilidad y UX
- Labels asociados a cada input. Mensajes de error junto al campo, con `aria-invalid`.
- `aria-live` en la conversación del chat.
- Estados de carga visibles en todos los botones que llaman a la API (`disabled` + texto).

## Verificación
```bash
cd web && npm run typecheck && npm run build && npm run test
```
