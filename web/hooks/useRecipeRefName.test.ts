import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRecipeRefName } from "@/hooks/useRecipeRefName";
import { fetchRecipe } from "@/lib/api/recipes";
import { clearRecipeStore } from "@/lib/recipeStore";
import { clearSession } from "@/lib/session";
import { makeRecipe } from "@/test/recipeFixtures";
import { renderHookWithIntl } from "@/test/renderHookWithIntl";

vi.mock("@/lib/api/recipes", async (orig) => ({ ...(await orig<typeof import("@/lib/api/recipes")>()), fetchRecipe: vi.fn() }));

const ref = { kind: "catalog" as const, ref: "a" };

describe("useRecipeRefName", () => {
  afterEach(cleanup);
  beforeEach(() => {
    clearRecipeStore();
    vi.mocked(fetchRecipe).mockReset().mockResolvedValue(makeRecipe("a", { name: "Nombre A" }));
  });

  it("dedupes concurrent fetches of the same recipe across hook instances", async () => {
    const one = renderHookWithIntl(() => useRecipeRefName(ref));
    const two = renderHookWithIntl(() => useRecipeRefName(ref));
    await waitFor(() => expect(one.result.current.name).toBe("Nombre A"));
    await waitFor(() => expect(two.result.current.name).toBe("Nombre A"));
    expect(fetchRecipe).toHaveBeenCalledTimes(1);
  });

  it("refetches when the cache is cleared while mounted", async () => {
    const { result } = renderHookWithIntl(() => useRecipeRefName(ref));
    await waitFor(() => expect(result.current.name).toBe("Nombre A"));
    act(() => clearSession());
    await waitFor(() => expect(fetchRecipe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.name).toBe("Nombre A"));
  });

  it("reports failed when the fetch fails", async () => {
    vi.mocked(fetchRecipe).mockRejectedValue(new Error("x"));
    const { result } = renderHookWithIntl(() => useRecipeRefName(ref));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.name).toBeNull();
  });
});
