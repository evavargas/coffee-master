import { act } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useForgotPasswordForm } from "@/hooks/useForgotPasswordForm";
import { requestPasswordReset } from "@/lib/api/auth";
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
  requestPasswordReset: vi.fn(),
}));

describe("useForgotPasswordForm", () => {
  beforeEach(() => {
    vi.mocked(requestPasswordReset).mockReset();
  });

  it("reaches the API and shows the backend's success message", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({
      message: "Si el email existe, te enviamos un link.",
    });

    const { result } = renderHookWithIntl(() => useForgotPasswordForm());

    act(() => {
      result.current.form.setValue("email", "ana@example.com");
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(requestPasswordReset).toHaveBeenCalledWith("ana@example.com");
    expect(result.current.successMessage).toBe("Si el email existe, te enviamos un link.");
    expect(result.current.serverError).toBeNull();
  });

  it("surfaces the backend's error message", async () => {
    vi.mocked(requestPasswordReset).mockRejectedValueOnce(backendError({ detail: "Demasiados pedidos, esperá un poco." }));

    const { result } = renderHookWithIntl(() => useForgotPasswordForm());

    act(() => {
      result.current.form.setValue("email", "ana@example.com");
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.serverError).toBe("Demasiados pedidos, esperá un poco.");
    expect(result.current.successMessage).toBeNull();
  });

  it("falls back to the translated message when there is no usable detail", async () => {
    vi.mocked(requestPasswordReset).mockRejectedValueOnce(new AxiosError("Network Error"));

    const { result } = renderHookWithIntl(() => useForgotPasswordForm());

    act(() => {
      result.current.form.setValue("email", "ana@example.com");
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.serverError).toBe(esMessages.auth.forgotPassword.errorFallback);
  });
});
