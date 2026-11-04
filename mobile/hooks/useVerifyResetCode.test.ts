import { AxiosError } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Side-effect import: initializes the i18next singleton so `t()` resolves
// real translations instead of echoing the raw key.
import "@/i18n";
import { useVerifyResetCode } from "@/hooks/useVerifyResetCode";
import { verifyResetCode } from "@/lib/api/auth";
import es from "@/i18n/locales/es.json";

jest.mock("@/lib/api/auth");

const mockedVerifyResetCode = verifyResetCode as jest.MockedFunction<typeof verifyResetCode>;

describe("useVerifyResetCode", () => {
  beforeEach(() => {
    mockedVerifyResetCode.mockReset();
  });

  async function submit(
    result: { current: ReturnType<typeof useVerifyResetCode> },
    values: { email: string; code: string },
  ) {
    await act(async () => {
      result.current.form.setValue("email", values.email);
      result.current.form.setValue("code", values.code);
      await result.current.onSubmit();
    });
  }

  it("exposes the backend's reset_token and keeps serverError null on success", async () => {
    mockedVerifyResetCode.mockResolvedValue("fake-reset-token");
    const { result } = await renderHook(() => useVerifyResetCode());

    await submit(result, { email: "carlos@example.com", code: "123456" });

    await waitFor(() => expect(result.current.resetToken).toBe("fake-reset-token"));
    expect(result.current.serverError).toBeNull();
  });

  it("sets serverError to the backend detail message on an invalid code", async () => {
    const backendMessage = "El código es incorrecto o venció.";
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
    mockedVerifyResetCode.mockRejectedValue(axiosError);
    const { result } = await renderHook(() => useVerifyResetCode());

    await submit(result, { email: "carlos@example.com", code: "000000" });

    await waitFor(() => expect(result.current.serverError).toBe(backendMessage));
    expect(result.current.resetToken).toBeNull();
  });

  it("falls back to the translated generic error when there is no usable detail", async () => {
    const networkError = new AxiosError("Network Error", "ERR_NETWORK");
    mockedVerifyResetCode.mockRejectedValue(networkError);
    const { result } = await renderHook(() => useVerifyResetCode());

    await submit(result, { email: "carlos@example.com", code: "123456" });

    await waitFor(() => expect(result.current.serverError).toBe(es.auth.verifyResetCode.errorFallback));
    expect(result.current.resetToken).toBeNull();
  });
});
