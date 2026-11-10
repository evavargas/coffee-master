import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { useRecipeRefName } from "@/hooks/useRecipeRefName";
import { fetchUserRecipe } from "@/lib/api/myRecipes";
import { fetchRecipe } from "@/lib/api/recipes";
import { clearRecipeStore, putRecipes } from "@/lib/recipeStore";
import { clearSession } from "@/lib/session";
import { clearUserRecipeStore } from "@/lib/userRecipeStore";
import { makeRecipe, makeUserRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("@/lib/api/myRecipes", () => ({ fetchUserRecipe: jest.fn() }));
jest.mock("@/lib/api/recipes", () => ({ fetchRecipe: jest.fn() }));

const mCatalog = fetchRecipe as jest.MockedFunction<typeof fetchRecipe>;
const mUser = fetchUserRecipe as jest.MockedFunction<typeof fetchUserRecipe>;

describe("useRecipeRefName", () => {
  beforeEach(() => {
    clearRecipeStore();
    clearUserRecipeStore();
    mCatalog.mockReset();
    mUser.mockReset();
  });

  it("uses the cache without fetching", async () => {
    putRecipes([makeRecipe("a")]);
    const { result } = await renderHook(() => useRecipeRefName({ kind: "catalog", ref: "a" }));
    expect(result.current.name).toBe("Receta a");
    expect(mCatalog).not.toHaveBeenCalled();
  });

  it("fetches a catalog and a user recipe name", async () => {
    mCatalog.mockResolvedValue(makeRecipe("a"));
    mUser.mockResolvedValue(makeUserRecipe(3));
    const c = await renderHook(() => useRecipeRefName({ kind: "catalog", ref: "a" }));
    const u = await renderHook(() => useRecipeRefName({ kind: "user", ref: 3 }));
    await waitFor(() => expect(c.result.current.name).toBe("Receta a"));
    await waitFor(() => expect(u.result.current.name).toBe("Mi receta 3"));
  });

  it("shares one request between consumers of the same ref", async () => {
    mCatalog.mockResolvedValue(makeRecipe("a"));
    await renderHook(() => useRecipeRefName({ kind: "catalog", ref: "a" }));
    await renderHook(() => useRecipeRefName({ kind: "catalog", ref: "a" }));
    await waitFor(() => expect(mCatalog).toHaveBeenCalledTimes(1));
  });

  it("reports failed when the name cannot be resolved", async () => {
    mCatalog.mockRejectedValue(new Error("nope"));
    const { result } = await renderHook(() => useRecipeRefName({ kind: "catalog", ref: "gone" }));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.name).toBeNull();
  });

  it("does nothing without a ref", async () => {
    const { result } = await renderHook(() => useRecipeRefName(null));
    expect(result.current).toEqual({ name: null, failed: false });
  });

  it("a response of the previous user never fills the cache", async () => {
    let resolveOld!: (r: ReturnType<typeof makeRecipe>) => void;
    mCatalog.mockReturnValueOnce(new Promise((r) => (resolveOld = r)));
    const { result } = await renderHook(() => useRecipeRefName({ kind: "catalog", ref: "a" }));
    await act(async () => clearSession());
    await act(async () => resolveOld(makeRecipe("a", { name: "Viejo usuario" })));
    expect(result.current.name).toBeNull();
  });

  it("refetches when the cache is cleared while the consumer is mounted", async () => {
    mCatalog.mockResolvedValueOnce(makeRecipe("a"));
    const { result } = await renderHook(() => useRecipeRefName({ kind: "catalog", ref: "a" }));
    await waitFor(() => expect(result.current.name).toBe("Receta a"));
    mCatalog.mockResolvedValueOnce(makeRecipe("a", { name: "Nuevo usuario" }));
    await act(async () => clearSession());
    await waitFor(() => expect(result.current.name).toBe("Nuevo usuario"));
  });

  it("clears the dedupe map on a session change so a new user gets its own request", async () => {
    mCatalog.mockResolvedValue(makeRecipe("a"));
    const first = await renderHook(() => useRecipeRefName({ kind: "catalog", ref: "a" }));
    await waitFor(() => expect(first.result.current.name).toBe("Receta a"));
    await act(async () => clearSession());
    await waitFor(() => expect(mCatalog).toHaveBeenCalledTimes(2));
  });
});
