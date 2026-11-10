import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { useUserRecipeActions } from "@/hooks/useUserRecipeActions";
import { removeUserRecipe, setUserRecipeFavorite } from "@/lib/api/myRecipes";
import { clearSession } from "@/lib/session";
import { clearUserRecipeStore, getCachedUserRecipe, putUserRecipes } from "@/lib/userRecipeStore";
import { makeUserRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("@/lib/api/myRecipes", () => ({
  ...jest.requireActual<typeof import("@/lib/api/myRecipes")>("@/lib/api/myRecipes"),
  setUserRecipeFavorite: jest.fn(),
  removeUserRecipe: jest.fn(),
}));

describe("useUserRecipeActions", () => {
  beforeEach(() => {
    clearUserRecipeStore();
    putUserRecipes([makeUserRecipe(1)]);
    jest.mocked(setUserRecipeFavorite).mockReset().mockResolvedValue();
    jest.mocked(removeUserRecipe).mockReset().mockResolvedValue();
  });

  it("favorite is optimistic and sent once", async () => {
    const { result } = await renderHook(() => useUserRecipeActions(1));
    await act(() => result.current.toggleFavorite());
    expect(setUserRecipeFavorite).toHaveBeenCalledWith(1, true);
    expect(getCachedUserRecipe(1)?.is_favorite).toBe(true);
  });

  it("rolls back favorite on error", async () => {
    jest.mocked(setUserRecipeFavorite).mockRejectedValue(new Error("boom"));
    const { result } = await renderHook(() => useUserRecipeActions(1));
    await act(() => result.current.toggleFavorite());
    expect(getCachedUserRecipe(1)?.is_favorite).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.isPending).toBe(false);
  });

  it("a rapid double toggle sends one request", async () => {
    let finish!: () => void;
    jest.mocked(setUserRecipeFavorite).mockReturnValue(new Promise<void>((r) => (finish = r)));
    const { result } = await renderHook(() => useUserRecipeActions(1));
    let first!: Promise<unknown>;
    await act(() => {
      first = result.current.toggleFavorite();
      void result.current.toggleFavorite();
    });
    await act(async () => {
      finish();
      await first;
    });
    expect(setUserRecipeFavorite).toHaveBeenCalledTimes(1);
    expect(getCachedUserRecipe(1)?.is_favorite).toBe(true);
  });

  it("remove drops the recipe and reports success", async () => {
    const { result } = await renderHook(() => useUserRecipeActions(1));
    let ok = false;
    await act(async () => void (ok = await result.current.remove()));
    expect(ok).toBe(true);
    expect(removeUserRecipe).toHaveBeenCalledWith(1);
    expect(getCachedUserRecipe(1)).toBeUndefined();
  });

  it("restores the recipe when remove fails", async () => {
    jest.mocked(removeUserRecipe).mockRejectedValue(new Error("boom"));
    const { result } = await renderHook(() => useUserRecipeActions(1));
    let ok = true;
    await act(async () => void (ok = await result.current.remove()));
    expect(ok).toBe(false);
    expect(getCachedUserRecipe(1)?.name).toBe("Mi receta 1");
    expect(result.current.error).toBeTruthy();
  });

  it("a refetch cannot undo an optimistic update while the mutation is in flight", async () => {
    let finish!: () => void;
    jest.mocked(setUserRecipeFavorite).mockReturnValue(new Promise<void>((r) => (finish = r)));
    const { result } = await renderHook(() => useUserRecipeActions(1));
    let p!: Promise<unknown>;
    await act(() => void (p = result.current.toggleFavorite()));
    await act(() => putUserRecipes([makeUserRecipe(1, { is_favorite: false })]));
    expect(getCachedUserRecipe(1)?.is_favorite).toBe(true);
    await act(async () => {
      finish();
      await p;
    });
    // once the mutation completed the lock is released and server data applies again
    expect(getCachedUserRecipe(1)?.is_favorite).toBe(true);
    await act(() => putUserRecipes([makeUserRecipe(1, { is_favorite: true, name: "fresh" })]));
    expect(getCachedUserRecipe(1)?.name).toBe("fresh");
  });

  it("a stale GET cannot undo a completed delete", async () => {
    const { result } = await renderHook(() => useUserRecipeActions(1));
    await act(async () => void (await result.current.remove()));
    putUserRecipes([makeUserRecipe(1)]);
    expect(getCachedUserRecipe(1)).toBeUndefined();
  });

  it("reports failures to the list through onError", async () => {
    jest.mocked(removeUserRecipe).mockRejectedValue(new Error("boom"));
    const onError = jest.fn();
    const { result } = await renderHook(() => useUserRecipeActions(1, onError));
    await act(async () => void (await result.current.remove()));
    expect(onError).toHaveBeenCalledWith(expect.any(String));
  });

  it("a mutation resolving after a session change does not repopulate or roll back the store", async () => {
    let fail!: (e: Error) => void;
    jest.mocked(setUserRecipeFavorite).mockReturnValue(new Promise<void>((_, rej) => (fail = rej)));
    const { result } = await renderHook(() => useUserRecipeActions(1));
    let p!: Promise<unknown>;
    await act(() => void (p = result.current.toggleFavorite()));
    await act(() => clearSession());
    await act(async () => {
      fail(new Error("late"));
      await p;
    });
    expect(getCachedUserRecipe(1)).toBeUndefined();
  });
});
