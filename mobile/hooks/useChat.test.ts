import { AxiosError } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Side-effect import: initializes the i18next singleton so `t()` resolves
// real translations instead of echoing the raw key.
import "@/i18n";
import { useChat } from "@/hooks/useChat";
import { sendChatMessages } from "@/lib/api/chat";
import es from "@/i18n/locales/es.json";

jest.mock("@/lib/api/chat");

const mockedSendChatMessages = sendChatMessages as jest.MockedFunction<typeof sendChatMessages>;

describe("useChat", () => {
  beforeEach(() => {
    mockedSendChatMessages.mockReset();
  });

  it("appends the assistant reply to the message list and keeps error null on success", async () => {
    mockedSendChatMessages.mockResolvedValue("Un café de Colombia con esa proporción te queda suave.");
    const { result } = await renderHook(() => useChat());

    await act(async () => {
      await result.current.send("¿Cómo me queda un café de Colombia 1:1.5?");
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toEqual([
      { role: "user", content: "¿Cómo me queda un café de Colombia 1:1.5?" },
      { role: "assistant", content: "Un café de Colombia con esa proporción te queda suave." },
    ]);
    expect(result.current.error).toBeNull();
  });

  it("sets the backend detail as error and leaves prior messages untouched on failure", async () => {
    mockedSendChatMessages.mockResolvedValueOnce("Hola, ¿en qué te puedo ayudar?");
    const { result } = await renderHook(() => useChat());

    await act(async () => {
      await result.current.send("Hola");
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const messagesAfterFirstSend = result.current.messages;

    const backendMessage = "No pudimos procesar tu mensaje.";
    const axiosError = new AxiosError(
      "Request failed with status code 500",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      {
        status: 500,
        statusText: "Internal Server Error",
        data: { detail: backendMessage },
        headers: {},
        config: {} as never,
      },
    );
    mockedSendChatMessages.mockRejectedValueOnce(axiosError);

    await act(async () => {
      await result.current.send("¿Y con robusta?");
    });

    await waitFor(() => expect(result.current.error).toBe(backendMessage));
    expect(result.current.messages).toEqual([
      ...messagesAfterFirstSend,
      { role: "user", content: "¿Y con robusta?" },
    ]);
  });

  it("falls back to the translated generic error when there is no usable detail", async () => {
    mockedSendChatMessages.mockResolvedValueOnce("Hola, ¿en qué te puedo ayudar?");
    const { result } = await renderHook(() => useChat());

    await act(async () => {
      await result.current.send("Hola");
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const messagesAfterFirstSend = result.current.messages;

    const networkError = new AxiosError("Network Error", "ERR_NETWORK");
    mockedSendChatMessages.mockRejectedValueOnce(networkError);

    await act(async () => {
      await result.current.send("¿Y con robusta?");
    });

    await waitFor(() => expect(result.current.error).toBe(es.chat.genericError));
    expect(result.current.messages).toEqual([
      ...messagesAfterFirstSend,
      { role: "user", content: "¿Y con robusta?" },
    ]);
  });
});
