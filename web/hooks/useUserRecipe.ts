"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useTranslations } from "next-intl";

import { getApiErrorMessage } from "@/lib/api/client";
import { fetchUserRecipe } from "@/lib/api/myRecipes";
import { dropUserRecipe, putUserRecipes, useCachedUserRecipes, userStoreEpoch } from "@/lib/userRecipeStore";

/** One own recipe: shows the cached copy at once and refetches (the store ignores it while a mutation is pending). */
export function useUserRecipe(id: number) {
  const t = useTranslations("recipes");
  const recipe = useCachedUserRecipes().get(id) ?? null;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const epoch = userStoreEpoch();
    if (!Number.isInteger(id)) {
      setIsLoading(false);
      setNotFound(true);
      return;
    }
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    fetchUserRecipe(id, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted && userStoreEpoch() === epoch) putUserRecipes([r]);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted || axios.isCancel(e) || userStoreEpoch() !== epoch) return;
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          dropUserRecipe(id);
          setNotFound(true);
        } else setError(getApiErrorMessage(e, t("loadError")));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [id, t]);

  return { recipe, isLoading, error, notFound };
}
