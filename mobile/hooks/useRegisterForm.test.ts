import { AxiosError } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Side-effect import: initializes the i18next singleton so `t()` resolves
// real translations instead of echoing the raw key.
import "@/i18n";
import { useRegisterForm } from "@/hooks/useRegisterForm";
import { registerAccount } from "@/lib/api/auth";
import es from "@/i18n/locales/es.json";

jest.mock("@/lib/api/auth");

const mockedRegisterAccount = registerAccount as jest.MockedFunction<typeof registerAccount>;

describe("useRegisterForm", () => {
  beforeEach(() => {
    mockedRegisterAccount.mockReset();
  });

  async function submit(
    result: { current: ReturnType<typeof useRegisterForm> },
    values: { name: string; email: string; password: string },
  ) {
    await act(async () => {
      result.current.form.setValue("name", values.name);
      result.current.form.setValue("email", values.email);
      result.current.form.setValue("password", values.password);
      await result.current.onSubmit();
    });
  }

  it("sets successMessage from the backend and keeps serverError null on success", async () => {
    mockedRegisterAccount.mockResolvedValue("Te mandamos un código a tu email.");
    const { result } = await renderHook(() => useRegisterForm());

    await submit(result, { name: "Carlos", email: "carlos@example.com", password: "secret123" });

    await waitFor(() => expect(result.current.successMessage).toBe("Te mandamos un código a tu email."));
    expect(result.current.serverError).toBeNull();
  });

  it("sets serverError to the backend detail message on a 400 response", async () => {
    const backendMessage = "Ese email ya está registrado.";
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
    mockedRegisterAccount.mockRejectedValue(axiosError);
    const { result } = await renderHook(() => useRegisterForm());

    await submit(result, { name: "Carlos", email: "carlos@example.com", password: "secret123" });

    await waitFor(() => expect(result.current.serverError).toBe(backendMessage));
    expect(result.current.successMessage).toBeNull();
  });

  it("falls back to the translated generic error when there is no usable detail", async () => {
    const networkError = new AxiosError("Network Error", "ERR_NETWORK");
    mockedRegisterAccount.mockRejectedValue(networkError);
    const { result } = await renderHook(() => useRegisterForm());

    await submit(result, { name: "Carlos", email: "carlos@example.com", password: "secret123" });

    await waitFor(() => expect(result.current.serverError).toBe(es.auth.register.errorFallback));
    expect(result.current.successMessage).toBeNull();
  });
});
