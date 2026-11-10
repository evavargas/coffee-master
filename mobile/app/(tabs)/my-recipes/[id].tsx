import { useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/layout/Screen";
import { ActionButton } from "@/components/recipes/ActionButton";
import { ConfirmButton } from "@/components/recipes/ConfirmButton";
import { RecipeDetail } from "@/components/recipes/RecipeDetail";
import { RecipeForm } from "@/components/recipes/RecipeForm";
import { useAppTheme } from "@/context/ThemeContext";
import { useUserRecipe } from "@/hooks/useUserRecipe";
import { useUserRecipeActions } from "@/hooks/useUserRecipeActions";

export default function MyRecipeDetailRoute() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = /^\d+$/.test(rawId ?? "") ? Number(rawId) : NaN;
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const { recipe, isLoading, error, notFound } = useUserRecipe(id);
  const actions = useUserRecipeActions(id);

  async function remove() {
    if (await actions.remove()) {
      // Render nothing while the back navigation is pending, so the optimistic drop doesn't flash "not found".
      setDeleted(true);
      router.back();
    }
  }

  const parent = recipe?.parent;
  const link = { color: colors.primary, fontWeight: "600" as const };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
            <Text style={link}>{t("myRecipes.back")}</Text>
          </Pressable>
          {deleted ? null : !recipe ? (
            <Text accessibilityRole={error ? "alert" : undefined} style={{ color: colors.mutedForeground }}>
              {Number.isNaN(id) ? t("myRecipes.invalidId") : notFound ? t("myRecipes.notFound") : (error ?? (isLoading ? t("myRecipes.loading") : null))}
            </Text>
          ) : editing ? (
            <RecipeForm recipe={recipe} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
          ) : (
            <>
              <RecipeDetail recipe={recipe} />
              {parent && (
                <View style={styles.parent}>
                  <Text style={{ color: colors.mutedForeground }}>{t("myRecipes.adaptedFrom")}</Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      router.push(parent.kind === "catalog" ? `/(tabs)/recipes/${encodeURIComponent(String(parent.ref))}` : `/(tabs)/my-recipes/${parent.ref}`)
                    }
                    style={styles.parentLink}
                  >
                    <Text style={link}>
                      {parent.kind === "catalog" ? t("myRecipes.adaptedFromCatalog", { ref: String(parent.ref) }) : t("myRecipes.adaptedFromUser")}
                    </Text>
                  </Pressable>
                </View>
              )}
              <View accessibilityLabel={t("recipes.actionsLabel")} style={styles.actions}>
                <View style={styles.buttons}>
                  <ActionButton label={t("myRecipes.edit")} onPress={() => setEditing(true)} disabled={actions.isPending} />
                  <ActionButton
                    label={recipe.is_favorite ? t("recipes.unfavorite") : t("recipes.favorite")}
                    selected={recipe.is_favorite}
                    onPress={() => void actions.toggleFavorite()}
                    disabled={actions.isPending}
                  />
                  <ConfirmButton label={t("myRecipes.delete")} message={t("myRecipes.confirmDelete")} onConfirm={() => void remove()} disabled={actions.isPending} />
                </View>
                {actions.error && (
                  <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
                    {actions.error}
                  </Text>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4, gap: 12, paddingBottom: 16 },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  parent: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  parentLink: { minHeight: 44, justifyContent: "center" },
  actions: { gap: 8 },
  buttons: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8 },
});
