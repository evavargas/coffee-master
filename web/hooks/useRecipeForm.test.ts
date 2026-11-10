import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRecipeForm } from "@/hooks/useRecipeForm";
import { updateUserRecipe, type UserRecipe } from "@/lib/api/myRecipes";
import { clearSession } from "@/lib/session";
import { clearUserRecipeStore, getCachedUserRecipe, putUserRecipes } from "@/lib/userRecipeStore";
import { makeUserRecipe } from "@/test/recipeFixtures";
import { renderHookWithIntl } from "@/test/renderHookWithIntl";

vi.mock("@/lib/api/myRecipes", async (orig) => ({ ...(await orig<typeof import("@/lib/api/myRecipes")>()), updateUserRecipe: vi.fn() }));

describe("useRecipeForm", () => {
  beforeEach(() => {
    clearUserRecipeStore();
    vi.mocked(updateUserRecipe).mockReset();
  });

  it("a PUT resolving after a session change neither writes the store nor calls onSaved", async () => {
    let resolve!: (r: UserRecipe) => void;
    vi.mocked(updateUserRecipe).mockReturnValue(new Promise((r) => (resolve = r)));
    const onSaved = vi.fn();
    const { result } = renderHookWithIntl(() => useRecipeForm(makeUserRecipe(1), onSaved));
    let submit!: Promise<void>;
    await act(async () => void (submit = result.current.onSubmit()));
    await act(async () => clearSession());
    await act(async () => {
      resolve(makeUserRecipe(1, { name: "late" }));
      await submit;
    });
    expect(getCachedUserRecipe(1)).toBeUndefined();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("a malformed body after a successful PUT still counts as saved", async () => {
    putUserRecipes([makeUserRecipe(1)]);
    vi.mocked(updateUserRecipe).mockResolvedValue(null);
    const onSaved = vi.fn();
    const { result } = renderHookWithIntl(() => useRecipeForm(makeUserRecipe(1), onSaved));
    await act(async () => result.current.onSubmit());
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.serverError).toBeNull();
  });
});
