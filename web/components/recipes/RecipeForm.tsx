"use client";

import type { ComponentProps } from "react";
import { Controller, get, type Control, type FieldErrors, type Path, type UseFormRegister } from "react-hook-form";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/select";
import { useRecipeForm } from "@/hooks/useRecipeForm";
import type { UserRecipe } from "@/lib/api/myRecipes";
import { recipeMethods } from "@/lib/api/recipes";
import type { RecipeFormValues } from "@/lib/schemas/recipeForm";

type Name = Path<RecipeFormValues>;
interface Ctx {
  register: UseFormRegister<RecipeFormValues>;
  errors: FieldErrors<RecipeFormValues>;
  control: Control<RecipeFormValues>;
}

const controlClass =
  "flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring aria-[invalid=true]:border-destructive";

const idOf = (name: string) => `rf-${name.replace(/\./g, "-")}`;

function FieldError({ name, errors }: { name: Name; errors: Ctx["errors"] }) {
  const message = (get(errors, name) as { message?: string } | undefined)?.message;
  return (
    <p id={`${idOf(name)}-error`} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

function Field({ name, label, ctx, children }: { name: Name; label: string; ctx: Ctx; children: (a: ComponentProps<"input">) => React.ReactNode }) {
  const invalid = Boolean(get(ctx.errors, name));
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={idOf(name)}>{label}</Label>
      {children({ id: idOf(name), "aria-invalid": invalid, "aria-describedby": invalid ? `${idOf(name)}-error` : undefined })}
      <FieldError name={name} errors={ctx.errors} />
    </div>
  );
}

const toNumber = (v: unknown) => (v === "" || v == null ? undefined : Number(v));

function TextField({ name, label, ctx, maxLength = 120 }: { name: Name; label: string; ctx: Ctx; maxLength?: number }) {
  return <Field name={name} label={label} ctx={ctx}>{(a) => <Input {...a} maxLength={maxLength} {...ctx.register(name)} />}</Field>;
}

function NumberField({ name, label, ctx, integer }: { name: Name; label: string; ctx: Ctx; integer?: boolean }) {
  return (
    <Field name={name} label={label} ctx={ctx}>
      {(a) => <Input {...a} type="number" inputMode={integer ? "numeric" : "decimal"} step={integer ? "1" : "any"} {...ctx.register(name, { setValueAs: toNumber })} />}
    </Field>
  );
}

function RangeFields({ name, label, ctx }: { name: string; label: string; ctx: Ctx }) {
  const t = useTranslations("myRecipes.form");
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <NumberField name={`${name}.min` as Name} label={`${label} ${t("min")}`} ctx={ctx} />
      <NumberField name={`${name}.max` as Name} label={`${label} ${t("max")}`} ctx={ctx} />
    </fieldset>
  );
}

function SelectField({ name, label, ctx, options }: { name: Name; label: string; ctx: Ctx; options: [string, string][] }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={idOf(name)}>{label}</Label>
      <Controller
        control={ctx.control}
        name={name}
        render={({ field }) => (
          <OptionSelect
            id={idOf(name)}
            value={(field.value as string | undefined) ?? ""}
            onValueChange={field.onChange}
            options={options.map(([value, label]) => ({ value, label }))}
          />
        )}
      />
    </div>
  );
}

/** Edit form of an own recipe. Recipe content is free text; every label comes from i18n. */
export function RecipeForm({ recipe, onSaved, onCancel }: { recipe: UserRecipe; onSaved: () => void; onCancel: () => void }) {
  const t = useTranslations("myRecipes.form");
  const tr = useTranslations("recipes");
  const tm = useTranslations("myRecipes");
  const { form, steps, onSubmit, serverError, isSubmitting } = useRecipeForm(recipe, onSaved);
  const ctx: Ctx = { register: form.register, errors: form.formState.errors, control: form.control };

  return (
    <form onSubmit={onSubmit} noValidate aria-label={t("title")} className="space-y-4 pb-4">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      <TextField name="name" label={t("name")} ctx={ctx} />
      <div className="space-y-1">
        <Label htmlFor={idOf("description")}>{t("description")}</Label>
        <textarea
          id={idOf("description")}
          rows={3}
          maxLength={500}
          className={controlClass}
          aria-invalid={Boolean(form.formState.errors.description)}
          aria-describedby={`${idOf("description")}-error`}
          {...form.register("description")}
        />
        <FieldError name="description" errors={ctx.errors} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SelectField name="method" label={tr("methodLabel")} ctx={ctx} options={recipeMethods.map((m) => [m, tr(`methods.${m}`)])} />
        <SelectField
          name="goal"
          label={t("goal")}
          ctx={ctx}
          options={[["", t("goals.none")], ["sweetness", t("goals.sweetness")], ["balance", t("goals.balance")], ["acidity", t("goals.acidity")]]}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="font-semibold">{t("coffeeSection")}</legend>
        <TextField name="coffee.name" label={tr("coffeeName")} ctx={ctx} />
        <TextField name="coffee.origin" label={tr("origin")} ctx={ctx} />
        <TextField name="coffee.process" label={tr("process")} ctx={ctx} />
        <TextField name="coffee.roast" label={tr("roast")} ctx={ctx} />
        <SelectField name="coffee.with_milk" label={t("withMilk")} ctx={ctx} options={[["", t("milk.unset")], ["yes", t("milk.yes")], ["no", t("milk.no")]]} />
      </fieldset>

      <RangeFields name="dose_g" label={tr("dose")} ctx={ctx} />
      <RangeFields name="water_g" label={tr("water")} ctx={ctx} />
      <RangeFields name="temperature_c" label={tr("temperature")} ctx={ctx} />
      <NumberField name="ratio" label={tr("ratio")} ctx={ctx} />
      <RangeFields name="yield_ml" label={tr("yield")} ctx={ctx} />
      <RangeFields name="brew_time_seconds" label={tr("brewTime")} ctx={ctx} />

      <fieldset className="space-y-2">
        <legend className="font-semibold">{t("grindSection")}</legend>
        <TextField name="grind.grinder" label={tr("grinder")} ctx={ctx} />
        <TextField name="grind.description" label={tr("grindDescription")} ctx={ctx} maxLength={300} />
        <RangeFields name="grind.clicks" label={tr("grindClicks")} ctx={ctx} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold">{t("stepsSection")}</legend>
        {steps.fields.map((field, i) => (
          <div key={field.id} className="space-y-2 rounded-lg border border-border p-2">
            <TextField name={`steps.${i}.action`} label={t("stepAction", { n: i + 1 })} ctx={ctx} maxLength={500} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField name={`steps.${i}.at_seconds`} label={t("stepAt", { n: i + 1 })} ctx={ctx} integer />
              <NumberField name={`steps.${i}.pour_to_g`} label={t("stepPour", { n: i + 1 })} ctx={ctx} />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => steps.remove(i)}>
              {t("removeStep", { n: i + 1 })}
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={steps.fields.length >= 30} onClick={() => steps.append({ action: "" })}>
          {t("addStep")}
        </Button>
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor={idOf("notes")}>{tr("notes")}</Label>
        <textarea id={idOf("notes")} rows={3} maxLength={2000} className={controlClass} {...form.register("notes")} />
      </div>

      <div aria-live="polite">
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("saving") : t("save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {tm("cancel")}
        </Button>
      </div>
    </form>
  );
}
