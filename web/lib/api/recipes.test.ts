import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api/client";
import { fetchRecipe, fetchRecipes, safeMethod } from "@/lib/api/recipes";
import { getCachedRecipe, putRecipes } from "@/lib/recipeStore";
import { makeRecipe } from "@/test/recipeFixtures";

describe("recipes api", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("drops malformed list items instead of failing the page", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { items: [makeRecipe("ok"), { slug: "bad" }, null, { ...makeRecipe("bad2"), steps: "x" }], total: 4, limit: 12, offset: 0 },
    });
    const page = await fetchRecipes({ limit: 12, offset: 0 });
    expect(page.items.map((r) => r.slug)).toEqual(["ok"]);
  });

  it("rejects a malformed list envelope and a malformed detail", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { items: "nope" } });
    await expect(fetchRecipes({ limit: 12, offset: 0 })).rejects.toThrow();
    await expect(fetchRecipe("x")).rejects.toThrow();
  });

  it("falls back to other for unknown methods", () => {
    expect(safeMethod("v60")).toBe("v60");
    expect(safeMethod("siphon")).toBe("other");
  });

  it("the store is cleared when the 401 handler clears the session", async () => {
    const { clearSession } = await import("@/lib/session");
    putRecipes([makeRecipe("a")]);
    clearSession();
    expect(getCachedRecipe("a")).toBeUndefined();
  });
});
