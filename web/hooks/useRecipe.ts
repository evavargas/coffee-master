"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useTranslations } from "next-intl";

import { getApiErrorMessage } from "@/lib/api/client";
import { fetchRecipe } from "@/lib/api/recipes";
import { putRecipes, storeEpoch, useCachedRecipes } from "@/lib/recipeStore";

/** One catalog recipe: shows the cached copy at once and refetches (the store ignores it while a mutation is pending). */
export function useRecipe(slug: string) {
  const t = useTranslations("recipes");
  const recipe = useCachedRecipes().get(slug) ?? null;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const epoch = storeEpoch();
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    fetchRecipe(slug, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted && storeEpoch() === epoch) putRecipes([r]);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted || axios.isCancel(e) || storeEpoch() !== epoch) return;
        if (axios.isAxiosError(e) && e.response?.status === 404) setNotFound(true);
        else setError(getApiErrorMessage(e, t("loadError")));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [slug, t]);

  return { recipe, isLoading, error, notFound };
}
