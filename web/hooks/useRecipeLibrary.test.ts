import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRecipeLibrary } from "@/hooks/useRecipeLibrary";
import { createRecipeConversation, removeRecipe, saveRecipe, setRecipeFavorite } from "@/lib/api/recipes";
import { clearRecipeStore, getCachedRecipe, putRecipes } from "@/lib/recipeStore";
import { clearSession, saveToken } from "@/lib/session";
import { makeRecipe } from "@/test/recipeFixtures";
import { renderHookWithIntl } from "@/test/renderHookWithIntl";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/recipes", () => ({
  saveRecipe: vi.fn(),
  removeRecipe: vi.fn(),
  setRecipeFavorite: vi.fn(),
  createRecipeConversation: vi.fn(),
}));

describe("useRecipeLibrary", () => {
  beforeEach(() => {
    clearRecipeStore();
    putRecipes([makeRecipe("a")]);
    push.mockReset();
    vi.mocked(saveRecipe).mockReset().mockResolvedValue();
    vi.mocked(removeRecipe).mockReset().mockResolvedValue();
    vi.mocked(setRecipeFavorite).mockReset().mockResolvedValue({ slug: "a", is_saved: true, is_favorite: true });
    vi.mocked(createRecipeConversation).mockReset().mockResolvedValue(7);
  });

  it("save updates the cached recipe", async () => {
    const { result } = renderHookWithIntl(() => useRecipeLibrary("a"));
    await act(() => result.current.save());
    expect(saveRecipe).toHaveBeenCalledWith("a");
    expect(getCachedRecipe("a")?.is_saved).toBe(true);
  });

  it("remove clears saved and favorite", async () => {
    putRecipes([makeRecipe("a", { is_saved: true, is_favorite: true })]);
    const { result } = renderHookWithIntl(() => useRecipeLibrary("a"));
    await act(() => result.current.remove());
    expect(getCachedRecipe("a")).toMatchObject({ is_saved: false, is_favorite: false });
  });

  it("favorite toggle updates the cache", async () => {
    const { result } = renderHookWithIntl(() => useRecipeLibrary("a"));
    await act(() => result.current.toggleFavorite());
    expect(setRecipeFavorite).toHaveBeenCalledWith("a", true);
    expect(getCachedRecipe("a")).toMatchObject({ is_favorite: true, is_saved: true });
  });

  it("rolls back and reports an error when the request fails", async () => {
    vi.mocked(setRecipeFavorite).mockRejectedValue(new Error("boom"));
    const { result } = renderHookWithIntl(() => useRecipeLibrary("a"));
    await act(() => result.current.toggleFavorite());
    expect(getCachedRecipe("a")).toMatchObject({ is_favorite: false, is_saved: false });
    expect(result.current.error).toBeTruthy();
    expect(result.current.isPending).toBe(false);
  });

  it("ask and adapt create a catalog conversation and navigate with the intent", async () => {
    const { result } = renderHookWithIntl(() => useRecipeLibrary("a"));
    await act(() => result.current.ask());
    expect(createRecipeConversation).toHaveBeenCalledWith("a");
    expect(push).toHaveBeenLastCalledWith("/chat?c=7&intent=ask");
    await act(() => result.current.adapt());
    expect(push).toHaveBeenLastCalledWith("/chat?c=7&intent=adapt");
  });

  it("shows an error and stays when the conversation cannot be created", async () => {
    vi.mocked(createRecipeConversation).mockRejectedValue(new Error("boom"));
    const { result } = renderHookWithIntl(() => useRecipeLibrary("a"));
    await act(() => result.current.ask());
    expect(push).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
    expect(result.current.isPending).toBe(false);
  });

  it("ignores a second toggle while one is in flight", async () => {
    let finish!: () => void;
    vi.mocked(setRecipeFavorite).mockImplementation(() => new Promise((r) => (finish = () => r({ slug: "a", is_saved: true, is_favorite: true }))));
    const { result } = renderHookWithIntl(() => useRecipeLibrary("a"));
    const other = renderHookWithIntl(() => useRecipeLibrary("a"));
    let first!: Promise<void>;
    act(() => {
      first = result.current.toggleFavorite();
      void result.current.toggleFavorite();
      void other.result.current.toggleFavorite();
    });
    expect(setRecipeFavorite).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await first;
    });
    expect(getCachedRecipe("a")?.is_favorite).toBe(true);
  });

  it("a refetch during a mutation does not overwrite the optimistic state", async () => {
    let finish!: () => void;
    vi.mocked(saveRecipe).mockImplementation(() => new Promise<void>((r) => (finish = r)));
    const { result } = renderHookWithIntl(() => useRecipeLibrary("a"));
    let p!: Promise<void>;
    act(() => {
      p = result.current.save();
    });
    putRecipes([makeRecipe("a")]);
    expect(getCachedRecipe("a")?.is_saved).toBe(true);
    await act(async () => {
      finish();
      await p;
    });
  });

  it("rolls back save to the confirmed state on error", async () => {
    vi.mocked(saveRecipe).mockRejectedValue(new Error("boom"));
    const { result } = renderHookWithIntl(() => useRecipeLibrary("a"));
    await act(() => result.current.save());
    expect(getCachedRecipe("a")).toMatchObject({ is_saved: false, is_favorite: false });
    expect(result.current.error).toBeTruthy();
  });

  it("rolls back remove (saved and favorite) on error and unlocks for a retry", async () => {
    putRecipes([makeRecipe("a", { is_saved: true, is_favorite: true })]);
    vi.mocked(removeRecipe).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHookWithIntl(() => useRecipeLibrary("a"));
    await act(() => result.current.remove());
    expect(getCachedRecipe("a")).toMatchObject({ is_saved: true, is_favorite: true });
    await act(() => result.current.remove());
    expect(getCachedRecipe("a")).toMatchObject({ is_saved: false, is_favorite: false });
  });

  it("a user switch does not show the previous user's flags", async () => {
    putRecipes([makeRecipe("a", { is_saved: true, is_favorite: true })]);
    saveToken("new-user");
    expect(getCachedRecipe("a")).toBeUndefined();
    clearSession();
  });
});
