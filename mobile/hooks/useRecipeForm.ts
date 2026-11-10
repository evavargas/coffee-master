import { useCallback, useMemo, useState } from "react";
import { useFieldArray, useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useTranslation } from "react-i18next";

import { getApiErrorMessage } from "@/lib/api/client";
import { updateUserRecipe, type UserRecipe } from "@/lib/api/myRecipes";
import { buildRecipeFormSchema, toFormValues, toRecipeData, type RecipeFormValues } from "@/lib/schemas/recipeForm";
import { lockUserRecipe, putUserRecipes, restoreUserRecipe, unlockUserRecipe, userStoreEpoch } from "@/lib/userRecipeStore";

const rangeFields = ["dose_g", "water_g", "temperature_c", "yield_ml", "brew_time_seconds", "grind.clicks"];
const markable = /^(name|description|ratio|coffee\.(name|origin|process|roast)|grind\.(grinder|description)|steps\.\d+\.(action|at_seconds|pour_to_g)|(dose_g|water_g|temperature_c|yield_ml|brew_time_seconds|grind\.clicks)\.(min|max))$/;

/** Maps a backend `loc` (without "body") to a form field that shows errors; range-level errors go to `.min`. */
function fieldPath(loc: (string | number)[]): string | null {
  let path = loc.join(".");
  if (rangeFields.includes(path)) path += ".min";
  return markable.test(path) ? path : null;
}

/** Edit form of an own recipe: zod-validated, PUTs the full recipe once, updates the cache and calls `onSaved`. */
export function useRecipeForm(recipe: UserRecipe, onSaved: () => void) {
  const { t: translate } = useTranslation();
  const t = useCallback((key: string, options?: Record<string, string>) => translate(`myRecipes.form.${key}`, options), [translate]);
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = useMemo(() => buildRecipeFormSchema((key) => translate(`myRecipes.validation.${key}`)), [translate]);
  const form = useForm<RecipeFormValues>({ resolver: zodResolver(schema), defaultValues: toFormValues(recipe) });
  const steps = useFieldArray({ control: form.control, name: "steps" });

  const onSubmit = form.handleSubmit(async (values) => {
    if (!lockUserRecipe(recipe.id)) {
      setServerError(t("busy"));
      return;
    }
    const epoch = userStoreEpoch();
    setServerError(null);
    try {
      const saved = await updateUserRecipe(recipe.id, toRecipeData(values));
      if (userStoreEpoch() !== epoch) return;
      unlockUserRecipe(recipe.id);
      // Unreadable body after a successful PUT: keep what the user typed instead of reporting a failure.
      if (saved) putUserRecipes([saved]);
      else restoreUserRecipe({ ...recipe, ...toRecipeData(values) });
      onSaved();
    } catch (e) {
      // A response of a previous session must not touch this form's state.
      if (userStoreEpoch() !== epoch) return;
      const detail = axios.isAxiosError(e) && e.response?.status === 422 ? (e.response.data as { detail?: unknown })?.detail : undefined;
      if (Array.isArray(detail)) {
        // FastAPI body errors look like ["body", "dose_g", "min"]. Errors on a rendered field mark it;
        // the rest (model validators, unknown paths) are shown as-is, since backend messages are not translated.
        const unmapped: string[] = [];
        let marked = 0;
        detail.forEach((d: { loc?: (string | number)[]; msg?: string }) => {
          const msg = typeof d.msg === "string" ? d.msg : "";
          const path = fieldPath((d.loc ?? []).slice(1));
          if (path && msg) {
            form.setError(path as Path<RecipeFormValues>, { message: msg });
            marked += 1;
          } else if (msg) unmapped.push(msg);
        });
        setServerError(unmapped.length ? t("serverRejected", { details: unmapped.join("; ") }) : marked ? t("serverError") : t("saveError"));
      } else {
        setServerError(getApiErrorMessage(e, t("saveError")));
      }
    } finally {
      if (userStoreEpoch() === epoch) unlockUserRecipe(recipe.id);
    }
  });

  return { form, steps, onSubmit, serverError, isSubmitting: form.formState.isSubmitting };
}
