import { AxiosError } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Side-effect import: initializes the i18next singleton so `t()` resolves
// real translations instead of echoing the raw key.
import "@/i18n";
import { useForgotPasswordForm } from "@/hooks/useForgotPasswordForm";
import { requestPasswordReset } from "@/lib/api/auth";
import es from "@/i18n/locales/es.json";

jest.mock("@/lib/api/auth");

const mockedRequestPasswordReset = requestPasswordReset as jest.MockedFunction<typeof requestPasswordReset>;

describe("useForgotPasswordForm", () => {
  beforeEach(() => {
    mockedRequestPasswordReset.mockReset();
  });

  async function submit(result: { current: ReturnType<typeof useForgotPasswordForm> }, email: string) {
    await act(async () => {
      result.current.form.setValue("email", email);
      await result.current.onSubmit();
    });
  }

  it("sets successMessage from the backend and keeps serverError null on success", async () => {
    mockedRequestPasswordReset.mockResolvedValue("Si el email existe, te mandamos un código.");
    const { result } = await renderHook(() => useForgotPasswordForm());

    await submit(result, "carlos@example.com");

    await waitFor(() =>
      expect(result.current.successMessage).toBe("Si el email existe, te mandamos un código."),
    );
    expect(result.current.serverError).toBeNull();
  });

  it("sets serverError to the backend detail message on a 400 response", async () => {
    const backendMessage = "No pudimos procesar el pedido.";
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
    mockedRequestPasswordReset.mockRejectedValue(axiosError);
    const { result } = await renderHook(() => useForgotPasswordForm());

    await submit(result, "carlos@example.com");

    await waitFor(() => expect(result.current.serverError).toBe(backendMessage));
    expect(result.current.successMessage).toBeNull();
  });

  it("falls back to the translated generic error when there is no usable detail", async () => {
    const networkError = new AxiosError("Network Error", "ERR_NETWORK");
    mockedRequestPasswordReset.mockRejectedValue(networkError);
    const { result } = await renderHook(() => useForgotPasswordForm());

    await submit(result, "carlos@example.com");

    await waitFor(() => expect(result.current.serverError).toBe(es.auth.forgotPassword.errorFallback));
    expect(result.current.successMessage).toBeNull();
  });
});
