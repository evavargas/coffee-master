import { Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Phone, Moon, Sun, type LucideIcon } from "lucide-react-native";

import { useAppTheme } from "@/context/ThemeContext";

const ICON_BY_PREFERENCE: Record<"system" | "light" | "dark", LucideIcon> = {
  system: Phone,
  light: Sun,
  dark: Moon,
};

const LABEL_KEY_BY_PREFERENCE = {
  system: "common.themeSystem",
  light: "common.themeLight",
  dark: "common.themeDark",
} as const;

/** Shows the current theme preference (system/light/dark) and cycles to the next one on press. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { preference, cyclePreference, colors } = useAppTheme();
  const Icon = ICON_BY_PREFERENCE[preference];

  return (
    <Pressable
      style={styles.button}
      onPress={cyclePreference}
      accessibilityRole="button"
      accessibilityLabel={`${t("common.switchTheme")}: ${t(LABEL_KEY_BY_PREFERENCE[preference])}`}
    >
      <Icon size={18} color={colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 6 },
});
