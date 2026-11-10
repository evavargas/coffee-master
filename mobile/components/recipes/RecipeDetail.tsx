import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { ActionButton } from "@/components/recipes/ActionButton";
import { RecipeBadge } from "@/components/recipes/RecipeBadge";
import { useAppTheme } from "@/context/ThemeContext";
import type { UserRecipe } from "@/lib/api/myRecipes";
import { safeMethod, type CatalogRecipe } from "@/lib/api/recipes";

type Range = { min: number; max?: number | null } | null | undefined;

/** "a–b" or a single value, with a unit. Returns null when there is no range. */
export function formatRange(r: Range, unit = ""): string | null {
  if (!r || typeof r.min !== "number") return null;
  const text = r.max != null && r.max !== r.min ? `${r.min}–${r.max}` : `${r.min}`;
  return unit ? `${text} ${unit}` : text;
}

export interface RecipeActions {
  isPending: boolean;
  error: string | null;
  save: () => void;
  remove: () => void;
  toggleFavorite: () => void;
  ask: () => void;
  adapt: () => void;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  const { colors } = useAppTheme();
  if (value == null || value === "") return null;
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export function RecipeDetail({ recipe, actions }: { recipe: CatalogRecipe | UserRecipe; actions?: RecipeActions }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const catalog = "slug" in recipe ? recipe : null;
  const { coffee, grind } = recipe;
  const steps = recipe.steps ?? [];
  const ratio = typeof recipe.ratio === "number" ? t("recipes.ratioValue", { value: recipe.ratio }) : null;
  const unit = {
    c: t("recipes.units.celsius"),
    g: t("recipes.units.grams"),
    ml: t("recipes.units.milliliters"),
    s: t("recipes.units.seconds"),
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.meta}>
          <RecipeBadge kind={catalog ? "catalog" : "user"} />
          <Text style={[styles.method, { color: colors.mutedForeground }]}>{t(`recipes.methods.${safeMethod(recipe.method)}`)}</Text>
        </View>
        <Text accessibilityRole="header" style={[styles.name, { color: colors.foreground }]}>{recipe.name}</Text>
        {recipe.description ? <Text style={{ color: colors.foreground }}>{recipe.description}</Text> : null}
        {catalog?.archived && (
          <Text style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}>
            {t("recipes.archivedNotice")}
          </Text>
        )}
      </View>

      {actions && (
        <View accessibilityLabel={t("recipes.actionsLabel")} style={styles.actions}>
          <View style={styles.buttons}>
            {catalog?.is_saved ? (
              <ActionButton label={t("recipes.remove")} onPress={actions.remove} disabled={actions.isPending} />
            ) : (
              <ActionButton primary label={t("recipes.save")} onPress={actions.save} disabled={actions.isPending} />
            )}
            <ActionButton
              label={recipe.is_favorite ? t("recipes.unfavorite") : t("recipes.favorite")}
              onPress={actions.toggleFavorite}
              disabled={actions.isPending}
            />
            <ActionButton label={t("recipes.ask")} onPress={actions.ask} disabled={actions.isPending} />
            <ActionButton label={t("recipes.adapt")} onPress={actions.adapt} disabled={actions.isPending} />
          </View>
          {actions.error && (
            <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
              {actions.error}
            </Text>
          )}
        </View>
      )}

      <View accessibilityLabel={t("recipes.parametersLabel")}>
        <Row label={t("recipes.coffeeName")} value={coffee?.name} />
        <Row label={t("recipes.origin")} value={coffee?.origin} />
        <Row label={t("recipes.process")} value={coffee?.process} />
        <Row label={t("recipes.roast")} value={coffee?.roast} />
        <Row label={t("recipes.grindClicks")} value={formatRange(grind?.clicks)} />
        <Row label={t("recipes.grindDescription")} value={grind?.description} />
        <Row label={t("recipes.grinder")} value={grind?.grinder} />
        <Row label={t("recipes.temperature")} value={formatRange(recipe.temperature_c, unit.c)} />
        <Row label={t("recipes.ratio")} value={ratio} />
        <Row label={t("recipes.dose")} value={formatRange(recipe.dose_g, unit.g)} />
        <Row label={t("recipes.water")} value={formatRange(recipe.water_g, unit.g)} />
        <Row label={t("recipes.yield")} value={formatRange(recipe.yield_ml, unit.ml)} />
        <Row label={t("recipes.brewTime")} value={formatRange(recipe.brew_time_seconds, unit.s)} />
      </View>

      {steps.length > 0 && (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>{t("recipes.steps")}</Text>
          {steps.map((s, i) => {
            const detail = [
              s.pour_to_g != null ? t("recipes.pourTo", { grams: s.pour_to_g }) : null,
              s.at_seconds != null ? t("recipes.atSeconds", { seconds: s.at_seconds }) : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <View key={i} style={styles.step}>
                <Text style={{ color: colors.foreground }}>{`${i + 1}. ${s.action}`}</Text>
                {detail !== "" && <Text style={[styles.small, { color: colors.mutedForeground }]}>{detail}</Text>}
              </View>
            );
          })}
        </View>
      )}

      {recipe.notes ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>{t("recipes.notes")}</Text>
          <Text style={{ color: colors.foreground }}>{recipe.notes}</Text>
        </View>
      ) : null}

      {catalog?.source?.section ? (
        <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("recipes.source", { section: catalog.source.section })}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 20, paddingBottom: 16 },
  header: { gap: 8 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  method: { fontSize: 14 },
  name: { fontSize: 24, fontWeight: "600" },
  notice: { borderWidth: 1, borderRadius: 10, padding: 8, fontSize: 14, overflow: "hidden" },
  actions: { gap: 8 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { flexShrink: 0 },
  rowValue: { flex: 1, textAlign: "right" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "600" },
  step: { gap: 2 },
  small: { fontSize: 12 },
});
