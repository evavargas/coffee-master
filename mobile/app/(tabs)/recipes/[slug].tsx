import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { Screen } from "@/components/layout/Screen";
import { RecipeDetail } from "@/components/recipes/RecipeDetail";
import { useAppTheme } from "@/context/ThemeContext";
import { useRecipe } from "@/hooks/useRecipe";
import { useRecipeLibrary } from "@/hooks/useRecipeLibrary";

export default function RecipeDetailRoute() {
  const params = useLocalSearchParams<{ slug: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { recipe, isLoading, error, notFound } = useRecipe(slug);
  const actions = useRecipeLibrary(slug);

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("recipes.back")}</Text>
        </Pressable>
        {recipe ? (
          <RecipeDetail recipe={recipe} actions={actions} />
        ) : (
          <Text accessibilityRole={error ? "alert" : undefined} style={{ color: colors.mutedForeground }}>
            {notFound ? t("recipes.notFound") : (error ?? (isLoading ? t("recipes.loading") : null))}
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, gap: 8 },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
});
