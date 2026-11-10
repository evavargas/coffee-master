import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { useRecipeForm } from "@/hooks/useRecipeForm";
import { updateUserRecipe, type UserRecipe } from "@/lib/api/myRecipes";
import { clearSession } from "@/lib/session";
import { clearUserRecipeStore, getCachedUserRecipe, putUserRecipes } from "@/lib/userRecipeStore";
import { makeUserRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("@/lib/api/myRecipes", () => ({ ...jest.requireActual<typeof import("@/lib/api/myRecipes")>("@/lib/api/myRecipes"), updateUserRecipe: jest.fn() }));

describe("useRecipeForm", () => {
  beforeEach(() => {
    clearUserRecipeStore();
    jest.mocked(updateUserRecipe).mockReset();
  });

  it("a PUT resolving after a session change neither writes the store nor calls onSaved", async () => {
    let resolve!: (r: UserRecipe) => void;
    jest.mocked(updateUserRecipe).mockReturnValue(new Promise((r) => (resolve = r)));
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useRecipeForm(makeUserRecipe(1), onSaved));
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
    jest.mocked(updateUserRecipe).mockResolvedValue(null);
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useRecipeForm(makeUserRecipe(1), onSaved));
    await act(async () => result.current.onSubmit());
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.serverError).toBeNull();
  });
});
