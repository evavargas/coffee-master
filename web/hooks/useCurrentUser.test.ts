import { renderHook, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { fetchCurrentUser } from "@/lib/api/auth";
import { clearSession, getToken, saveToken } from "@/lib/session";

/** Builds a real AxiosError carrying a backend-shaped response body, so `axios.isAxiosError` holds. */
function backendError(status: number): AxiosError {
  return new AxiosError("Request failed", String(status), undefined, undefined, {
    status,
    statusText: "Error",
    headers: {},
    config: {} as never,
    data: {},
  } as unknown as AxiosResponse);
}

vi.mock("@/lib/api/auth", () => ({
  fetchCurrentUser: vi.fn(),
}));

describe("useCurrentUser", () => {
  beforeEach(() => {
    vi.mocked(fetchCurrentUser).mockReset();
    clearSession();
  });

  afterEach(() => {
    clearSession();
  });

  it("returns null without calling the API when there is no session token", async () => {
    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchCurrentUser).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });

  it("loads the current user when there is a valid session token", async () => {
    saveToken("token-123");
    vi.mocked(fetchCurrentUser).mockResolvedValueOnce({ id: 1, name: "Ana", email: "ana@example.com" });

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual({ id: 1, name: "Ana", email: "ana@example.com" });
  });

  it("clears the session and returns null when fetching the current user fails", async () => {
    saveToken("expired-token");
    vi.mocked(fetchCurrentUser).mockRejectedValueOnce(backendError(401));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(getToken()).toBeNull();
  });
});
