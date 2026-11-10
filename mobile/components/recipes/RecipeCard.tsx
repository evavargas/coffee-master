import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RecipeBadge } from "@/components/recipes/RecipeBadge";
import { useAppTheme } from "@/context/ThemeContext";
import { safeMethod, type CatalogRecipe } from "@/lib/api/recipes";

export function RecipeCard({ recipe }: { recipe: CatalogRecipe }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/(tabs)/recipes/${encodeURIComponent(recipe.slug)}`)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.meta}>
        <RecipeBadge kind="catalog" />
        <Text style={[styles.small, { color: colors.mutedForeground }]}>{t(`recipes.methods.${safeMethod(recipe.method)}`)}</Text>
        {recipe.is_saved && <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("recipes.saved")}</Text>}
        {recipe.is_favorite && <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("recipes.isFavorite")}</Text>}
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{recipe.name}</Text>
      {recipe.coffee?.name ? <Text style={[styles.small, { color: colors.mutedForeground }]}>{recipe.coffee.name}</Text> : null}
      {recipe.description ? <Text style={[styles.body, { color: colors.foreground }]}>{recipe.description}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6, minHeight: 44 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  title: { fontSize: 18, fontWeight: "600" },
  small: { fontSize: 12 },
  body: { fontSize: 14 },
});
