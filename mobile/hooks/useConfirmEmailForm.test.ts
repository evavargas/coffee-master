import { AxiosError } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Side-effect import: initializes the i18next singleton so `t()` resolves
// real translations instead of echoing the raw key.
import "@/i18n";
import { useConfirmEmailForm } from "@/hooks/useConfirmEmailForm";
import { confirmEmail } from "@/lib/api/auth";
import es from "@/i18n/locales/es.json";

jest.mock("@/lib/api/auth");

const mockedConfirmEmail = confirmEmail as jest.MockedFunction<typeof confirmEmail>;

describe("useConfirmEmailForm", () => {
  beforeEach(() => {
    mockedConfirmEmail.mockReset();
  });

  async function submit(
    result: { current: ReturnType<typeof useConfirmEmailForm> },
    values: { email: string; code: string },
  ) {
    await act(async () => {
      result.current.form.setValue("email", values.email);
      result.current.form.setValue("code", values.code);
      await result.current.onSubmit();
    });
  }

  it("prefills the email field from the constructor argument", async () => {
    const { result } = await renderHook(() => useConfirmEmailForm("carlos@example.com"));

    expect(result.current.form.getValues("email")).toBe("carlos@example.com");
  });

  it("sets successMessage from the backend and keeps serverError null on success", async () => {
    mockedConfirmEmail.mockResolvedValue("Tu cuenta quedó confirmada.");
    const { result } = await renderHook(() => useConfirmEmailForm());

    await submit(result, { email: "carlos@example.com", code: "123456" });

    await waitFor(() => expect(result.current.successMessage).toBe("Tu cuenta quedó confirmada."));
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
    mockedConfirmEmail.mockRejectedValue(axiosError);
    const { result } = await renderHook(() => useConfirmEmailForm());

    await submit(result, { email: "carlos@example.com", code: "000000" });

    await waitFor(() => expect(result.current.serverError).toBe(backendMessage));
    expect(result.current.successMessage).toBeNull();
  });

  it("falls back to the translated generic error when there is no usable detail", async () => {
    const networkError = new AxiosError("Network Error", "ERR_NETWORK");
    mockedConfirmEmail.mockRejectedValue(networkError);
    const { result } = await renderHook(() => useConfirmEmailForm());

    await submit(result, { email: "carlos@example.com", code: "123456" });

    await waitFor(() => expect(result.current.serverError).toBe(es.auth.confirmEmail.errorFallback));
    expect(result.current.successMessage).toBeNull();
  });
});
