import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { LOCALE_STORAGE_KEY, type Locale } from "@/i18n";

/** Current language and a setter that persists the choice for the next launch. */
export function useLocale() {
  const { i18n } = useTranslation();
  const locale = i18n.language as Locale;

  const setLocale = useCallback(
    async (next: Locale) => {
      await i18n.changeLanguage(next);
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, next);
    },
    [i18n],
  );

  return { locale, setLocale };
}
