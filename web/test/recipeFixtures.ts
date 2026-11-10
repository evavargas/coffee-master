import type { UserRecipe } from "@/lib/api/myRecipes";
import type { CatalogRecipe } from "@/lib/api/recipes";

export function makeRecipe(slug: string, extra: Partial<CatalogRecipe> = {}): CatalogRecipe {
  return {
    slug,
    name: `Receta ${slug}`,
    method: "v60",
    archived: false,
    is_saved: false,
    is_favorite: false,
    source: { document: "x.md" },
    status: "validated",
    ...extra,
  };
}

export function makeUserRecipe(id: number, extra: Partial<UserRecipe> = {}): UserRecipe {
  return {
    id,
    name: `Mi receta ${id}`,
    method: "v60",
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}
