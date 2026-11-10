import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { apiClient } from "@/lib/api/client";
import { fetchMyRecipes, fetchUserRecipe, updateUserRecipe } from "@/lib/api/myRecipes";
import { clearUserRecipeStore, getCachedUserRecipe, putUserRecipes } from "@/lib/userRecipeStore";
import { clearSession, saveToken } from "@/lib/session";
import { makeRecipe, makeUserRecipe } from "@/test/recipeFixtures";

describe("my recipes api", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("splits catalog and user items by kind and drops malformed ones", async () => {
    jest.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        items: [
          { kind: "catalog", recipe: makeRecipe("a") },
          { kind: "user", recipe: makeUserRecipe(3) },
          { kind: "user", recipe: { id: "x" } },
          { kind: "other", recipe: {} },
          null,
        ],
        total: 5,
        limit: 12,
        offset: 0,
      },
    });
    const page = await fetchMyRecipes({ filter: "saved", limit: 12, offset: 0 });
    expect(page.items.map((i) => i.kind)).toEqual(["catalog", "user"]);
    expect(apiClient.get).toHaveBeenCalledWith("/api/me/recipes", expect.objectContaining({ params: { filter: "saved", limit: 12, offset: 0 } }));
  });

  it("PUTs the full recipe", async () => {
    jest.spyOn(apiClient, "put").mockResolvedValue({ data: makeUserRecipe(3) });
    await updateUserRecipe(3, { name: "x", method: "v60" });
    expect(apiClient.put).toHaveBeenCalledWith("/api/me/recipes/3", { name: "x", method: "v60" });
  });

  it("treats a malformed PUT body that has an id as success, and one without as failure", async () => {
    jest.spyOn(apiClient, "put").mockResolvedValueOnce({ data: { id: 3, name: 5 } });
    await expect(updateUserRecipe(3, { name: "x", method: "v60" })).resolves.toBeNull();
    jest.spyOn(apiClient, "put").mockResolvedValueOnce({ data: "nope" });
    await expect(updateUserRecipe(3, { name: "x", method: "v60" })).rejects.toThrow();
  });

  it("rejects a malformed detail and a malformed list envelope", async () => {
    jest.spyOn(apiClient, "get").mockResolvedValue({ data: { id: "x" } });
    await expect(fetchUserRecipe(1)).rejects.toThrow();
    await expect(fetchMyRecipes({ filter: "all", limit: 12, offset: 0 })).rejects.toThrow();
  });

  it.each([
    ["sign-out / 401", () => clearSession()],
    ["login", () => saveToken("t")],
  ])("the user store is cleared on %s", async (_name, change) => {
    clearUserRecipeStore();
    putUserRecipes([makeUserRecipe(1)]);
    await change();
    expect(getCachedUserRecipe(1)).toBeUndefined();
  });
});
