import { AxiosError, type AxiosResponse } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { useRecipe } from "@/hooks/useRecipe";
import { fetchRecipe } from "@/lib/api/recipes";
import { clearRecipeStore, getCachedRecipe } from "@/lib/recipeStore";
import { clearSession } from "@/lib/session";
import { makeRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("@/lib/api/recipes", () => ({ fetchRecipe: jest.fn() }));

const mockedFetch = fetchRecipe as jest.MockedFunction<typeof fetchRecipe>;

describe("useRecipe", () => {
  beforeEach(() => {
    clearRecipeStore();
    mockedFetch.mockReset();
  });

  it("loads a recipe", async () => {
    mockedFetch.mockResolvedValue(makeRecipe("a"));
    const { result } = await renderHook(() => useRecipe("a"));
    await waitFor(() => expect(result.current.recipe?.slug).toBe("a"));
  });

  it("flags a 404", async () => {
    mockedFetch.mockRejectedValue(new AxiosError("x", "404", undefined, undefined, { status: 404, data: {} } as unknown as AxiosResponse));
    const { result } = await renderHook(() => useRecipe("zzz"));
    await waitFor(() => expect(result.current.notFound).toBe(true));
  });

  it.each([
    ["clearRecipeStore", clearRecipeStore],
    ["clearSession", clearSession],
  ])("drops a recipe that resolves after %s", async (_name, clear) => {
    let resolve!: (v: ReturnType<typeof makeRecipe>) => void;
    mockedFetch.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useRecipe("a"));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    await act(async () => {
      await clear();
    });
    await act(async () => resolve(makeRecipe("a", { is_saved: true })));
    expect(getCachedRecipe("a")).toBeUndefined();
    expect(result.current.recipe).toBeNull();
  });
});
