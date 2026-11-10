import { useSyncExternalStore } from "react";

import type { UserRecipe } from "@/lib/api/myRecipes";
import { onSessionChange } from "@/lib/session";

/** Shared cache of the user's own recipes by id (same protections as recipeStore: lock, epoch, session clear). */
let recipes: ReadonlyMap<number, UserRecipe> = new Map();
let epoch = 0;
const locked = new Set<number>();
// Ids whose deletion the server confirmed: a GET that was already in flight must not bring them back.
const deleted = new Set<number>();
const listeners = new Set<() => void>();

function set(next: Map<number, UserRecipe>) {
  recipes = next;
  listeners.forEach((l) => l());
}

function merge(items: UserRecipe[]) {
  const next = new Map(recipes);
  items.forEach((r) => next.set(r.id, r));
  set(next);
}

/** Stores server data. Ids with a mutation in flight are skipped so a refetch can't undo an optimistic update. */
export function putUserRecipes(items: UserRecipe[]) {
  merge(items.filter((r) => !locked.has(r.id) && !deleted.has(r.id)));
}

/** Writes the last server-confirmed copy back (rollback); ignores the lock on purpose. */
export function restoreUserRecipe(recipe: UserRecipe) {
  merge([recipe]);
}

export function getCachedUserRecipe(id: number) {
  return recipes.get(id);
}

export function patchUserRecipe(id: number, patch: Partial<UserRecipe>) {
  const current = recipes.get(id);
  if (current) merge([{ ...current, ...patch }]);
}

export function dropUserRecipe(id: number) {
  const next = new Map(recipes);
  next.delete(id);
  set(next);
}

export function tombstoneUserRecipe(id: number) {
  deleted.add(id);
  dropUserRecipe(id);
}

export function lockUserRecipe(id: number): boolean {
  if (locked.has(id)) return false;
  locked.add(id);
  return true;
}

export function unlockUserRecipe(id: number) {
  locked.delete(id);
}

/** Changes whenever the store is cleared, so late responses of a previous user can be ignored. */
export function userStoreEpoch() {
  return epoch;
}

export function clearUserRecipeStore() {
  epoch += 1;
  locked.clear();
  deleted.clear();
  set(new Map());
}

onSessionChange(clearUserRecipeStore);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useCachedUserRecipes(): ReadonlyMap<number, UserRecipe> {
  return useSyncExternalStore(subscribe, () => recipes, () => recipes);
}
