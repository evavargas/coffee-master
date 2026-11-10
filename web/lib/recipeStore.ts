import { useSyncExternalStore } from "react";

import type { CatalogRecipe } from "@/lib/api/recipes";
import { onSessionChange } from "@/lib/session";

/** Tiny shared cache of catalog recipes by slug, so list, detail and library actions stay in sync. */
let recipes: ReadonlyMap<string, CatalogRecipe> = new Map();
let epoch = 0;
const locked = new Set<string>();
const listeners = new Set<() => void>();

function set(next: Map<string, CatalogRecipe>) {
  recipes = next;
  listeners.forEach((l) => l());
}

function merge(items: CatalogRecipe[]) {
  const next = new Map(recipes);
  items.forEach((r) => next.set(r.slug, r));
  set(next);
}

/** Stores server data. Slugs with a mutation in flight are skipped so a refetch can't undo an optimistic update. */
export function putRecipes(items: CatalogRecipe[]) {
  merge(items.filter((r) => !locked.has(r.slug)));
}

export function getCachedRecipe(slug: string) {
  return recipes.get(slug);
}

export function patchRecipe(slug: string, patch: Partial<CatalogRecipe>) {
  const current = recipes.get(slug);
  if (current) merge([{ ...current, ...patch }]);
}

/** Per-slug mutation guard shared by every hook instance. Returns false when one is already running. */
export function lockRecipe(slug: string): boolean {
  if (locked.has(slug)) return false;
  locked.add(slug);
  return true;
}

export function unlockRecipe(slug: string) {
  locked.delete(slug);
}

/** Changes whenever the store is cleared, so late responses of a previous user can be ignored. */
export function storeEpoch() {
  return epoch;
}

export function clearRecipeStore() {
  epoch += 1;
  locked.clear();
  set(new Map());
}

// Flags such as is_saved are per user: drop them when a session starts or ends.
onSessionChange(clearRecipeStore);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useCachedRecipes(): ReadonlyMap<string, CatalogRecipe> {
  return useSyncExternalStore(subscribe, () => recipes, () => recipes);
}
