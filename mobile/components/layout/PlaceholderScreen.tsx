import { useTranslation } from "react-i18next";
import { StyleSheet, Text } from "react-native";

import { Screen } from "@/components/layout/Screen";
import { useAppTheme } from "@/context/ThemeContext";

/** Temporary tab body until the recipes screens land. */
export function PlaceholderScreen({ titleKey }: { titleKey: "nav.recipes" | "nav.myRecipes" }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <Screen>
      <Text style={[styles.title, { color: colors.foreground }]}>{t(titleKey)}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({ title: { fontSize: 20, fontWeight: "600" } });
