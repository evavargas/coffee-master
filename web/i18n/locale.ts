// Locale constants shared between server config (i18n/request.ts) and client components
// (e.g. LanguageSwitcher). Kept separate from request.ts so client bundles don't pull in
// "next/headers".
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const DEFAULT_LOCALE = "es";
export const SUPPORTED_LOCALES = ["es", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}
