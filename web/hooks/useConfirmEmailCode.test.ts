import { act } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useConfirmEmailCode } from "@/hooks/useConfirmEmailCode";
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

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/api/auth", () => ({
  confirmEmail: vi.fn(),
}));

async function submit(result: ReturnType<typeof useConfirmEmailCode>) {
  act(() => {
    result.form.setValue("code", "123456");
  });
  await act(async () => {
    await result.onSubmit();
  });
}

describe("useConfirmEmailCode", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(confirmEmail).mockReset();
  });

  it("confirms the email with the code and redirects to /login", async () => {
    vi.mocked(confirmEmail).mockResolvedValueOnce({ message: "Tu cuenta quedó confirmada." });

    const { result } = renderHookWithIntl(() => useConfirmEmailCode("ana@example.com"));
    await submit(result.current);

    expect(confirmEmail).toHaveBeenCalledWith({ email: "ana@example.com", code: "123456" });
    expect(result.current.successMessage).toBe("Tu cuenta quedó confirmada.");
    expect(result.current.serverError).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("surfaces the backend's expired/invalid code message", async () => {
    vi.mocked(confirmEmail).mockRejectedValueOnce(backendError({ detail: "El código no es válido o venció." }));

    const { result } = renderHookWithIntl(() => useConfirmEmailCode("ana@example.com"));
    await submit(result.current);

    expect(result.current.serverError).toBe("El código no es válido o venció.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("falls back to the translated message when there is no usable detail", async () => {
    vi.mocked(confirmEmail).mockRejectedValueOnce(new AxiosError("Network Error"));

    const { result } = renderHookWithIntl(() => useConfirmEmailCode("ana@example.com"));
    await submit(result.current);

    expect(result.current.serverError).toBe(esMessages.auth.confirmEmail.errorFallback);
  });
});
