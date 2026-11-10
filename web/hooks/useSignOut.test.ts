import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSignOut } from "@/hooks/useSignOut";
import { getCachedRecipe, putRecipes } from "@/lib/recipeStore";
import { makeRecipe } from "@/test/recipeFixtures";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

describe("useSignOut", () => {
  it("clears the recipe cache so the next user starts clean", () => {
    putRecipes([makeRecipe("a", { is_saved: true })]);
    renderHook(() => useSignOut()).result.current();
    expect(getCachedRecipe("a")).toBeUndefined();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
