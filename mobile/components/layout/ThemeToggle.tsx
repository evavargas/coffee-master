import { Pressable, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { useAppTheme } from "@/context/ThemeContext";

const ICON_BY_PREFERENCE = {
  system: "🖥️",
  light: "☀️",
  dark: "🌙",
} as const;

const LABEL_KEY_BY_PREFERENCE = {
  system: "common.themeSystem",
  light: "common.themeLight",
  dark: "common.themeDark",
} as const;

/** Shows the current theme preference (system/light/dark) and cycles to the next one on press. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { preference, cyclePreference } = useAppTheme();
  const icon = ICON_BY_PREFERENCE[preference];

  return (
    <Pressable
      style={styles.button}
      onPress={cyclePreference}
      accessibilityRole="button"
      accessibilityLabel={`${t("common.switchTheme")}: ${t(LABEL_KEY_BY_PREFERENCE[preference])}`}
    >
      <Text style={styles.text}>{icon}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 6, paddingVertical: 4 },
  text: { fontSize: 16 },
});
