import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { useUserRecipe } from "@/hooks/useUserRecipe";
import { fetchUserRecipe, type UserRecipe } from "@/lib/api/myRecipes";
import { clearSession } from "@/lib/session";
import { clearUserRecipeStore, getCachedUserRecipe, putUserRecipes } from "@/lib/userRecipeStore";
import { makeUserRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("@/lib/api/myRecipes", () => ({ ...jest.requireActual<typeof import("@/lib/api/myRecipes")>("@/lib/api/myRecipes"), fetchUserRecipe: jest.fn() }));

describe("useUserRecipe", () => {
  beforeEach(() => {
    clearUserRecipeStore();
    jest.mocked(fetchUserRecipe).mockReset();
  });

  it("loads and caches the recipe", async () => {
    jest.mocked(fetchUserRecipe).mockResolvedValue(makeUserRecipe(1));
    const { result } = await renderHook(() => useUserRecipe(1));
    await waitFor(() => expect(result.current.recipe?.id).toBe(1));
  });

  it("a fetch resolving after a session change does not repopulate the store", async () => {
    let resolve!: (r: UserRecipe) => void;
    jest.mocked(fetchUserRecipe).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useUserRecipe(1));
    await act(() => clearSession());
    await act(async () => resolve(makeUserRecipe(1)));
    expect(getCachedUserRecipe(1)).toBeUndefined();
    expect(result.current.recipe).toBeNull();
  });

  it("a 404 drops the cached copy and reports not found", async () => {
    putUserRecipes([makeUserRecipe(1)]);
    jest.mocked(fetchUserRecipe).mockRejectedValue(Object.assign(new Error("404"), { isAxiosError: true, response: { status: 404 } }));
    const { result } = await renderHook(() => useUserRecipe(1));
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(getCachedUserRecipe(1)).toBeUndefined();
  });

  it("does not fetch for an invalid id", async () => {
    const { result } = await renderHook(() => useUserRecipe(NaN));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchUserRecipe).not.toHaveBeenCalled();
    expect(result.current.notFound).toBe(true);
  });
});
