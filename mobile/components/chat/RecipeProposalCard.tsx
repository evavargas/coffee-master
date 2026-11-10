import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { ActionButton } from "@/components/recipes/ActionButton";
import { formatRange } from "@/components/recipes/RecipeDetail";
import { useAppTheme } from "@/context/ThemeContext";
import { useSaveProposal } from "@/hooks/useSaveProposal";
import type { ChatMessage } from "@/lib/api/chat";
import { safeMethod } from "@/lib/api/recipes";

const previewSteps = 3;

/** A recipe proposed by the assistant. It is only saved when the user presses the button. */
export function RecipeProposalCard({ proposal }: { proposal: NonNullable<ChatMessage["proposal"]> }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { savedId, isPending, error, save } = useSaveProposal(proposal.proposal_id, proposal.saved_recipe_id);
  const { recipe } = proposal;
  const steps = recipe.steps ?? [];
  const facts = [
    recipe.coffee?.name,
    recipe.dose_g && formatRange(recipe.dose_g, t("recipes.units.grams")),
    recipe.water_g && formatRange(recipe.water_g, t("recipes.units.grams")),
    typeof recipe.ratio === "number" ? t("recipes.ratioValue", { value: recipe.ratio }) : null,
    recipe.temperature_c && formatRange(recipe.temperature_c, t("recipes.units.celsius")),
    recipe.brew_time_seconds && formatRange(recipe.brew_time_seconds, t("recipes.units.seconds")),
  ].filter(Boolean);

  return (
    <View
      accessible
      accessibilityLabel={t("chat.proposal.ariaLabel", { name: recipe.name })}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("chat.proposal.title")}</Text>
      <Text accessibilityRole="header" style={[styles.name, { color: colors.foreground }]}>
        {recipe.name}
      </Text>
      <Text style={{ color: colors.mutedForeground }}>{t(`recipes.methods.${safeMethod(recipe.method)}`)}</Text>
      {facts.length > 0 && <Text style={{ color: colors.foreground }}>{facts.join(" · ")}</Text>}
      {steps.slice(0, previewSteps).map((s, i) => (
        <Text key={i} style={{ color: colors.foreground }}>{`${i + 1}. ${s.action}`}</Text>
      ))}
      {steps.length > previewSteps && (
        <Text style={{ color: colors.mutedForeground }}>
          {t("chat.proposal.moreSteps", { count: steps.length - previewSteps })}
        </Text>
      )}
      <View style={styles.actions}>
        {savedId === null ? (
          <ActionButton
            primary
            label={isPending ? t("chat.proposal.saving") : t("chat.proposal.save")}
            onPress={() => void save()}
            disabled={isPending}
          />
        ) : (
          <>
            <Text accessibilityRole="text" style={{ color: colors.foreground, fontWeight: "600" }}>
              {t("chat.proposal.saved")}
            </Text>
            <ActionButton
              label={t("chat.proposal.view")}
              onPress={() => router.push(`/(tabs)/my-recipes/${savedId}`)}
              disabled={false}
            />
          </>
        )}
      </View>
      {error && (
        <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { maxWidth: "85%", alignSelf: "flex-start", gap: 6, padding: 12, borderWidth: 1, borderRadius: 14 },
  small: { fontSize: 12 },
  name: { fontSize: 16, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
});
