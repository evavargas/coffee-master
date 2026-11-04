import { AxiosError } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Side-effect import: initializes the i18next singleton so `t()` resolves
// real translations instead of echoing the raw key.
import "@/i18n";
import { useResetPasswordForm } from "@/hooks/useResetPasswordForm";
import { resetPassword } from "@/lib/api/auth";
import es from "@/i18n/locales/es.json";

jest.mock("@/lib/api/auth");

const mockedResetPassword = resetPassword as jest.MockedFunction<typeof resetPassword>;

describe("useResetPasswordForm", () => {
  beforeEach(() => {
    mockedResetPassword.mockReset();
  });

  async function submit(
    result: { current: ReturnType<typeof useResetPasswordForm> },
    values: { password: string; confirmPassword: string },
  ) {
    await act(async () => {
      result.current.form.setValue("password", values.password);
      result.current.form.setValue("confirmPassword", values.confirmPassword);
      await result.current.onSubmit();
    });
  }

  it("calls resetPassword with the reset token and sets successMessage on success", async () => {
    mockedResetPassword.mockResolvedValue("Tu contraseña fue actualizada.");
    const { result } = await renderHook(() => useResetPasswordForm("fake-reset-token"));

    await submit(result, { password: "newsecret123", confirmPassword: "newsecret123" });

    await waitFor(() => expect(result.current.successMessage).toBe("Tu contraseña fue actualizada."));
    expect(mockedResetPassword).toHaveBeenCalledWith({
      resetToken: "fake-reset-token",
      newPassword: "newsecret123",
    });
    expect(result.current.serverError).toBeNull();
  });

  it("sets serverError to the backend detail message on an expired or used token", async () => {
    const backendMessage = "El token venció o ya fue usado.";
    const axiosError = new AxiosError(
      "Request failed with status code 400",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 400,
        statusText: "Bad Request",
        data: { detail: backendMessage },
        headers: {},
        config: {} as never,
      },
    );
    mockedResetPassword.mockRejectedValue(axiosError);
    const { result } = await renderHook(() => useResetPasswordForm("fake-reset-token"));

    await submit(result, { password: "newsecret123", confirmPassword: "newsecret123" });

    await waitFor(() => expect(result.current.serverError).toBe(backendMessage));
    expect(result.current.successMessage).toBeNull();
  });

  it("falls back to the translated generic error when there is no usable detail", async () => {
    const networkError = new AxiosError("Network Error", "ERR_NETWORK");
    mockedResetPassword.mockRejectedValue(networkError);
    const { result } = await renderHook(() => useResetPasswordForm("fake-reset-token"));

    await submit(result, { password: "newsecret123", confirmPassword: "newsecret123" });

    await waitFor(() => expect(result.current.serverError).toBe(es.auth.resetPassword.errorFallback));
    expect(result.current.successMessage).toBeNull();
  });
});
