import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/schema.gen";
import { catalogRecipeSchema, conversationCreatedSchema, recipeListSchema } from "@/lib/schemas/recipes";

type Schemas = components["schemas"];

export type CatalogRecipe = Schemas["CatalogRecipeOut"];
export type RecipeMethod = Schemas["RecipeMethod"];
export type RecipeData = Schemas["RecipeData"];

export const recipeMethods: RecipeMethod[] = ["v60", "french_press", "moka", "aeropress", "espresso", "cold_brew", "other"];

/** Unknown methods (e.g. added by the backend later) render as "other" instead of a missing translation. */
export function safeMethod(method: string | null | undefined): RecipeMethod {
  return recipeMethods.find((m) => m === method) ?? "other";
}

export interface RecipeQuery {
  q?: string;
  method?: RecipeMethod;
  limit: number;
  offset: number;
}

export interface RecipePage {
  items: CatalogRecipe[];
  total: number;
  limit: number;
  offset: number;
}

/** Malformed items are dropped so one bad row never takes the page down. */
export async function fetchRecipes({ q, method, limit, offset }: RecipeQuery, signal?: AbortSignal): Promise<RecipePage> {
  const { data } = await apiClient.get<unknown>("/api/recipes", {
    params: { q: q || undefined, method: method || undefined, limit, offset },
    signal,
  });
  const page = recipeListSchema.parse(data);
  const items = page.items.flatMap((raw) => {
    const parsed = catalogRecipeSchema.safeParse(raw);
    return parsed.success ? [parsed.data as unknown as CatalogRecipe] : [];
  });
  return { ...page, items };
}

export async function fetchRecipe(slug: string, signal?: AbortSignal): Promise<CatalogRecipe> {
  const { data } = await apiClient.get<unknown>(`/api/recipes/${encodeURIComponent(slug)}`, { signal });
  return catalogRecipeSchema.parse(data) as unknown as CatalogRecipe;
}

const libraryUrl = (slug: string) => `/api/me/library/catalog/${encodeURIComponent(slug)}`;

export async function saveRecipe(slug: string): Promise<void> {
  await apiClient.put(libraryUrl(slug));
}

export async function removeRecipe(slug: string): Promise<void> {
  await apiClient.delete(libraryUrl(slug));
}

export async function setRecipeFavorite(slug: string, isFavorite: boolean): Promise<Schemas["LibraryEntryOut"]> {
  const { data } = await apiClient.patch<Schemas["LibraryEntryOut"]>(libraryUrl(slug), { is_favorite: isFavorite });
  return data;
}

/** Starts a conversation about a catalog recipe and returns its id. */
export async function createRecipeConversation(slug: string): Promise<number> {
  const { data } = await apiClient.post<unknown>("/api/conversations", { recipe_ref: { kind: "catalog", ref: slug } });
  return conversationCreatedSchema.parse(data).id;
}
