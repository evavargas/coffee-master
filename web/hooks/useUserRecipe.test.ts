import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUserRecipe } from "@/hooks/useUserRecipe";
import { fetchUserRecipe, type UserRecipe } from "@/lib/api/myRecipes";
import { clearSession } from "@/lib/session";
import { clearUserRecipeStore, getCachedUserRecipe, putUserRecipes } from "@/lib/userRecipeStore";
import { makeUserRecipe } from "@/test/recipeFixtures";
import { renderHookWithIntl } from "@/test/renderHookWithIntl";

vi.mock("@/lib/api/myRecipes", async (orig) => ({ ...(await orig<typeof import("@/lib/api/myRecipes")>()), fetchUserRecipe: vi.fn() }));

describe("useUserRecipe", () => {
  beforeEach(() => {
    clearUserRecipeStore();
    vi.mocked(fetchUserRecipe).mockReset();
  });

  it("loads and caches the recipe", async () => {
    vi.mocked(fetchUserRecipe).mockResolvedValue(makeUserRecipe(1));
    const { result } = renderHookWithIntl(() => useUserRecipe(1));
    await waitFor(() => expect(result.current.recipe?.id).toBe(1));
  });

  it("a fetch resolving after a session change does not repopulate the store", async () => {
    let resolve!: (r: UserRecipe) => void;
    vi.mocked(fetchUserRecipe).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHookWithIntl(() => useUserRecipe(1));
    act(() => clearSession());
    await act(async () => resolve(makeUserRecipe(1)));
    expect(getCachedUserRecipe(1)).toBeUndefined();
    expect(result.current.recipe).toBeNull();
  });

  it("a 404 drops the cached copy and reports not found", async () => {
    putUserRecipes([makeUserRecipe(1)]);
    vi.mocked(fetchUserRecipe).mockRejectedValue(Object.assign(new Error("404"), { isAxiosError: true, response: { status: 404 } }));
    const { result } = renderHookWithIntl(() => useUserRecipe(1));
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(getCachedUserRecipe(1)).toBeUndefined();
  });

  it("does not fetch for an invalid id", async () => {
    const { result } = renderHookWithIntl(() => useUserRecipe(NaN));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchUserRecipe).not.toHaveBeenCalled();
    expect(result.current.notFound).toBe(true);
  });
});
