import { renderHook } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { useAuthGuard } from "@/hooks/useAuthGuard";

const mockReplace = jest.fn();
const router = { replace: (route: string) => mockReplace(route) };
let mockSession: { token: string | null; isReady: boolean };
let mockSegments: string[];

jest.mock("expo-router", () => ({ useRouter: () => router, useSegments: () => mockSegments }));
jest.mock("@/context/SessionContext", () => ({ useSessionContext: () => mockSession }));

describe("useAuthGuard", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSession = { token: null, isReady: true };
    mockSegments = ["(tabs)", "chat"];
  });

  it("redirects to login when unauthenticated inside the tabs", async () => {
    const { result } = await renderHook(() => useAuthGuard());
    expect(mockReplace).toHaveBeenCalledWith("/login");
    expect(result.current.isRedirecting).toBe(true);
  });

  it("redirects to login when the token drops to null while mounted (401)", async () => {
    mockSession = { token: "jwt", isReady: true };
    const { rerender } = await renderHook(() => useAuthGuard());
    expect(mockReplace).not.toHaveBeenCalled();
    mockSession = { token: null, isReady: true };
    await rerender({});
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("redirects to chat when authenticated inside the auth group", async () => {
    mockSession = { token: "jwt", isReady: true };
    mockSegments = ["(auth)", "login"];
    await renderHook(() => useAuthGuard());
    expect(mockReplace).toHaveBeenCalledWith("/chat");
  });

  it("does nothing until the session is ready", async () => {
    mockSession = { token: null, isReady: false };
    const { result } = await renderHook(() => useAuthGuard());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(result.current.isRedirecting).toBe(false);
  });

  it("does not loop once the group is correct", async () => {
    mockSegments = ["(auth)", "login"];
    const { rerender } = await renderHook(() => useAuthGuard());
    await rerender({});
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
