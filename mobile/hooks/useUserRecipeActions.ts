import { useState } from "react";
import { useTranslation } from "react-i18next";

import { getApiErrorMessage } from "@/lib/api/client";
import { removeUserRecipe, setUserRecipeFavorite } from "@/lib/api/myRecipes";
import {
  dropUserRecipe,
  getCachedUserRecipe,
  lockUserRecipe,
  patchUserRecipe,
  restoreUserRecipe,
  tombstoneUserRecipe,
  unlockUserRecipe,
  userStoreEpoch,
} from "@/lib/userRecipeStore";

/** Favorite / remove for an own recipe: optimistic, one mutation per id at a time, rolled back to the confirmed copy on error. */
export function useUserRecipeActions(id: number, onError?: (message: string) => void) {
  const { t } = useTranslation();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(optimistic: (current: NonNullable<ReturnType<typeof getCachedUserRecipe>>) => void, request: () => Promise<unknown>) {
    if (!lockUserRecipe(id)) return false;
    const confirmed = getCachedUserRecipe(id);
    if (!confirmed) {
      unlockUserRecipe(id);
      return false;
    }
    const epoch = userStoreEpoch();
    setIsPending(true);
    setError(null);
    optimistic(confirmed);
    try {
      await request();
      return true;
    } catch (e) {
      if (userStoreEpoch() === epoch) restoreUserRecipe(confirmed);
      const message = getApiErrorMessage(e, t("recipes.actionError"));
      setError(message);
      onError?.(message);
      return false;
    } finally {
      if (userStoreEpoch() === epoch) unlockUserRecipe(id);
      setIsPending(false);
    }
  }

  const toggleFavorite = () => {
    const next = !getCachedUserRecipe(id)?.is_favorite;
    return run(() => patchUserRecipe(id, { is_favorite: next }), () => setUserRecipeFavorite(id, next));
  };
  const remove = () => {
    const epoch = userStoreEpoch();
    return run(
      () => dropUserRecipe(id),
      async () => {
        await removeUserRecipe(id);
        if (userStoreEpoch() === epoch) tombstoneUserRecipe(id);
      },
    );
  };

  return { isPending, error, toggleFavorite, remove };
}
