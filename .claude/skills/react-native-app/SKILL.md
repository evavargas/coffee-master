---
name: react-native-app
description: Reglas para la app móvil de Coffee Master en mobile/ (Expo, React Native, TypeScript). Hooks para la lógica, axios para HTTP, zod y react-hook-form para formularios, sesión en SecureStore. Usala al crear o tocar pantallas, hooks o llamadas a la API en mobile/.
---

# App móvil: React Native + Expo

Para código y comentarios, aplicar `coding-standards` (inglés siempre).
La app móvil no se publica en tiendas por ahora; sirve para desarrollo y pruebas.

## Principios
- Consume la misma API que la web. No duplicar lógica de café ni de auth en el cliente.
- Las reglas de hooks, axios y zod son las mismas que en la web (ver `frontend-react-nextjs`).

## Stack
- **Expo SDK 58**, React Native 0.88, TypeScript estricto.
- **axios** para HTTP, solo a través de `lib/api/client.ts`.
- **zod** para validar formularios y respuestas de la API.
- **react-hook-form** + `@hookform/resolvers/zod` para formularios.
- **expo-secure-store** para guardar el JWT (Keychain en iOS, Keystore en Android). Nunca usar AsyncStorage para tokens (sí se usa AsyncStorage para preferencias no sensibles: idioma y tema).
- **react-i18next** para i18n: `i18n/locales/{es,en}.json`, `useTranslation()` en cada componente/hook. Las claves de `es`/`en` siempre tienen que coincidir.
- Theming propio (`context/ThemeContext.tsx`, `useAppTheme()`): sistema/claro/oscuro. Nunca colores hardcodeados en los estilos; siempre `colors.*` del contexto.
- Fuentes de marca (`DESIGN.md`): importá `Text` y `TextInput` de `@/components/ui/Text` y `@/components/ui/TextInput`, no de `react-native`. Aplican Roboto Mono y eligen el archivo según `fontWeight`. Los tamaños de letra siguen definidos en cada estilo.

## Estructura
```
mobile/
  app/                         rutas de Expo Router: (auth), (tabs), _layout.tsx, index.tsx
  context/ThemeContext.tsx     ThemeProvider + useAppTheme()
  i18n/                        instancia de i18next + locales/{es,en}.json
  components/auth/             FormField (compartido), LoginForm, RegisterForm, ForgotPasswordForm
  components/chat/             ChatScreen (solo markup y hooks)
  components/layout/           LanguageSwitcher, ThemeToggle
  hooks/                       useSession, useLocale, useCountdown, useLoginForm, useRegisterForm,
                                useForgotPasswordForm, useConfirmEmailForm, useVerifyResetCode,
                                useResetPasswordForm, useResendConfirmation, useChat
  lib/api/client.ts            instancia de axios, token y manejo de 401
  lib/api/auth.ts, chat.ts, recipes.ts, myRecipes.ts  funciones tipadas de la API (conversaciones en chat.ts)
  lib/schemas/auth.ts          esquemas zod
  lib/session.ts               acceso a SecureStore
```

## Navegación (Expo Router)
- `app/_layout.tsx` raíz; `app/index.tsx` redirige según la sesión. `app/(auth)/`: `login`, `register`, `forgot-password`. `app/(tabs)/`: `chat`, `recipes/` (`index`, `[slug]`) y `my-recipes/` (`index`, `[id]`), cada pila con su `_layout.tsx`.
- Params del chat (`c`, `intent`) con `useLocalSearchParams`; mismo contrato que la web: `c` abre esa conversación, `intent` (`ask`|`adapt`) solo elige el prompt inicial.

## Caches y stores
- Los caches de módulo (`lib/recipeStore.ts`, `lib/userRecipeStore.ts`, `lib/chatEpoch.ts`) son por usuario: se limpian con `onSessionChange` de `lib/session.ts` (login, sign-out y 401).
- Epoch guards para respuestas tardías; lock por ítem con rollback en guardar, favorito y borrar.
- Toda respuesta de la API pasa por zod `safeParse`, con esquemas tolerantes (`.passthrough()`, `.catch(...)`): un ítem inválido se omite.
- Confirmaciones destructivas dentro de la pantalla (`components/recipes/ConfirmButton.tsx`), nunca `Alert.alert`.
- Mismos nombres de hooks y archivos que en la web (`useRecipes`, `useRecipeLibrary`, `useSaveProposal`, ...).
- i18n: interpolación `{{x}}` (en la web es `{x}`) y plurales con claves `_one`/`_other` (en la web, ICU). `interpolation.escapeValue` está en `false` (`i18n/index.ts`) porque React Native no interpreta HTML; no lo cambies.

## Reglas
1. Hooks para toda la lógica; los componentes solo componen hooks y markup.
2. Un hook nunca devuelve JSX.
3. Sin `fetch` ni `axios` directo en componentes.
4. Sesión expirada (401): el interceptor avisa y `useSession` borra la sesión.
5. Accesibilidad: `accessibilityLabel` en inputs y `accessibilityRole` en botones.
6. Teclado: `KeyboardAvoidingView` en el chat. `keyboardShouldPersistTaps="handled"` en listas.

## URL del backend
- Emulador Android: `http://10.0.2.2:8000` (valor por defecto).
- Simulador iOS: `http://localhost:8000`.
- Teléfono físico: IP de tu máquina en la red local, en `EXPO_PUBLIC_API_URL` (en `mobile/.env`).

## Comandos
```bash
cd mobile && npm install
npm run typecheck
npm run test
npm start            # escanear el QR con Expo Go
```
