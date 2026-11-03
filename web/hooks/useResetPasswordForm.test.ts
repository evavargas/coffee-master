import { act } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.mocked(resetPassword).mockReset();
  });

  it("reaches the API with the token and shows the backend's success message", async () => {
    vi.mocked(resetPassword).mockResolvedValueOnce({ message: "Tu contraseña se cambió." });

    const { result } = renderHookWithIntl(() => useResetPasswordForm("valid-token"));
    await submit(result.current);

    expect(resetPassword).toHaveBeenCalledWith({ token: "valid-token", newPassword: "newsupersecret" });
    expect(result.current.successMessage).toBe("Tu contraseña se cambió.");
    expect(result.current.serverError).toBeNull();
  });

  it("does not call the API and shows the invalid-token message when there is no token", async () => {
    const { result } = renderHookWithIntl(() => useResetPasswordForm(null));
    await submit(result.current);

    expect(resetPassword).not.toHaveBeenCalled();
    expect(result.current.serverError).toBe(esMessages.auth.resetPassword.invalidToken);
  });

  // The case this effort was partly about: the backend's exact message for an expired or
  // already-used reset-password token (see backend/app/api/routes/auth.py's reset-password route).
  it("surfaces the backend's expired/invalid token message", async () => {
    vi.mocked(resetPassword).mockRejectedValueOnce(
      backendError({ detail: "El link para cambiar la contraseña no es válido o venció." }),
    );

    const { result } = renderHookWithIntl(() => useResetPasswordForm("expired-token"));
    await submit(result.current);

    expect(result.current.serverError).toBe("El link para cambiar la contraseña no es válido o venció.");
    expect(result.current.successMessage).toBeNull();
  });

  it("falls back to the translated message when there is no usable detail", async () => {
    vi.mocked(resetPassword).mockRejectedValueOnce(new AxiosError("Network Error"));

    const { result } = renderHookWithIntl(() => useResetPasswordForm("some-token"));
    await submit(result.current);

    expect(result.current.serverError).toBe(esMessages.auth.resetPassword.errorFallback);
  });
});
