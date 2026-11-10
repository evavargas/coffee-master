import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/layout/Screen";
import { MyRecipeRow } from "@/components/recipes/MyRecipeRow";
import { MyRecipesTabs } from "@/components/recipes/MyRecipesTabs";
import { useAppTheme } from "@/context/ThemeContext";
import { useMyRecipes } from "@/hooks/useMyRecipes";
import type { MyRecipeFilter } from "@/lib/api/myRecipes";

export default function MyRecipesRoute() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [filter, setFilter] = useState<MyRecipeFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const { items, isLoading, isLoadingMore, error, hasMore, loadMore, retry } = useMyRecipes(filter);

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(i) => (i.kind === "catalog" ? `c:${i.recipe.slug}` : `u:${i.recipe.id}`)}
        renderItem={({ item }) => <MyRecipeRow item={item} onError={setActionError} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{t("myRecipes.title")}</Text>
            <MyRecipesTabs
              value={filter}
              onChange={(f) => {
                setActionError(null);
                setFilter(f);
              }}
            />
            {isLoading && <ActivityIndicator accessibilityLabel={t("myRecipes.loading")} color={colors.primary} />}
            {error && items.length === 0 && (
              <View accessibilityRole="alert" style={styles.errorBox}>
                <Text style={{ color: colors.destructive }}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={() => void retry()} style={[styles.button, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.foreground }}>{t("recipes.retry")}</Text>
                </Pressable>
              </View>
            )}
            {actionError && (
              <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
                {actionError}
              </Text>
            )}
            {!isLoading && !error && items.length === 0 && <Text style={{ color: colors.mutedForeground }}>{t(`myRecipes.empty.${filter}`)}</Text>}
          </View>
        }
        ListFooterComponent={
          error && items.length > 0 ? (
            <View accessibilityRole="alert" style={styles.errorBox}>
              <Text style={{ color: colors.destructive }}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void retry()} style={[styles.button, { borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground }}>{t("recipes.retry")}</Text>
              </Pressable>
            </View>
          ) : hasMore && !isLoading ? (
            <Pressable
              accessibilityRole="button"
              disabled={isLoadingMore}
              onPress={() => void loadMore()}
              style={[styles.button, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground }}>{isLoadingMore ? t("myRecipes.loading") : t("recipes.loadMore")}</Text>
            </Pressable>
          ) : undefined
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
  header: { gap: 12, paddingBottom: 4 },
  title: { fontSize: 18, fontWeight: "600" },
  errorBox: { gap: 8 },
  button: { borderWidth: 1, borderRadius: 10, minHeight: 44, paddingHorizontal: 14, justifyContent: "center", alignItems: "center", alignSelf: "flex-start" },
});
