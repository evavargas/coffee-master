import { act } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useVerifyResetCode } from "@/hooks/useVerifyResetCode";
import { requestPasswordReset, verifyResetCode } from "@/lib/api/auth";
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

vi.mock("@/lib/api/auth", () => ({
  verifyResetCode: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

describe("useVerifyResetCode", () => {
  beforeEach(() => {
    vi.mocked(verifyResetCode).mockReset();
    vi.mocked(requestPasswordReset).mockReset();
  });

  it("verifies the code and hands the reset token to onVerified", async () => {
    vi.mocked(verifyResetCode).mockResolvedValueOnce({ reset_token: "short-lived-jwt" });
    const onVerified = vi.fn();

    const { result } = renderHookWithIntl(() => useVerifyResetCode({ email: "ana@example.com", onVerified }));

    act(() => {
      result.current.form.setValue("code", "654321");
    });
    await act(async () => {
      await result.current.onSubmit();
    });

    expect(verifyResetCode).toHaveBeenCalledWith({ email: "ana@example.com", code: "654321" });
    expect(onVerified).toHaveBeenCalledWith("short-lived-jwt");
    expect(result.current.serverError).toBeNull();
  });

  it("surfaces the backend's expired/invalid code message without calling onVerified", async () => {
    vi.mocked(verifyResetCode).mockRejectedValueOnce(backendError({ detail: "El código no es válido o venció." }));
    const onVerified = vi.fn();

    const { result } = renderHookWithIntl(() => useVerifyResetCode({ email: "ana@example.com", onVerified }));

    act(() => {
      result.current.form.setValue("code", "000000");
    });
    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.serverError).toBe("El código no es válido o venció.");
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("falls back to the translated message when verifying with no usable detail", async () => {
    vi.mocked(verifyResetCode).mockRejectedValueOnce(new AxiosError("Network Error"));
    const onVerified = vi.fn();

    const { result } = renderHookWithIntl(() => useVerifyResetCode({ email: "ana@example.com", onVerified }));

    act(() => {
      result.current.form.setValue("code", "000000");
    });
    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.serverError).toBe(esMessages.auth.resetPassword.verifyErrorFallback);
  });

  it("resends the code and shows the backend's message", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({ message: "Te reenviamos el código." });
    const onVerified = vi.fn();

    const { result } = renderHookWithIntl(() => useVerifyResetCode({ email: "ana@example.com", onVerified }));

    await act(async () => {
      await result.current.resendCode();
    });

    expect(requestPasswordReset).toHaveBeenCalledWith("ana@example.com");
    expect(result.current.resendMessage).toBe("Te reenviamos el código.");
    expect(result.current.resendError).toBeNull();
  });

  it("surfaces the backend's error message when the resend fails", async () => {
    vi.mocked(requestPasswordReset).mockRejectedValueOnce(backendError({ detail: "Demasiados pedidos, esperá un poco." }));
    const onVerified = vi.fn();

    const { result } = renderHookWithIntl(() => useVerifyResetCode({ email: "ana@example.com", onVerified }));

    await act(async () => {
      await result.current.resendCode();
    });

    expect(result.current.resendError).toBe("Demasiados pedidos, esperá un poco.");
    expect(result.current.resendMessage).toBeNull();
  });
});
