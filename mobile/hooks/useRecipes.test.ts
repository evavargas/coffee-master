import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { useRecipes } from "@/hooks/useRecipes";
import { fetchRecipes, type CatalogRecipe } from "@/lib/api/recipes";
import { clearRecipeStore, getCachedRecipe } from "@/lib/recipeStore";
import { clearSession } from "@/lib/session";
import { makeRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("@/lib/api/recipes", () => ({
  ...jest.requireActual<typeof import("@/lib/api/recipes")>("@/lib/api/recipes"),
  fetchRecipes: jest.fn(),
}));

const mockedFetch = fetchRecipes as jest.MockedFunction<typeof fetchRecipes>;
const page = (items: CatalogRecipe[], total = items.length, limit = 12, offset = 0) => ({ items, total, limit, offset });
const query = (extra = {}) => ({ q: "", method: undefined, limit: 12, offset: 0, ...extra });

describe("useRecipes", () => {
  beforeEach(() => {
    clearRecipeStore();
    mockedFetch.mockReset();
  });

  it("loads the list with a single request", async () => {
    mockedFetch.mockResolvedValue(page([makeRecipe("a")]));
    const { result } = await renderHook(() => useRecipes({ q: " " }, 0));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith(query(), expect.any(AbortSignal));
    expect(result.current.hasMore).toBe(false);
  });

  it("exposes the empty state", async () => {
    mockedFetch.mockResolvedValue(page([]));
    const { result } = await renderHook(() => useRecipes({ q: "" }, 0));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("sends q and method (filter)", async () => {
    mockedFetch.mockResolvedValue(page([makeRecipe("a")]));
    const { result, rerender } = await renderHook((p: { q: string; method?: "moka" }) => useRecipes(p, 0), {
      initialProps: { q: "" } as { q: string; method?: "moka" },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await rerender({ q: " etiopia ", method: "moka" });
    await waitFor(() =>
      expect(mockedFetch).toHaveBeenLastCalledWith(query({ q: "etiopia", method: "moka" }), expect.any(AbortSignal)),
    );
  });

  it("debounces typing into one request", async () => {
    jest.useFakeTimers();
    try {
      mockedFetch.mockResolvedValue(page([]));
      const { rerender } = await renderHook((p: { q: string }) => useRecipes(p, 300), { initialProps: { q: "" } });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      await rerender({ q: "e" });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
      });
      await rerender({ q: "et" });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(299);
      });
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });
      expect(mockedFetch).toHaveBeenCalledTimes(2);
      expect(mockedFetch).toHaveBeenLastCalledWith(query({ q: "et" }), expect.any(AbortSignal));
    } finally {
      jest.useRealTimers();
    }
  });

  it("ignores an out-of-order response and aborts the superseded request", async () => {
    let resolveOld!: (v: ReturnType<typeof page>) => void;
    const signals: AbortSignal[] = [];
    mockedFetch.mockImplementation((q, signal) => {
      signals.push(signal as AbortSignal);
      return q.q === "old" ? new Promise((r) => (resolveOld = r)) : Promise.resolve(page([makeRecipe("new")]));
    });
    const { result, rerender } = await renderHook((p: { q: string }) => useRecipes(p, 0), { initialProps: { q: "old" } });
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    await rerender({ q: "new" });
    await waitFor(() => expect(result.current.items.map((r) => r.slug)).toEqual(["new"]));
    expect(signals[0].aborted).toBe(true);
    await act(async () => resolveOld(page([makeRecipe("old")])));
    expect(result.current.items.map((r) => r.slug)).toEqual(["new"]);
    expect(result.current.isLoading).toBe(false);
  });

  it("paginates with the next offset, appends and dedupes", async () => {
    mockedFetch
      .mockResolvedValueOnce(page([makeRecipe("a")], 3, 1, 0))
      .mockResolvedValueOnce(page([makeRecipe("a"), makeRecipe("b")], 3, 1, 1));
    const { result } = await renderHook(() => useRecipes({ q: "" }, 0));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(() => result.current.loadMore());
    expect(mockedFetch).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }), expect.any(AbortSignal));
    expect(result.current.items.map((r) => r.slug)).toEqual(["a", "b"]);
  });

  it("a failed loadMore keeps the loaded rows and the same offset", async () => {
    mockedFetch.mockResolvedValueOnce(page([makeRecipe("a")], 2, 1, 0)).mockRejectedValueOnce(new Error("boom"));
    const { result } = await renderHook(() => useRecipes({ q: "" }, 0));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(() => result.current.loadMore());
    expect(result.current.error).toBeTruthy();
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it("exposes an error message on failure", async () => {
    mockedFetch.mockRejectedValue(new Error("boom"));
    const { result } = await renderHook(() => useRecipes({ q: "" }, 0));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isLoading).toBe(false);
  });

  it.each([
    ["clearRecipeStore", clearRecipeStore],
    ["clearSession", clearSession],
  ])("drops a page that resolves after %s", async (_name, clear) => {
    let resolve!: (v: ReturnType<typeof page>) => void;
    mockedFetch.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useRecipes({ q: "" }, 0));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    await act(async () => {
      await clear();
    });
    await act(async () => resolve(page([makeRecipe("old", { is_saved: true })])));
    expect(getCachedRecipe("old")).toBeUndefined();
    expect(result.current.items).toEqual([]);
  });
});
