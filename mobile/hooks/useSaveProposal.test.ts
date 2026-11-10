import { AxiosError } from "axios";
import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { useSaveProposal } from "@/hooks/useSaveProposal";
import es from "@/i18n/locales/es.json";
import { saveProposal } from "@/lib/api/myRecipes";
import { clearSession } from "@/lib/session";
import { clearUserRecipeStore, getCachedUserRecipe } from "@/lib/userRecipeStore";
import { makeUserRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("@/lib/api/myRecipes", () => ({ saveProposal: jest.fn() }));

const mSave = saveProposal as jest.MockedFunction<typeof saveProposal>;

function httpError(status: number) {
  return new AxiosError("x", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    data: {},
    headers: {},
    config: {} as never,
  });
}

describe("useSaveProposal", () => {
  beforeEach(async () => {
    await clearSession(); // also forgets saved proposals
    clearUserRecipeStore();
    mSave.mockReset();
  });

  it("posts once per press even on a double press, then reports saved and fills the store", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof saveProposal>>) => void;
    mSave.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useSaveProposal(5));

    await act(async () => {
      void result.current.save();
      void result.current.save();
    });
    expect(result.current.isPending).toBe(true);
    await act(async () => resolve({ id: 30, recipe: makeUserRecipe(30) }));

    expect(mSave).toHaveBeenCalledTimes(1);
    expect(mSave).toHaveBeenCalledWith(5);
    expect(result.current.savedId).toBe(30);
    expect(result.current.isPending).toBe(false);
    expect(getCachedUserRecipe(30)?.name).toBe("Mi receta 30");

    await act(async () => result.current.save());
    expect(mSave).toHaveBeenCalledTimes(1);
  });

  it("two cards of the same proposal share the in-flight guard", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof saveProposal>>) => void;
    mSave.mockReturnValue(new Promise((r) => (resolve = r)));
    const a = await renderHook(() => useSaveProposal(6));
    const b = await renderHook(() => useSaveProposal(6));
    await act(async () => {
      void a.result.current.save();
      void b.result.current.save();
    });
    expect(mSave).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ id: 1, recipe: null }));
  });

  it("renders a persisted saved_recipe_id as saved without any request", async () => {
    const { result } = await renderHook(() => useSaveProposal(5, 12));
    expect(result.current.savedId).toBe(12);
    await act(async () => result.current.save());
    expect(mSave).not.toHaveBeenCalled();
  });

  it("treats a body-less success as saved", async () => {
    mSave.mockResolvedValue({ id: 8, recipe: null });
    const { result } = await renderHook(() => useSaveProposal(5));
    await act(async () => result.current.save());
    expect(result.current.savedId).toBe(8);
  });

  it("shows the gone message on a 404 and allows another press", async () => {
    mSave.mockRejectedValueOnce(httpError(404));
    const { result } = await renderHook(() => useSaveProposal(5));
    await act(async () => result.current.save());
    expect(result.current.error).toBe(es.chat.proposal.gone);
    expect(result.current.savedId).toBeNull();

    mSave.mockResolvedValueOnce({ id: 2, recipe: null });
    await act(async () => result.current.save());
    expect(result.current.error).toBeNull();
    expect(result.current.savedId).toBe(2);
  });

  it("shows the generic error on other failures", async () => {
    mSave.mockRejectedValueOnce(new Error("boom"));
    const { result } = await renderHook(() => useSaveProposal(5));
    await act(async () => result.current.save());
    expect(result.current.error).toBe(es.chat.proposal.saveError);
  });

  it("ignores a response that arrives after a session change", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof saveProposal>>) => void;
    mSave.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useSaveProposal(5));
    await act(async () => {
      void result.current.save();
    });
    await act(async () => clearSession());
    await act(async () => resolve({ id: 30, recipe: makeUserRecipe(30) }));

    expect(result.current.savedId).toBeNull();
    expect(getCachedUserRecipe(30)).toBeUndefined();
  });
});
