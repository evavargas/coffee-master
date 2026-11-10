import { createElement, type ReactNode } from "react";
import { AxiosError } from "axios";
import { act, renderHook } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { SessionProvider } from "@/context/SessionContext";
import { useSession } from "@/hooks/useSession";
import { useSignOut } from "@/hooks/useSignOut";
import { apiClient } from "@/lib/api/client";
import { getCachedRecipe, putRecipes } from "@/lib/recipeStore";
import { makeRecipe } from "@/test/recipeFixtures";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

type Handlers = { handlers: { rejected: (e: unknown) => Promise<never> }[] };

describe("recipe store and the session", () => {
  it("the 401 handler (useSession) clears the store", async () => {
    putRecipes([makeRecipe("a", { is_saved: true })]);
    await renderHook(() => useSession());
    const { rejected } = (apiClient.interceptors.response as unknown as Handlers).handlers[0];
    await act(async () => {
      await rejected(new AxiosError("x", "401", undefined, undefined, { status: 401 } as never)).catch(() => undefined);
    });
    expect(getCachedRecipe("a")).toBeUndefined();
  });

  it("useSignOut clears the store so the next user starts clean", async () => {
    putRecipes([makeRecipe("a", { is_saved: true })]);
    const wrapper = ({ children }: { children: ReactNode }) => createElement(SessionProvider, null, children);
    const { result } = await renderHook(() => useSignOut(), { wrapper });
    await act(async () => {
      await result.current();
    });
    expect(getCachedRecipe("a")).toBeUndefined();
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
