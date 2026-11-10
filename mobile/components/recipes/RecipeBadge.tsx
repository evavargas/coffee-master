import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";

/** Origin badge: Coffee Master catalog recipe or the user's own. */
export function RecipeBadge({ kind }: { kind: "catalog" | "user" }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.muted }]}>
      <Text style={[styles.text, { color: colors.mutedForeground }]}>{t(`recipes.badge.${kind}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: 12, fontWeight: "600" },
});
