import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import * as SecureStore from "expo-secure-store";

import "@/i18n";
import { useRecipeLibrary } from "@/hooks/useRecipeLibrary";
import { createRecipeConversation, removeRecipe, saveRecipe, setRecipeFavorite } from "@/lib/api/recipes";
import { clearRecipeStore, getCachedRecipe, putRecipes } from "@/lib/recipeStore";
import { clearSession, saveToken } from "@/lib/session";
import { makeRecipe } from "@/test/recipeFixtures";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("@/lib/api/recipes", () => ({
  saveRecipe: jest.fn(),
  removeRecipe: jest.fn(),
  setRecipeFavorite: jest.fn(),
  createRecipeConversation: jest.fn(),
}));

const mSave = saveRecipe as jest.MockedFunction<typeof saveRecipe>;
const mRemove = removeRecipe as jest.MockedFunction<typeof removeRecipe>;
const mFav = setRecipeFavorite as jest.MockedFunction<typeof setRecipeFavorite>;
const mConv = createRecipeConversation as jest.MockedFunction<typeof createRecipeConversation>;
const entry = { slug: "a", is_saved: true, is_favorite: true } as Awaited<ReturnType<typeof setRecipeFavorite>>;

describe("useRecipeLibrary", () => {
  beforeEach(() => {
    clearRecipeStore();
    putRecipes([makeRecipe("a")]);
    mockPush.mockReset();
    mSave.mockReset().mockResolvedValue(undefined);
    mRemove.mockReset().mockResolvedValue(undefined);
    mFav.mockReset().mockResolvedValue(entry);
    mConv.mockReset().mockResolvedValue(7);
  });

  it("save updates the cached recipe", async () => {
    const { result } = await renderHook(() => useRecipeLibrary("a"));
    await act(() => result.current.save());
    expect(mSave).toHaveBeenCalledWith("a");
    expect(getCachedRecipe("a")?.is_saved).toBe(true);
  });

  it("remove clears saved and favorite", async () => {
    putRecipes([makeRecipe("a", { is_saved: true, is_favorite: true })]);
    const { result } = await renderHook(() => useRecipeLibrary("a"));
    await act(() => result.current.remove());
    expect(getCachedRecipe("a")).toMatchObject({ is_saved: false, is_favorite: false });
  });

  it("favorite toggle updates the cache", async () => {
    const { result } = await renderHook(() => useRecipeLibrary("a"));
    await act(() => result.current.toggleFavorite());
    expect(mFav).toHaveBeenCalledWith("a", true);
    expect(getCachedRecipe("a")).toMatchObject({ is_favorite: true, is_saved: true });
  });

  it("rolls back and reports an error when the request fails", async () => {
    mFav.mockRejectedValue(new Error("boom"));
    const onError = jest.fn();
    const { result } = await renderHook(() => useRecipeLibrary("a", onError));
    await act(() => result.current.toggleFavorite());
    expect(getCachedRecipe("a")).toMatchObject({ is_favorite: false, is_saved: false });
    expect(result.current.error).toBeTruthy();
    expect(onError).toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
  });

  it("ask and adapt create a catalog conversation and navigate to the chat with the intent", async () => {
    const { result } = await renderHook(() => useRecipeLibrary("a"));
    await act(() => result.current.ask());
    expect(mConv).toHaveBeenCalledWith("a");
    expect(mockPush).toHaveBeenLastCalledWith("/(tabs)/chat?c=7&intent=ask");
    await act(() => result.current.adapt());
    expect(mockPush).toHaveBeenLastCalledWith("/(tabs)/chat?c=7&intent=adapt");
    expect(result.current.isPending).toBe(false);
  });

  it("shows an error and stays when the conversation cannot be created", async () => {
    mConv.mockRejectedValue(new Error("boom"));
    const { result } = await renderHook(() => useRecipeLibrary("a"));
    await act(() => result.current.ask());
    expect(mockPush).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
    expect(result.current.isPending).toBe(false);
  });

  it("ignores a second toggle while one is in flight (also across hook instances)", async () => {
    let finish!: () => void;
    mFav.mockImplementation(() => new Promise((r) => (finish = () => r(entry))));
    const { result } = await renderHook(() => useRecipeLibrary("a"));
    const other = await renderHook(() => useRecipeLibrary("a"));
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.toggleFavorite();
      void result.current.toggleFavorite();
      void other.result.current.toggleFavorite();
    });
    expect(mFav).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await first;
    });
    expect(getCachedRecipe("a")?.is_favorite).toBe(true);
  });

  it("a refetch during a mutation does not overwrite the optimistic state", async () => {
    let finish!: () => void;
    mSave.mockImplementation(() => new Promise<void>((r) => (finish = r)));
    const { result } = await renderHook(() => useRecipeLibrary("a"));
    let p!: Promise<void>;
    await act(async () => {
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
    mSave.mockRejectedValue(new Error("boom"));
    const { result } = await renderHook(() => useRecipeLibrary("a"));
    await act(() => result.current.save());
    expect(getCachedRecipe("a")).toMatchObject({ is_saved: false, is_favorite: false });
    expect(result.current.error).toBeTruthy();
  });

  it("rolls back remove on error and unlocks for a retry", async () => {
    putRecipes([makeRecipe("a", { is_saved: true, is_favorite: true })]);
    mRemove.mockRejectedValueOnce(new Error("boom"));
    const { result } = await renderHook(() => useRecipeLibrary("a"));
    await act(() => result.current.remove());
    expect(getCachedRecipe("a")).toMatchObject({ is_saved: true, is_favorite: true });
    await act(() => result.current.remove());
    expect(getCachedRecipe("a")).toMatchObject({ is_saved: false, is_favorite: false });
  });

  it("a late response after the session ended does not roll back or unlock the new store", async () => {
    let fail!: (e: Error) => void;
    mSave.mockImplementation(() => new Promise<void>((_, rej) => (fail = rej)));
    const { result } = await renderHook(() => useRecipeLibrary("a"));
    let p!: Promise<void>;
    await act(async () => {
      p = result.current.save();
    });
    await act(async () => {
      await clearSession();
    });
    putRecipes([makeRecipe("a", { is_saved: true })]);
    await act(async () => {
      fail(new Error("boom"));
      await p;
    });
    expect(getCachedRecipe("a")?.is_saved).toBe(true);
  });

  it("still clears the store when the secure store throws on sign-out", async () => {
    (SecureStore.deleteItemAsync as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(new Error("keychain"));
    await expect(clearSession()).rejects.toThrow("keychain");
    expect(getCachedRecipe("a")).toBeUndefined();
  });

  it("a user switch does not show the previous user's flags", async () => {
    putRecipes([makeRecipe("a", { is_saved: true, is_favorite: true })]);
    await saveToken("new-user");
    expect(getCachedRecipe("a")).toBeUndefined();
  });
});
