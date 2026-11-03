import { act } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useLoginForm } from "@/hooks/useLoginForm";
import { login } from "@/lib/api/auth";
import { clearSession, getToken } from "@/lib/session";
import esMessages from "@/messages/es.json";

/** Builds a real AxiosError carrying a backend-shaped response body, so `axios.isAxiosError` holds. */
function backendError(data: unknown): AxiosError {
  return new AxiosError("Request failed", "400", undefined, undefined, {
    status: 400,
    statusText: "Bad Request",
    headers: {},
    config: {} as never,
    data,
  } as unknown as AxiosResponse);
}

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/api/auth", () => ({
  login: vi.fn(),
}));

describe("useLoginForm", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(login).mockReset();
    clearSession();
  });

  afterEach(() => {
    clearSession();
  });

  it("saves the token and redirects to /chat on success", async () => {
    vi.mocked(login).mockResolvedValueOnce({
      access_token: "token-123",
      token_type: "bearer",
      expires_in: 604_800,
    });

    const { result } = renderHookWithIntl(() => useLoginForm());

    act(() => {
      result.current.form.setValue("email", "ana@example.com");
      result.current.form.setValue("password", "supersecret");
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(login).toHaveBeenCalledWith({ email: "ana@example.com", password: "supersecret" });
    expect(getToken()).toBe("token-123");
    expect(replace).toHaveBeenCalledWith("/chat");
    expect(result.current.serverError).toBeNull();
  });

  it("surfaces the backend's error message", async () => {
    vi.mocked(login).mockRejectedValueOnce(backendError({ detail: "Credenciales inválidas." }));

    const { result } = renderHookWithIntl(() => useLoginForm());

    act(() => {
      result.current.form.setValue("email", "ana@example.com");
      result.current.form.setValue("password", "wrongpass");
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.serverError).toBe("Credenciales inválidas.");
    expect(replace).not.toHaveBeenCalled();
    expect(getToken()).toBeNull();
  });

  it("falls back to the translated message when there is no usable detail", async () => {
    vi.mocked(login).mockRejectedValueOnce(new AxiosError("Network Error"));

    const { result } = renderHookWithIntl(() => useLoginForm());

    act(() => {
      result.current.form.setValue("email", "ana@example.com");
      result.current.form.setValue("password", "supersecret");
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.serverError).toBe(esMessages.auth.login.errorFallback);
  });
});
