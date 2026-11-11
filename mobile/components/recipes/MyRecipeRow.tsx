import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";

import { ActionButton } from "@/components/recipes/ActionButton";
import { ConfirmButton } from "@/components/recipes/ConfirmButton";
import { RecipeBadge } from "@/components/recipes/RecipeBadge";
import { useAppTheme } from "@/context/ThemeContext";
import { useRecipeLibrary } from "@/hooks/useRecipeLibrary";
import { useUserRecipeActions } from "@/hooks/useUserRecipeActions";
import type { MyRecipeItem, UserRecipe } from "@/lib/api/myRecipes";
import { safeMethod, type CatalogRecipe } from "@/lib/api/recipes";

interface Shape {
  kind: "catalog" | "user";
  name: string;
  method: string;
  description?: string | null;
  href: string;
  isFavorite: boolean;
  isPending: boolean;
  toggleFavorite: () => void;
  remove: () => void;
  deleteLabel: string;
  confirmMessage: string;
}

function Row({ s }: { s: Shape }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={s.name} onPress={() => router.push(s.href)} style={({ pressed }) => [styles.open, pressed && { backgroundColor: colors.cardHover }]}>
        <View style={styles.meta}>
          <RecipeBadge kind={s.kind} />
          <Text style={[styles.small, { color: colors.mutedForeground }]}>{t(`recipes.methods.${safeMethod(s.method)}`)}</Text>
          {s.isFavorite && (
          <Text style={[styles.small, styles.favorite, { color: colors.highlightForeground, backgroundColor: colors.highlight }]}>{t("recipes.isFavorite")}</Text>
        )}
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>{s.name}</Text>
        {s.description ? <Text numberOfLines={2} style={{ color: colors.foreground }}>{s.description}</Text> : null}
      </Pressable>
      <View style={styles.actions}>
        <ActionButton
          label={s.isFavorite ? t("recipes.unfavorite") : t("recipes.favorite")}
          selected={s.isFavorite}
          onPress={s.toggleFavorite}
          disabled={s.isPending}
        />
        <ConfirmButton label={s.deleteLabel} message={s.confirmMessage} onConfirm={s.remove} disabled={s.isPending} />
      </View>
    </View>
  );
}

function CatalogRow({ recipe, onError }: { recipe: CatalogRecipe; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const lib = useRecipeLibrary(recipe.slug, onError);
  return (
    <Row
      s={{
        kind: "catalog",
        name: recipe.name,
        method: recipe.method,
        description: recipe.description,
        href: `/(tabs)/recipes/${encodeURIComponent(recipe.slug)}`,
        isFavorite: recipe.is_favorite,
        isPending: lib.isPending,
        toggleFavorite: lib.toggleFavorite,
        remove: lib.remove,
        deleteLabel: t("myRecipes.removeFromList"),
        confirmMessage: t("myRecipes.confirmRemove"),
      }}
    />
  );
}

function UserRow({ recipe, onError }: { recipe: UserRecipe; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const actions = useUserRecipeActions(recipe.id, onError);
  return (
    <Row
      s={{
        kind: "user",
        name: recipe.name,
        method: recipe.method,
        description: recipe.description,
        href: `/(tabs)/my-recipes/${recipe.id}`,
        isFavorite: recipe.is_favorite,
        isPending: actions.isPending,
        toggleFavorite: actions.toggleFavorite,
        remove: actions.remove,
        deleteLabel: t("myRecipes.delete"),
        confirmMessage: t("myRecipes.confirmDelete"),
      }}
    />
  );
}

/** Errors go to the list (`onError`), because a rolled-back row may have been unmounted and remounted meanwhile. */
export function MyRecipeRow({ item, onError }: { item: MyRecipeItem; onError: (message: string) => void }) {
  return item.kind === "catalog" ? <CatalogRow recipe={item.recipe} onError={onError} /> : <UserRow recipe={item.recipe} onError={onError} />;
}

const styles = StyleSheet.create({
  favorite: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden", fontWeight: "600" },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  open: { gap: 4, minHeight: 44, borderRadius: 8 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  title: { fontSize: 18, fontWeight: "600" },
  small: { fontSize: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8 },
});
