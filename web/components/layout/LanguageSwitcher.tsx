"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LOCALE_COOKIE, type Locale } from "@/i18n/locale";

const OTHER_LOCALE: Record<Locale, Locale> = {
  es: "en",
  en: "es",
};

const LOCALE_LABEL: Record<Locale, string> = {
  es: "ES",
  en: "EN",
};

/** Toggles the app language by writing the NEXT_LOCALE cookie and refreshing the server render. */
export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations("common");
  const router = useRouter();

  function switchLocale() {
    const next = OTHER_LOCALE[locale];
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={switchLocale} aria-label={t("switchLanguage")}>
      {LOCALE_LABEL[OTHER_LOCALE[locale]]}
    </Button>
  );
}
