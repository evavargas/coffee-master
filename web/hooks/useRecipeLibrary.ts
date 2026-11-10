"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { getApiErrorMessage } from "@/lib/api/client";
import { createRecipeConversation, removeRecipe, saveRecipe, setRecipeFavorite, type CatalogRecipe } from "@/lib/api/recipes";
import { getCachedRecipe, lockRecipe, patchRecipe, storeEpoch, unlockRecipe } from "@/lib/recipeStore";

interface Mutation {
  optimistic: Partial<CatalogRecipe>;
  request: () => Promise<unknown>;
}

/** Save / remove / favorite (optimistic, rolled back on error) and the Ask / Adapt chat entry points. */
export function useRecipeLibrary(slug: string, onError?: (message: string) => void) {
  const t = useTranslations("recipes");
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** One mutation per slug at a time (store-level lock), so the snapshot below is always server-confirmed. */
  async function run(build: (current: CatalogRecipe) => Mutation) {
    if (!lockRecipe(slug)) return;
    const current = getCachedRecipe(slug);
    if (!current) {
      unlockRecipe(slug);
      return;
    }
    const epoch = storeEpoch();
    const confirmed = { is_saved: current.is_saved, is_favorite: current.is_favorite };
    const { optimistic, request } = build(current);
    setIsPending(true);
    setError(null);
    patchRecipe(slug, optimistic);
    try {
      await request();
    } catch (e) {
      if (storeEpoch() === epoch) patchRecipe(slug, confirmed);
      const message = getApiErrorMessage(e, t("actionError"));
      setError(message);
      onError?.(message);
    } finally {
      if (storeEpoch() === epoch) unlockRecipe(slug);
      setIsPending(false);
    }
  }

  const save = () => run(() => ({ optimistic: { is_saved: true }, request: () => saveRecipe(slug) }));
  // Removing from the library also drops the favorite flag on the server.
  const remove = () => run(() => ({ optimistic: { is_saved: false, is_favorite: false }, request: () => removeRecipe(slug) }));
  const toggleFavorite = () =>
    run((current) => {
      const next = !current.is_favorite;
      // Favoriting saves on the server; unfavoriting keeps the saved state.
      return { optimistic: { is_favorite: next, ...(next ? { is_saved: true } : {}) }, request: () => setRecipeFavorite(slug, next) };
    });

  async function openChat(intent: "ask" | "adapt") {
    setIsPending(true);
    setError(null);
    try {
      const id = await createRecipeConversation(slug);
      router.push(`/chat?c=${id}&intent=${intent}`);
    } catch (e) {
      setError(getApiErrorMessage(e, t("actionError")));
      setIsPending(false);
    }
  }

  return { isPending, error, save, remove, toggleFavorite, ask: () => openChat("ask"), adapt: () => openChat("adapt") };
}
