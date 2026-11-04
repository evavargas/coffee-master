import { AxiosError } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Side-effect import: initializes the i18next singleton so `t()` resolves
// real translations instead of echoing the raw key.
import "@/i18n";
import { useLoginForm } from "@/hooks/useLoginForm";
import { login } from "@/lib/api/auth";
import es from "@/i18n/locales/es.json";

jest.mock("@/lib/api/auth");

const mockedLogin = login as jest.MockedFunction<typeof login>;

describe("useLoginForm", () => {
  beforeEach(() => {
    mockedLogin.mockReset();
  });

  // Setting the fields and submitting must happen inside a single awaited act()
  // call: splitting them across two act() calls lets react-hook-form's internal
  // subscription updates land outside the act scope, so the final state never
  // reaches `result.current`.
  async function submit(
    result: { current: ReturnType<typeof useLoginForm> },
    values: { email: string; password: string },
  ) {
    await act(async () => {
      result.current.form.setValue("email", values.email);
      result.current.form.setValue("password", values.password);
      await result.current.onSubmit();
    });
  }

  it("calls onAuthenticated with the token and keeps serverError null on success", async () => {
    mockedLogin.mockResolvedValue("fake-jwt-token");
    const onAuthenticated = jest.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);
    const { result } = await renderHook(() => useLoginForm(onAuthenticated));

    await submit(result, { email: "carlos@example.com", password: "secret123" });

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith("fake-jwt-token"));
    expect(result.current.serverError).toBeNull();
  });

  it("sets serverError to the backend detail message on a 401 response", async () => {
    const backendMessage = "Email o contraseña incorrectos.";
    const axiosError = new AxiosError(
      "Request failed with status code 401",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 401,
        statusText: "Unauthorized",
        data: { detail: backendMessage },
        headers: {},
        config: {} as never,
      },
    );
    mockedLogin.mockRejectedValue(axiosError);
    const onAuthenticated = jest.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);
    const { result } = await renderHook(() => useLoginForm(onAuthenticated));

    await submit(result, { email: "carlos@example.com", password: "wrong-password" });

    await waitFor(() => expect(result.current.serverError).toBe(backendMessage));
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("falls back to the translated generic error when there is no usable detail", async () => {
    const networkError = new AxiosError("Network Error", "ERR_NETWORK");
    mockedLogin.mockRejectedValue(networkError);
    const onAuthenticated = jest.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);
    const { result } = await renderHook(() => useLoginForm(onAuthenticated));

    await submit(result, { email: "carlos@example.com", password: "secret123" });

    await waitFor(() => expect(result.current.serverError).toBe(es.auth.login.genericError));
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
