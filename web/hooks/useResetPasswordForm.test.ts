import { act } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useResetPasswordForm } from "@/hooks/useResetPasswordForm";
import { resetPassword } from "@/lib/api/auth";
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
  resetPassword: vi.fn(),
}));

async function submit(result: ReturnType<typeof useResetPasswordForm>) {
  act(() => {
    result.form.setValue("password", "newsupersecret");
    result.form.setValue("confirmPassword", "newsupersecret");
  });
  await act(async () => {
    await result.onSubmit();
  });
}

describe("useResetPasswordForm", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(resetPassword).mockReset();
  });

  afterEach(() => {
    vi.mocked(resetPassword).mockReset();
  });

  it("reaches the API with the reset token and redirects to /login on success", async () => {
    vi.mocked(resetPassword).mockResolvedValueOnce({ message: "Tu contraseña se cambió." });

    const { result } = renderHookWithIntl(() => useResetPasswordForm("short-lived-reset-token"));
    await submit(result.current);

    expect(resetPassword).toHaveBeenCalledWith({
      resetToken: "short-lived-reset-token",
      newPassword: "newsupersecret",
    });
    expect(result.current.successMessage).toBe("Tu contraseña se cambió.");
    expect(result.current.serverError).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  // The case this effort was partly about: the backend's exact message for an expired or
  // already-used reset token (see backend/app/api/routes/auth.py's reset-password route).
  it("surfaces the backend's expired/invalid reset-token message", async () => {
    vi.mocked(resetPassword).mockRejectedValueOnce(
      backendError({ detail: "El código para cambiar la contraseña no es válido o venció." }),
    );

    const { result } = renderHookWithIntl(() => useResetPasswordForm("expired-reset-token"));
    await submit(result.current);

    expect(result.current.serverError).toBe("El código para cambiar la contraseña no es válido o venció.");
    expect(result.current.successMessage).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("falls back to the translated message when there is no usable detail", async () => {
    vi.mocked(resetPassword).mockRejectedValueOnce(new AxiosError("Network Error"));

    const { result } = renderHookWithIntl(() => useResetPasswordForm("some-reset-token"));
    await submit(result.current);

    expect(result.current.serverError).toBe(esMessages.auth.resetPassword.errorFallback);
  });
});
