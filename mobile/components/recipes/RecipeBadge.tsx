import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";

import { useAppTheme } from "@/context/ThemeContext";

/** Origin badge: lavender for the catalog, peach for the user's own recipes. */
export function RecipeBadge({ kind }: { kind: "catalog" | "user" }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View style={[styles.badge, { backgroundColor: kind === "catalog" ? colors.accent : colors.highlight }]}>
      <Text style={[styles.text, { color: kind === "catalog" ? colors.accentForeground : colors.highlightForeground }]}>{t(`recipes.badge.${kind}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: 12, fontWeight: "600" },
});
