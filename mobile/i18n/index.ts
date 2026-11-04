import AsyncStorage from "@react-native-async-storage/async-storage";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";

export const LOCALE_STORAGE_KEY = "coffeemaster.locale";
export const DEFAULT_LOCALE = "es";
export const SUPPORTED_LOCALES = ["es", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(value: string | null): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

void i18next.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

// Product decision: default to Spanish, not the device locale, unless the
// user already picked a language on a previous launch.
AsyncStorage.getItem(LOCALE_STORAGE_KEY).then((stored) => {
  if (isSupportedLocale(stored) && stored !== i18next.language) {
    void i18next.changeLanguage(stored);
  }
});

export default i18next;
