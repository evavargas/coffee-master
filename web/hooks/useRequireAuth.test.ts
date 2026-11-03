import { renderHook, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRequireAuth } from "@/hooks/useRequireAuth";
import { fetchCurrentUser } from "@/lib/api/auth";
import { clearSession, saveToken } from "@/lib/session";

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

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/api/auth", () => ({
  fetchCurrentUser: vi.fn(),
}));

describe("useRequireAuth", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(fetchCurrentUser).mockReset();
    clearSession();
  });

  afterEach(() => {
    clearSession();
  });

  it("redirects to /login when there is no valid session", async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValueOnce(backendError(401));
    saveToken("expired-token");

    const { result } = renderHook(() => useRequireAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("does not redirect once the current user loads successfully", async () => {
    saveToken("token-123");
    vi.mocked(fetchCurrentUser).mockResolvedValueOnce({ id: 1, name: "Ana", email: "ana@example.com" });

    const { result } = renderHook(() => useRequireAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual({ id: 1, name: "Ana", email: "ana@example.com" });
    expect(replace).not.toHaveBeenCalled();
  });
});
