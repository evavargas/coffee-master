---
name: react-native-app
description: Reglas para la app móvil de MasterCoffe en mobile/ (Expo, React Native, TypeScript). Hooks para la lógica, axios para HTTP, zod y react-hook-form para formularios, sesión en SecureStore. Usala al crear o tocar pantallas, hooks o llamadas a la API en mobile/.
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

## Estructura
```
mobile/
  App.tsx                      raíz: elige pantalla (login/register/forgotPassword) o chat según la sesión
  context/ThemeContext.tsx     ThemeProvider + useAppTheme()
  i18n/                        instancia de i18next + locales/{es,en}.json
  components/auth/             FormField (compartido), LoginForm, RegisterForm, ForgotPasswordForm
  components/chat/             ChatScreen (solo markup y hooks)
  components/layout/           LanguageSwitcher, ThemeToggle
  hooks/                       useSession, useLocale, useCountdown, useLoginForm, useRegisterForm,
                                useForgotPasswordForm, useConfirmEmailForm, useVerifyResetCode,
                                useResetPasswordForm, useResendConfirmation, useChat
  lib/api/client.ts            instancia de axios, token y manejo de 401
  lib/api/auth.ts, chat.ts     funciones tipadas de la API
  lib/schemas/auth.ts          esquemas zod
  lib/session.ts               acceso a SecureStore
```

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
