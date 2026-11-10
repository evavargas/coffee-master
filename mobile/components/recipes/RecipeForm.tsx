import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { FormField } from "@/components/auth/FormField";
import { ActionButton } from "@/components/recipes/ActionButton";
import { ChoiceField, NumberField, RangeFields, type FieldCtx } from "@/components/recipes/RecipeFormFields";
import { useAppTheme } from "@/context/ThemeContext";
import { useRecipeForm } from "@/hooks/useRecipeForm";
import type { UserRecipe } from "@/lib/api/myRecipes";
import { recipeMethods } from "@/lib/api/recipes";

/** Edit form of an own recipe. Recipe content is free text; every label comes from i18n. */
export function RecipeForm({ recipe, onSaved, onCancel }: { recipe: UserRecipe; onSaved: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { form, steps, onSubmit, serverError, isSubmitting } = useRecipeForm(recipe, onSaved);
  const { control, formState } = form;
  const { errors } = formState;
  const ctx: FieldCtx = { control, errors };
  const f = (key: string) => t(`myRecipes.form.${key}`);
  const r = (key: string) => t(`recipes.${key}`);
  const range = (name: string, label: string) => <RangeFields name={name} label={label} ctx={ctx} minLabel={f("min")} maxLabel={f("max")} />;

  return (
    <View accessibilityLabel={f("title")} style={styles.root}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{f("title")}</Text>
      <FormField control={control} name="name" maxLength={120} label={f("name")} error={errors.name} />
      <FormField control={control} name="description" maxLength={500} label={f("description")} error={errors.description} multiline />
      <ChoiceField name="method" label={r("methodLabel")} ctx={ctx} options={recipeMethods.map((m) => [m, r(`methods.${m}`)])} />
      <ChoiceField
        name="goal"
        label={f("goal")}
        ctx={ctx}
        options={[["", f("goals.none")], ["sweetness", f("goals.sweetness")], ["balance", f("goals.balance")], ["acidity", f("goals.acidity")]]}
      />

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.legend, { color: colors.foreground }]}>{f("coffeeSection")}</Text>
        <FormField control={control} name="coffee.name" maxLength={120} label={r("coffeeName")} error={errors.coffee?.name} />
        <FormField control={control} name="coffee.origin" maxLength={120} label={r("origin")} error={errors.coffee?.origin} />
        <FormField control={control} name="coffee.process" maxLength={120} label={r("process")} error={errors.coffee?.process} />
        <FormField control={control} name="coffee.roast" maxLength={120} label={r("roast")} error={errors.coffee?.roast} />
        <ChoiceField name="coffee.with_milk" label={f("withMilk")} ctx={ctx} options={[["", f("milk.unset")], ["yes", f("milk.yes")], ["no", f("milk.no")]]} />
      </View>

      {range("dose_g", r("dose"))}
      {range("water_g", r("water"))}
      {range("temperature_c", r("temperature"))}
      <NumberField name="ratio" label={r("ratio")} ctx={ctx} />
      {range("yield_ml", r("yield"))}
      {range("brew_time_seconds", r("brewTime"))}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.legend, { color: colors.foreground }]}>{f("grindSection")}</Text>
        <FormField control={control} name="grind.grinder" maxLength={120} label={r("grinder")} error={errors.grind?.grinder} />
        <FormField control={control} name="grind.description" maxLength={300} label={r("grindDescription")} error={errors.grind?.description} />
        {range("grind.clicks", r("grindClicks"))}
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.legend, { color: colors.foreground }]}>{f("stepsSection")}</Text>
        {steps.fields.map((field, i) => (
          <View key={field.id} style={[styles.step, { borderColor: colors.border }]}>
            <FormField control={control} name={`steps.${i}.action`} maxLength={500} label={t("myRecipes.form.stepAction", { n: i + 1 })} error={errors.steps?.[i]?.action} />
            <View style={styles.pair}>
              <View style={styles.half}>
                <NumberField name={`steps.${i}.at_seconds`} label={t("myRecipes.form.stepAt", { n: i + 1 })} ctx={ctx} integer />
              </View>
              <View style={styles.half}>
                <NumberField name={`steps.${i}.pour_to_g`} label={t("myRecipes.form.stepPour", { n: i + 1 })} ctx={ctx} />
              </View>
            </View>
            <ActionButton label={t("myRecipes.form.removeStep", { n: i + 1 })} onPress={() => steps.remove(i)} disabled={false} />
          </View>
        ))}
        <ActionButton label={f("addStep")} onPress={() => steps.append({ action: "" })} disabled={steps.fields.length >= 30} />
      </View>

      <FormField control={control} name="notes" maxLength={2000} label={r("notes")} error={errors.notes} multiline />

      {serverError && (
        <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
          {serverError}
        </Text>
      )}
      <View style={styles.buttons}>
        <ActionButton primary label={isSubmitting ? f("saving") : f("save")} onPress={() => void onSubmit()} disabled={isSubmitting} />
        <ActionButton label={t("myRecipes.cancel")} onPress={onCancel} disabled={false} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, paddingBottom: 16 },
  title: { fontSize: 20, fontWeight: "600" },
  section: { gap: 10 },
  legend: { fontSize: 16, fontWeight: "600" },
  step: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 10 },
  pair: { flexDirection: "row", gap: 8 },
  half: { flex: 1, minWidth: 0 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
