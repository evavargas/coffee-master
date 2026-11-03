import { act } from "@testing-library/react";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useChat } from "@/hooks/useChat";
import { sendChatMessages } from "@/lib/api/chat";
import esMessages from "@/messages/es.json";

vi.mock("@/lib/api/chat", () => ({
  sendChatMessages: vi.fn(),
}));

describe("useChat", () => {
  beforeEach(() => {
    vi.mocked(sendChatMessages).mockReset();
  });

  it("appends the user message and the assistant reply on success", async () => {
    vi.mocked(sendChatMessages).mockResolvedValueOnce("Te recomiendo una ratio 1:16.");

    const { result } = renderHookWithIntl(() => useChat());

    await act(async () => {
      await result.current.send("¿Cómo hago un pour over?");
    });

    expect(sendChatMessages).toHaveBeenCalledWith([{ role: "user", content: "¿Cómo hago un pour over?" }]);
    expect(result.current.messages).toEqual([
      { role: "user", content: "¿Cómo hago un pour over?" },
      { role: "assistant", content: "Te recomiendo una ratio 1:16." },
    ]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("sets the fallback error and keeps the existing messages when the API call fails", async () => {
    vi.mocked(sendChatMessages).mockResolvedValueOnce("Una respuesta previa.");
    vi.mocked(sendChatMessages).mockRejectedValueOnce(new AxiosError("Network Error"));

    const { result } = renderHookWithIntl(() => useChat());

    await act(async () => {
      await result.current.send("primera pregunta");
    });

    const messagesBeforeFailure = result.current.messages;

    await act(async () => {
      await result.current.send("segunda pregunta");
    });

    expect(result.current.error).toBe(esMessages.chat.errorFallback);
    // The failed send still appends the new user message, but not a corrupted/partial assistant reply.
    expect(result.current.messages).toEqual([...messagesBeforeFailure, { role: "user", content: "segunda pregunta" }]);
    expect(result.current.isLoading).toBe(false);
  });

  it("does not call the API for blank input", async () => {
    const { result } = renderHookWithIntl(() => useChat());

    await act(async () => {
      await result.current.send("   ");
    });

    expect(sendChatMessages).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });
});
