import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import type { CatalogRecipe, RecipeData } from "@/lib/api/recipes";
import type { components } from "@/lib/api/schema.gen";
import { catalogItemSchema, myRecipeEnvelopeSchema, recipeListSchema, userRecipeSchema } from "@/lib/schemas/recipes";

export type UserRecipe = components["schemas"]["UserRecipeOut"];
export type MyRecipeFilter = "all" | "favorites" | "created" | "saved";
export type MyRecipeItem = { kind: "catalog"; recipe: CatalogRecipe } | { kind: "user"; recipe: UserRecipe };

export interface MyRecipesPage {
  items: MyRecipeItem[];
  total: number;
  limit: number;
  offset: number;
}

/** Malformed items are dropped so one bad row never takes the page down. */
export async function fetchMyRecipes(
  { filter, limit, offset }: { filter: MyRecipeFilter; limit: number; offset: number },
  signal?: AbortSignal,
): Promise<MyRecipesPage> {
  const { data } = await apiClient.get<unknown>("/api/me/recipes", { params: { filter, limit, offset }, signal });
  const parsed = recipeListSchema.safeParse(data);
  if (!parsed.success) throw new Error("Malformed recipe list");
  const page = parsed.data;
  const items = page.items.flatMap((raw): MyRecipeItem[] => {
    const env = myRecipeEnvelopeSchema.safeParse(raw);
    if (!env.success) return [];
    if (env.data.kind === "catalog") {
      const r = catalogItemSchema.safeParse(env.data.recipe);
      return r.success ? [{ kind: "catalog", recipe: r.data }] : [];
    }
    const r = userRecipeSchema.safeParse(env.data.recipe);
    return r.success ? [{ kind: "user", recipe: r.data }] : [];
  });
  return { ...page, items };
}

const url = (id: number) => `/api/me/recipes/${id}`;

export async function fetchUserRecipe(id: number, signal?: AbortSignal): Promise<UserRecipe> {
  const { data } = await apiClient.get<unknown>(url(id), { signal });
  const parsed = userRecipeSchema.safeParse(data);
  if (!parsed.success) throw new Error("Malformed recipe");
  return parsed.data;
}

/**
 * Full replace. Resolves to null when the PUT succeeded but the body is unreadable (the write happened,
 * so the caller must not report a failure); throws when the body does not even carry an id.
 */
export async function updateUserRecipe(id: number, recipe: RecipeData): Promise<UserRecipe | null> {
  const { data } = await apiClient.put<unknown>(url(id), recipe);
  const parsed = userRecipeSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  if (typeof data === "object" && data !== null && typeof (data as { id?: unknown }).id === "number") return null;
  throw new Error("Malformed recipe");
}

export async function setUserRecipeFavorite(id: number, isFavorite: boolean): Promise<void> {
  await apiClient.patch(url(id), { is_favorite: isFavorite });
}

export async function removeUserRecipe(id: number): Promise<void> {
  await apiClient.delete(url(id));
}

/**
 * Saves a chat proposal as an own recipe (201, or 200 with the existing one on a repeat).
 * Resolves with the id plus the full recipe when its body is readable; throws when it carries no id.
 */
export async function saveProposal(proposalId: number): Promise<{ id: number; recipe: UserRecipe | null }> {
  const { data } = await apiClient.post<unknown>("/api/me/recipes", { proposal_id: proposalId });
  const parsed = userRecipeSchema.safeParse(data);
  if (parsed.success) return { id: parsed.data.id, recipe: parsed.data };
  const idOnly = z.object({ id: z.number().int() }).safeParse(data);
  if (idOnly.success) return { id: idOnly.data.id, recipe: null };
  throw new Error("Malformed recipe");
}
