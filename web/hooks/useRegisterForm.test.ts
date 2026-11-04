import { act } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useRegisterForm } from "@/hooks/useRegisterForm";
import { registerAccount } from "@/lib/api/auth";
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
  registerAccount: vi.fn(),
}));

describe("useRegisterForm", () => {
  beforeEach(() => {
    vi.mocked(registerAccount).mockReset();
  });

  it("reaches the API and shows the backend's success message", async () => {
    vi.mocked(registerAccount).mockResolvedValueOnce({ message: "Revisá tu email para confirmar la cuenta." });

    const { result } = renderHookWithIntl(() => useRegisterForm());

    act(() => {
      result.current.form.setValue("name", "Ana");
      result.current.form.setValue("email", "ana@example.com");
      result.current.form.setValue("password", "supersecret");
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(registerAccount).toHaveBeenCalledWith({
      name: "Ana",
      email: "ana@example.com",
      password: "supersecret",
    });
    expect(result.current.successMessage).toBe("Revisá tu email para confirmar la cuenta.");
    expect(result.current.serverError).toBeNull();
  });

  it("advances with the backend's message whatever it says (the response never reveals if the email exists)", async () => {
    vi.mocked(registerAccount).mockResolvedValueOnce({ message: "Si el email es válido, te enviamos un código." });

    const { result } = renderHookWithIntl(() => useRegisterForm());

    act(() => {
      result.current.form.setValue("name", "Ana");
      result.current.form.setValue("email", "taken@example.com");
      result.current.form.setValue("password", "supersecret");
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.successMessage).toBe("Si el email es válido, te enviamos un código.");
    expect(result.current.serverError).toBeNull();
  });

  it("surfaces the backend's error message", async () => {
    vi.mocked(registerAccount).mockRejectedValueOnce(backendError({ detail: "Demasiados intentos. Probá más tarde." }));

    const { result } = renderHookWithIntl(() => useRegisterForm());

    act(() => {
      result.current.form.setValue("name", "Ana");
      result.current.form.setValue("email", "ana@example.com");
      result.current.form.setValue("password", "supersecret");
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.serverError).toBe("Demasiados intentos. Probá más tarde.");
    expect(result.current.successMessage).toBeNull();
  });

  it("falls back to the translated message when there is no usable detail", async () => {
    vi.mocked(registerAccount).mockRejectedValueOnce(new AxiosError("Network Error"));

    const { result } = renderHookWithIntl(() => useRegisterForm());

    act(() => {
      result.current.form.setValue("name", "Ana");
      result.current.form.setValue("email", "ana@example.com");
      result.current.form.setValue("password", "supersecret");
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.serverError).toBe(esMessages.auth.register.errorFallback);
  });
});
