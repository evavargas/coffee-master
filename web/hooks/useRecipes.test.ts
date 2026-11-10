import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRecipes } from "@/hooks/useRecipes";
import { fetchRecipes, type CatalogRecipe } from "@/lib/api/recipes";
import { clearRecipeStore, getCachedRecipe } from "@/lib/recipeStore";
import { clearSession } from "@/lib/session";
import { makeRecipe } from "@/test/recipeFixtures";
import { renderHookWithIntl } from "@/test/renderHookWithIntl";

vi.mock("@/lib/api/recipes", async (orig) => ({ ...(await orig<typeof import("@/lib/api/recipes")>()), fetchRecipes: vi.fn() }));

const page = (items: CatalogRecipe[], total = items.length, limit = 12, offset = 0) => ({ items, total, limit, offset });
const query = (extra = {}) => ({ q: "", method: undefined, limit: 12, offset: 0, ...extra });

describe("useRecipes", () => {
  beforeEach(() => {
    clearRecipeStore();
    vi.mocked(fetchRecipes).mockReset();
  });

  it("loads the list with a single request", async () => {
    vi.mocked(fetchRecipes).mockResolvedValue(page([makeRecipe("a")]));
    const { result } = renderHookWithIntl(() => useRecipes({ q: " " }, 0));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(fetchRecipes).toHaveBeenCalledTimes(1);
    expect(fetchRecipes).toHaveBeenCalledWith(query(), expect.any(AbortSignal));
    expect(result.current.hasMore).toBe(false);
  });

  it("shows the empty state data", async () => {
    vi.mocked(fetchRecipes).mockResolvedValue(page([]));
    const { result } = renderHookWithIntl(() => useRecipes({ q: "" }, 0));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("sends q and method, resetting the list", async () => {
    vi.mocked(fetchRecipes).mockResolvedValue(page([makeRecipe("a")]));
    const { result, rerender } = renderHookWithIntl((p: { q: string; method?: "moka" }) => useRecipes(p, 0), {
      initialProps: { q: "" } as { q: string; method?: "moka" },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    rerender({ q: " etiopia ", method: "moka" });
    await waitFor(() => expect(fetchRecipes).toHaveBeenLastCalledWith(query({ q: "etiopia", method: "moka" }), expect.any(AbortSignal)));
  });

  it("debounces typing into one request", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetchRecipes).mockResolvedValue(page([]));
      const { rerender } = renderHookWithIntl((p: { q: string }) => useRecipes(p, 300), { initialProps: { q: "" } });
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(fetchRecipes).toHaveBeenCalledTimes(1);
      rerender({ q: "e" });
      await act(() => vi.advanceTimersByTimeAsync(100));
      rerender({ q: "et" });
      await act(() => vi.advanceTimersByTimeAsync(299));
      expect(fetchRecipes).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(fetchRecipes).toHaveBeenCalledTimes(2);
      expect(fetchRecipes).toHaveBeenLastCalledWith(query({ q: "et" }), expect.any(AbortSignal));
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores an out-of-order response and aborts the superseded request", async () => {
    let resolveOld!: (v: ReturnType<typeof page>) => void;
    const signals: AbortSignal[] = [];
    vi.mocked(fetchRecipes).mockImplementation((q, signal) => {
      signals.push(signal as AbortSignal);
      return q.q === "old" ? new Promise((r) => (resolveOld = r)) : Promise.resolve(page([makeRecipe("new")]));
    });
    const { result, rerender } = renderHookWithIntl((p: { q: string }) => useRecipes(p, 0), { initialProps: { q: "old" } });
    await waitFor(() => expect(fetchRecipes).toHaveBeenCalledTimes(1));
    rerender({ q: "new" });
    await waitFor(() => expect(result.current.items.map((r) => r.slug)).toEqual(["new"]));
    expect(signals[0].aborted).toBe(true);
    await act(async () => resolveOld(page([makeRecipe("old")])));
    expect(result.current.items.map((r) => r.slug)).toEqual(["new"]);
    expect(result.current.isLoading).toBe(false);
  });

  it("paginates with the next offset, appends and dedupes", async () => {
    vi.mocked(fetchRecipes)
      .mockResolvedValueOnce(page([makeRecipe("a")], 3, 1, 0))
      .mockResolvedValueOnce(page([makeRecipe("a"), makeRecipe("b")], 3, 1, 1));
    const { result } = renderHookWithIntl(() => useRecipes({ q: "" }, 0));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(() => result.current.loadMore());
    expect(fetchRecipes).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }), expect.any(AbortSignal));
    expect(result.current.items.map((r) => r.slug)).toEqual(["a", "b"]);
  });

  it("a failed loadMore keeps the loaded rows and the same offset", async () => {
    vi.mocked(fetchRecipes).mockResolvedValueOnce(page([makeRecipe("a")], 2, 1, 0)).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHookWithIntl(() => useRecipes({ q: "" }, 0));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(() => result.current.loadMore());
    expect(result.current.error).toBeTruthy();
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it("exposes an error message on failure", async () => {
    vi.mocked(fetchRecipes).mockRejectedValue(new Error("boom"));
    const { result } = renderHookWithIntl(() => useRecipes({ q: "" }, 0));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isLoading).toBe(false);
  });

  it.each([
    ["clearRecipeStore", clearRecipeStore],
    ["clearSession", clearSession],
  ])("drops a page that resolves after %s", async (_name, clear) => {
    let resolve!: (v: ReturnType<typeof page>) => void;
    vi.mocked(fetchRecipes).mockImplementation(() => new Promise((r) => (resolve = r)));
    const { result } = renderHookWithIntl(() => useRecipes({ q: "" }, 0));
    await waitFor(() => expect(fetchRecipes).toHaveBeenCalled());
    clear();
    await act(async () => resolve(page([makeRecipe("old", { is_saved: true })])));
    expect(getCachedRecipe("old")).toBeUndefined();
    expect(result.current.items).toEqual([]);
  });
});
