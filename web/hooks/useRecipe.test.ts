import { act, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRecipe } from "@/hooks/useRecipe";
import { fetchRecipe } from "@/lib/api/recipes";
import { clearRecipeStore, getCachedRecipe } from "@/lib/recipeStore";
import { clearSession } from "@/lib/session";
import { makeRecipe } from "@/test/recipeFixtures";
import { renderHookWithIntl } from "@/test/renderHookWithIntl";

vi.mock("@/lib/api/recipes", () => ({ fetchRecipe: vi.fn() }));

describe("useRecipe", () => {
  beforeEach(() => {
    clearRecipeStore();
    vi.mocked(fetchRecipe).mockReset();
  });

  it("loads a recipe", async () => {
    vi.mocked(fetchRecipe).mockResolvedValue(makeRecipe("a"));
    const { result } = renderHookWithIntl(() => useRecipe("a"));
    await waitFor(() => expect(result.current.recipe?.slug).toBe("a"));
  });

  it("flags a 404", async () => {
    vi.mocked(fetchRecipe).mockRejectedValue(
      new AxiosError("x", "404", undefined, undefined, { status: 404, data: {} } as unknown as AxiosResponse),
    );
    const { result } = renderHookWithIntl(() => useRecipe("zzz"));
    await waitFor(() => expect(result.current.notFound).toBe(true));
  });

  it.each([
    ["clearRecipeStore", clearRecipeStore],
    ["clearSession", clearSession],
  ])("drops a recipe that resolves after %s", async (_name, clear) => {
    let resolve!: (v: ReturnType<typeof makeRecipe>) => void;
    vi.mocked(fetchRecipe).mockImplementation(() => new Promise((r) => (resolve = r)));
    const { result } = renderHookWithIntl(() => useRecipe("a"));
    await waitFor(() => expect(fetchRecipe).toHaveBeenCalled());
    clear();
    await act(async () => resolve(makeRecipe("a", { is_saved: true })));
    expect(getCachedRecipe("a")).toBeUndefined();
    expect(result.current.recipe).toBeNull();
  });
});
