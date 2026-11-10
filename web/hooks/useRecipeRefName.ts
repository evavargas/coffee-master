"use client";

import { useEffect, useState } from "react";

import type { RecipeRef } from "@/lib/api/chat";
import { fetchUserRecipe } from "@/lib/api/myRecipes";
import { fetchRecipe } from "@/lib/api/recipes";
import { onSessionChange } from "@/lib/session";
import { putRecipes, storeEpoch, useCachedRecipes } from "@/lib/recipeStore";
import { putUserRecipes, useCachedUserRecipes, userStoreEpoch } from "@/lib/userRecipeStore";

/** In-flight name fetches by ref, so many conversations about the same recipe share one request. */
const inFlight = new Map<string, Promise<void>>();
onSessionChange(() => inFlight.clear());

function fetchIntoCache(kind: RecipeRef["kind"], ref: string | number): Promise<void> {
  const key = `${kind}:${ref}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const epochs = `${storeEpoch()}:${userStoreEpoch()}`;
  const stillCurrent = () => `${storeEpoch()}:${userStoreEpoch()}` === epochs;
  // A late response of a previous user must not fill the cache, hence the epoch check before every put.
  const guarded: Promise<void> = (
    kind === "catalog"
      ? fetchRecipe(String(ref)).then((r) => void (stillCurrent() && putRecipes([r])))
      : fetchUserRecipe(Number(ref)).then((r) => void (stillCurrent() && putUserRecipes([r])))
  );
  inFlight.set(key, guarded);
  const release = () => {
    if (inFlight.get(key) === guarded) inFlight.delete(key);
  };
  guarded.then(release, release);
  return guarded;
}

/**
 * Name of the recipe a conversation is about: cache first, then the detail fetch (which fills the cache).
 * `failed` is true when it cannot be resolved; callers then show generic copy and the chat keeps working.
 */
export function useRecipeRefName(recipeRef: RecipeRef | null) {
  const catalog = useCachedRecipes();
  const users = useCachedUserRecipes();
  const [failed, setFailed] = useState<string | null>(null);
  const kind = recipeRef?.kind ?? null;
  const ref = recipeRef?.ref ?? null;
  const key = kind && ref !== null ? `${kind}:${ref}` : null;
  const name = kind === "catalog" ? (catalog.get(String(ref))?.name ?? null) : kind === "user" ? (users.get(Number(ref))?.name ?? null) : null;

  // Re-runs when the cache is cleared while mounted (name goes back to null) and fetches again.
  useEffect(() => {
    if (!kind || ref === null || name) return;
    let cancelled = false;
    const mine = `${kind}:${ref}`;
    fetchIntoCache(kind, ref).catch(() => {
      if (!cancelled) setFailed(mine);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, ref, name]);

  return { name, failed: key !== null && failed === key && !name };
}
