import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import { Text } from "@/components/ui/Text";

import { useAppTheme } from "@/context/ThemeContext";
import { useRecipeRefName } from "@/hooks/useRecipeRefName";
import type { RecipeRef } from "@/lib/api/chat";

/** "Talking about X" note; falls back to generic copy while or when the name cannot be resolved. */
export function RecipeBanner({ recipeRef }: { recipeRef: RecipeRef }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { name } = useRecipeRefName(recipeRef);
  return (
    <Text
      accessibilityRole="summary"
      style={[styles.banner, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
    >
      {name ? t("chat.talkingAbout", { name }) : t("chat.talkingAboutGeneric")}
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, overflow: "hidden" },
});
