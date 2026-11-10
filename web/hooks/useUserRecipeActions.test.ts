import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUserRecipeActions } from "@/hooks/useUserRecipeActions";
import { removeUserRecipe, setUserRecipeFavorite } from "@/lib/api/myRecipes";
import { clearSession } from "@/lib/session";
import { clearUserRecipeStore, getCachedUserRecipe, putUserRecipes } from "@/lib/userRecipeStore";
import { makeUserRecipe } from "@/test/recipeFixtures";
import { renderHookWithIntl } from "@/test/renderHookWithIntl";

vi.mock("@/lib/api/myRecipes", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/myRecipes")>()),
  setUserRecipeFavorite: vi.fn(),
  removeUserRecipe: vi.fn(),
}));

describe("useUserRecipeActions", () => {
  beforeEach(() => {
    clearUserRecipeStore();
    putUserRecipes([makeUserRecipe(1)]);
    vi.mocked(setUserRecipeFavorite).mockReset().mockResolvedValue();
    vi.mocked(removeUserRecipe).mockReset().mockResolvedValue();
  });

  it("favorite is optimistic and sent once", async () => {
    const { result } = renderHookWithIntl(() => useUserRecipeActions(1));
    await act(() => result.current.toggleFavorite());
    expect(setUserRecipeFavorite).toHaveBeenCalledWith(1, true);
    expect(getCachedUserRecipe(1)?.is_favorite).toBe(true);
  });

  it("rolls back favorite on error", async () => {
    vi.mocked(setUserRecipeFavorite).mockRejectedValue(new Error("boom"));
    const { result } = renderHookWithIntl(() => useUserRecipeActions(1));
    await act(() => result.current.toggleFavorite());
    expect(getCachedUserRecipe(1)?.is_favorite).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.isPending).toBe(false);
  });

  it("a rapid double toggle sends one request", async () => {
    let finish!: () => void;
    vi.mocked(setUserRecipeFavorite).mockReturnValue(new Promise<void>((r) => (finish = r)));
    const { result } = renderHookWithIntl(() => useUserRecipeActions(1));
    let first!: Promise<unknown>;
    act(() => {
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
    const { result } = renderHookWithIntl(() => useUserRecipeActions(1));
    let ok = false;
    await act(async () => void (ok = await result.current.remove()));
    expect(ok).toBe(true);
    expect(removeUserRecipe).toHaveBeenCalledWith(1);
    expect(getCachedUserRecipe(1)).toBeUndefined();
  });

  it("restores the recipe when remove fails", async () => {
    vi.mocked(removeUserRecipe).mockRejectedValue(new Error("boom"));
    const { result } = renderHookWithIntl(() => useUserRecipeActions(1));
    let ok = true;
    await act(async () => void (ok = await result.current.remove()));
    expect(ok).toBe(false);
    expect(getCachedUserRecipe(1)?.name).toBe("Mi receta 1");
    expect(result.current.error).toBeTruthy();
  });

  it("a refetch cannot undo an optimistic update while the mutation is in flight", async () => {
    let finish!: () => void;
    vi.mocked(setUserRecipeFavorite).mockReturnValue(new Promise<void>((r) => (finish = r)));
    const { result } = renderHookWithIntl(() => useUserRecipeActions(1));
    let p!: Promise<unknown>;
    act(() => void (p = result.current.toggleFavorite()));
    act(() => putUserRecipes([makeUserRecipe(1, { is_favorite: false })]));
    expect(getCachedUserRecipe(1)?.is_favorite).toBe(true);
    await act(async () => {
      finish();
      await p;
    });
    // once the mutation completed the lock is released and server data applies again
    expect(getCachedUserRecipe(1)?.is_favorite).toBe(true);
    act(() => putUserRecipes([makeUserRecipe(1, { is_favorite: true, name: "fresh" })]));
    expect(getCachedUserRecipe(1)?.name).toBe("fresh");
  });

  it("a stale GET cannot undo a completed delete", async () => {
    const { result } = renderHookWithIntl(() => useUserRecipeActions(1));
    await act(async () => void (await result.current.remove()));
    putUserRecipes([makeUserRecipe(1)]);
    expect(getCachedUserRecipe(1)).toBeUndefined();
  });

  it("reports failures to the list through onError", async () => {
    vi.mocked(removeUserRecipe).mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    const { result } = renderHookWithIntl(() => useUserRecipeActions(1, onError));
    await act(async () => void (await result.current.remove()));
    expect(onError).toHaveBeenCalledWith(expect.any(String));
  });

  it("a mutation resolving after a session change does not repopulate or roll back the store", async () => {
    let fail!: (e: Error) => void;
    vi.mocked(setUserRecipeFavorite).mockReturnValue(new Promise<void>((_, rej) => (fail = rej)));
    const { result } = renderHookWithIntl(() => useUserRecipeActions(1));
    let p!: Promise<unknown>;
    act(() => void (p = result.current.toggleFavorite()));
    act(() => clearSession());
    await act(async () => {
      fail(new Error("late"));
      await p;
    });
    expect(getCachedUserRecipe(1)).toBeUndefined();
  });
});
