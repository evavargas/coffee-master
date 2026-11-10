import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { useMyRecipes } from "@/hooks/useMyRecipes";
import { fetchMyRecipes, type MyRecipeFilter, type MyRecipeItem } from "@/lib/api/myRecipes";
import { clearRecipeStore, getCachedRecipe, patchRecipe } from "@/lib/recipeStore";
import { clearSession } from "@/lib/session";
import { clearUserRecipeStore, dropUserRecipe, getCachedUserRecipe, patchUserRecipe } from "@/lib/userRecipeStore";
import { makeRecipe, makeUserRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("@/lib/api/myRecipes", () => ({ ...jest.requireActual<typeof import("@/lib/api/myRecipes")>("@/lib/api/myRecipes"), fetchMyRecipes: jest.fn() }));

const cat = (slug: string, extra = {}): MyRecipeItem => ({ kind: "catalog", recipe: makeRecipe(slug, { is_saved: true, ...extra }) });
const usr = (id: number, extra = {}): MyRecipeItem => ({ kind: "user", recipe: makeUserRecipe(id, extra) });
const page = (items: MyRecipeItem[], total = items.length, limit = 12, offset = 0) => ({ items, total, limit, offset });

describe("useMyRecipes", () => {
  beforeEach(() => {
    clearRecipeStore();
    clearUserRecipeStore();
    jest.mocked(fetchMyRecipes).mockReset();
  });

  it.each<[MyRecipeFilter]>([["all"], ["favorites"], ["created"], ["saved"]])("the %s tab requests that filter", async (filter) => {
    jest.mocked(fetchMyRecipes).mockResolvedValue(page([usr(1, { is_favorite: true })]));
    const { result } = await renderHook(() => useMyRecipes(filter));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(fetchMyRecipes).toHaveBeenCalledWith({ filter, limit: 12, offset: 0 }, expect.any(AbortSignal));
  });

  it("restarts from scratch when the tab changes", async () => {
    jest.mocked(fetchMyRecipes).mockResolvedValueOnce(page([usr(1)])).mockResolvedValueOnce(page([]));
    const { result, rerender } = await renderHook((p: { f: MyRecipeFilter }) => useMyRecipes(p.f), { initialProps: { f: "all" as MyRecipeFilter } });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await rerender({ f: "saved" });
    await waitFor(() => expect(fetchMyRecipes).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it("pages with load more, advancing by the server page size", async () => {
    jest.mocked(fetchMyRecipes).mockResolvedValueOnce(page([usr(1), cat("a")], 3, 2, 0)).mockResolvedValueOnce(page([usr(2)], 3, 2, 2));
    const { result } = await renderHook(() => useMyRecipes("all"));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(() => result.current.loadMore());
    expect(fetchMyRecipes).toHaveBeenLastCalledWith({ filter: "all", limit: 12, offset: 2 }, expect.any(AbortSignal));
    expect(result.current.items).toHaveLength(3);
    expect(result.current.hasMore).toBe(false);
  });

  it("shows no rows of the previous tab on the render after the tab changes", async () => {
    jest.mocked(fetchMyRecipes).mockResolvedValueOnce(page([usr(1)])).mockReturnValue(new Promise(() => {}));
    const { result, rerender } = await renderHook((p: { f: MyRecipeFilter }) => useMyRecipes(p.f), { initialProps: { f: "all" as MyRecipeFilter } });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const seen: number[] = [];
    await rerender({ f: "saved" });
    seen.push(result.current.items.length);
    expect(seen).toEqual([0]);
    expect(result.current.isLoading).toBe(true);
  });

  it("retrying a failed load more asks for that page, not offset 0", async () => {
    jest.mocked(fetchMyRecipes)
      .mockResolvedValueOnce(page([usr(1)], 3, 1, 0))
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce(page([usr(2)], 3, 1, 1));
    const { result } = await renderHook(() => useMyRecipes("all"));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(() => result.current.loadMore());
    expect(result.current.error).toBeTruthy();
    expect(result.current.items).toHaveLength(1);
    await act(() => result.current.retry());
    expect(fetchMyRecipes).toHaveBeenLastCalledWith({ filter: "all", limit: 12, offset: 1 }, expect.any(AbortSignal));
    expect(result.current.items).toHaveLength(2);
  });

  it("reports an error and can retry", async () => {
    jest.mocked(fetchMyRecipes).mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(page([usr(1)]));
    const { result } = await renderHook(() => useMyRecipes("all"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    await act(() => result.current.retry());
    expect(result.current.error).toBeNull();
    expect(result.current.items).toHaveLength(1);
  });

  it("hides rows that left the tab through the shared caches", async () => {
    jest.mocked(fetchMyRecipes).mockResolvedValue(page([usr(1, { is_favorite: true }), cat("a", { is_favorite: true })]));
    const { result } = await renderHook(() => useMyRecipes("favorites"));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await act(() => patchUserRecipe(1, { is_favorite: false }));
    await act(() => patchRecipe("a", { is_saved: false, is_favorite: false }));
    expect(result.current.items).toHaveLength(0);
    await act(() => dropUserRecipe(1));
  });

  it("clears both caches when the session changes and ignores a response that resolves afterwards", async () => {
    let resolve!: (p: ReturnType<typeof page>) => void;
    jest.mocked(fetchMyRecipes).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useMyRecipes("all"));
    await act(() => clearSession());
    await act(async () => resolve(page([usr(1), cat("a")])));
    expect(getCachedUserRecipe(1)).toBeUndefined();
    expect(getCachedRecipe("a")).toBeUndefined();
    expect(result.current.items).toEqual([]);
  });

  it("session change drops cached rows", async () => {
    jest.mocked(fetchMyRecipes).mockResolvedValue(page([usr(1), cat("a")]));
    const { result } = await renderHook(() => useMyRecipes("all"));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await act(() => clearSession());
    expect(getCachedUserRecipe(1)).toBeUndefined();
    expect(getCachedRecipe("a")).toBeUndefined();
  });
});
