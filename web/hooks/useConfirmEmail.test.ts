import { waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useConfirmEmail } from "@/hooks/useConfirmEmail";
import { confirmEmail } from "@/lib/api/auth";
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
  confirmEmail: vi.fn(),
}));

describe("useConfirmEmail", () => {
  beforeEach(() => {
    vi.mocked(confirmEmail).mockReset();
  });

  it("confirms the email and reaches the success status", async () => {
    vi.mocked(confirmEmail).mockResolvedValueOnce({ message: "Tu cuenta quedó confirmada." });

    const { result } = renderHookWithIntl(() => useConfirmEmail("a-valid-token"));

    await waitFor(() => expect(result.current.status).toBe("success"));

    expect(confirmEmail).toHaveBeenCalledWith("a-valid-token");
    expect(result.current.message).toBe("Tu cuenta quedó confirmada.");
  });

  it("surfaces the backend's expired/invalid token message", async () => {
    vi.mocked(confirmEmail).mockRejectedValueOnce(
      backendError({ detail: "El link de confirmación no es válido o venció." }),
    );

    const { result } = renderHookWithIntl(() => useConfirmEmail("an-expired-token"));

    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.message).toBe("El link de confirmación no es válido o venció.");
  });

  it("falls back to the translated message when there is no usable detail", async () => {
    vi.mocked(confirmEmail).mockRejectedValueOnce(new AxiosError("Network Error"));

    const { result } = renderHookWithIntl(() => useConfirmEmail("some-token"));

    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.message).toBe(esMessages.auth.confirmEmail.errorFallback);
  });

  it("does not call the API and shows the invalid-token message when there is no token", async () => {
    const { result } = renderHookWithIntl(() => useConfirmEmail(null));

    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(confirmEmail).not.toHaveBeenCalled();
    expect(result.current.message).toBe(esMessages.auth.confirmEmail.invalidToken);
  });
});
