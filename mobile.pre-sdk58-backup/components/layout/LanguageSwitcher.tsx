import { Pressable, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { useAppTheme } from "@/context/ThemeContext";
import { useLocale } from "@/hooks/useLocale";

/** Shows the language the user would switch to, and switches on press. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const { colors } = useAppTheme();
  const nextLocale = locale === "es" ? "en" : "es";
  const label = locale === "es" ? "EN" : "ES";

  return (
    <Pressable
      style={styles.button}
      onPress={() => void setLocale(nextLocale)}
      accessibilityRole="button"
      accessibilityLabel={t("common.switchLanguage")}
    >
      <Text style={[styles.text, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 6, paddingVertical: 4 },
  text: { fontWeight: "600", fontSize: 13 },
});
