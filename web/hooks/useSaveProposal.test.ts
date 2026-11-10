import { act } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSaveProposal } from "@/hooks/useSaveProposal";
import { saveProposal } from "@/lib/api/myRecipes";
import { clearSession } from "@/lib/session";
import { clearUserRecipeStore, getCachedUserRecipe } from "@/lib/userRecipeStore";
import { makeUserRecipe } from "@/test/recipeFixtures";
import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import es from "@/messages/es.json";

vi.mock("@/lib/api/myRecipes", async (orig) => ({ ...(await orig<typeof import("@/lib/api/myRecipes")>()), saveProposal: vi.fn() }));

const httpError = (status: number) => new AxiosError("x", String(status), undefined, undefined, { status, data: {} } as AxiosResponse);

describe("useSaveProposal", () => {
  beforeEach(() => {
    clearUserRecipeStore();
    vi.mocked(saveProposal).mockReset();
  });

  it("posts once on a double click, then shows the saved state and fills the My recipes store", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof saveProposal>>) => void;
    vi.mocked(saveProposal).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHookWithIntl(() => useSaveProposal(5));

    await act(async () => {
      void result.current.save();
      void result.current.save();
    });
    expect(result.current.isPending).toBe(true);
    await act(async () => resolve({ id: 12, recipe: makeUserRecipe(12) }));

    expect(saveProposal).toHaveBeenCalledTimes(1);
    expect(saveProposal).toHaveBeenCalledWith(5);
    expect(result.current.savedId).toBe(12);
    expect(getCachedUserRecipe(12)?.id).toBe(12);

    await act(async () => result.current.save());
    expect(saveProposal).toHaveBeenCalledTimes(1);
  });

  it("starts saved when the server says so and never posts", async () => {
    const { result } = renderHookWithIntl(() => useSaveProposal(5, 9));
    await act(async () => result.current.save());
    expect(result.current.savedId).toBe(9);
    expect(saveProposal).not.toHaveBeenCalled();
  });

  it("maps a 404 to the vanished-proposal message and allows retrying other errors", async () => {
    vi.mocked(saveProposal).mockRejectedValueOnce(httpError(404));
    const { result } = renderHookWithIntl(() => useSaveProposal(5));
    await act(async () => result.current.save());
    expect(result.current.error).toBe(es.chat.proposal.gone);
    expect(result.current.savedId).toBeNull();
    expect(result.current.isPending).toBe(false);

    vi.mocked(saveProposal).mockRejectedValueOnce(httpError(422));
    await act(async () => result.current.save());
    expect(result.current.error).toBe(es.chat.proposal.saveError);
  });

  it("ignores a response that arrives after a session change", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof saveProposal>>) => void;
    vi.mocked(saveProposal).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHookWithIntl(() => useSaveProposal(5));
    await act(async () => void result.current.save());
    act(() => clearSession());
    await act(async () => resolve({ id: 12, recipe: makeUserRecipe(12) }));
    expect(result.current.savedId).toBeNull();
    expect(getCachedUserRecipe(12)).toBeUndefined();
  });
});
