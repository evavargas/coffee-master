import { act } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useResendConfirmation } from "@/hooks/useResendConfirmation";
import { resendConfirmation } from "@/lib/api/auth";
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
  resendConfirmation: vi.fn(),
}));

describe("useResendConfirmation", () => {
  beforeEach(() => {
    vi.mocked(resendConfirmation).mockReset();
  });

  it("sends the email again and shows the backend's message", async () => {
    vi.mocked(resendConfirmation).mockResolvedValueOnce({ message: "Te reenviamos el mail de confirmación." });

    const { result } = renderHookWithIntl(() => useResendConfirmation("ana@example.com"));

    await act(async () => {
      await result.current.resend();
    });

    expect(resendConfirmation).toHaveBeenCalledWith("ana@example.com");
    expect(result.current.message).toBe("Te reenviamos el mail de confirmación.");
    expect(result.current.error).toBeNull();
    expect(result.current.isSending).toBe(false);
  });

  it("surfaces the backend's error message", async () => {
    vi.mocked(resendConfirmation).mockRejectedValueOnce(backendError({ detail: "Esa cuenta ya está confirmada." }));

    const { result } = renderHookWithIntl(() => useResendConfirmation("ana@example.com"));

    await act(async () => {
      await result.current.resend();
    });

    expect(result.current.error).toBe("Esa cuenta ya está confirmada.");
    expect(result.current.message).toBeNull();
  });

  it("falls back to the translated message when there is no usable detail", async () => {
    vi.mocked(resendConfirmation).mockRejectedValueOnce(new AxiosError("Network Error"));

    const { result } = renderHookWithIntl(() => useResendConfirmation("ana@example.com"));

    await act(async () => {
      await result.current.resend();
    });

    expect(result.current.error).toBe(esMessages.auth.register.resendErrorFallback);
  });
});
