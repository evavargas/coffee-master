import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";

import { Screen } from "@/components/layout/Screen";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { RecipeFilters } from "@/components/recipes/RecipeFilters";
import { useAppTheme } from "@/context/ThemeContext";
import { useRecipes } from "@/hooks/useRecipes";
import type { RecipeMethod } from "@/lib/api/recipes";

export default function RecipesRoute() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<RecipeMethod | undefined>();
  const { items, isLoading, isLoadingMore, error, hasMore, loadMore, retry } = useRecipes({ q, method });

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(r) => r.slug}
        renderItem={({ item }) => <RecipeCard recipe={item} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{t("recipes.title")}</Text>
            <RecipeFilters q={q} method={method} onQChange={setQ} onMethodChange={setMethod} />
            {isLoading && <ActivityIndicator accessibilityLabel={t("recipes.loading")} color={colors.primary} />}
            {error && (
              <View accessibilityRole="alert" style={styles.errorBox}>
                <Text style={{ color: colors.destructive }}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={retry} style={[styles.button, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.foreground }}>{t("recipes.retry")}</Text>
                </Pressable>
              </View>
            )}
            {!isLoading && !error && items.length === 0 && <Text style={{ color: colors.mutedForeground }}>{t("recipes.empty")}</Text>}
          </View>
        }
        ListFooterComponent={
          hasMore && !isLoading ? (
            <Pressable
              accessibilityRole="button"
              disabled={isLoadingMore}
              onPress={() => void loadMore()}
              style={[styles.button, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground }}>{isLoadingMore ? t("recipes.loading") : t("recipes.loadMore")}</Text>
            </Pressable>
          ) : undefined
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
  header: { gap: 12 },
  title: { fontSize: 18, fontWeight: "600" },
  errorBox: { gap: 8 },
  button: { borderWidth: 1, borderRadius: 999, minHeight: 44, paddingHorizontal: 14, justifyContent: "center", alignItems: "center", alignSelf: "flex-start" },
});
