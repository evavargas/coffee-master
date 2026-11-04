import { AxiosError } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Side-effect import: initializes the i18next singleton so `t()` resolves
// real translations instead of echoing the raw key.
import "@/i18n";
import { useChat } from "@/hooks/useChat";
import { getLatestConversation, streamChat, type ChatStreamHandlers } from "@/lib/api/chat";
import es from "@/i18n/locales/es.json";

jest.mock("@/lib/api/chat", () => {
  const actual = jest.requireActual<typeof import("@/lib/api/chat")>("@/lib/api/chat");
  return { ...actual, getLatestConversation: jest.fn(), streamChat: jest.fn() };
});

const { ChatStreamError } = jest.requireActual<typeof import("@/lib/api/chat")>("@/lib/api/chat");

const mockedLatest = getLatestConversation as jest.MockedFunction<typeof getLatestConversation>;
const mockedStream = streamChat as jest.MockedFunction<typeof streamChat>;

function httpError(status: number, detail: string) {
  return new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    data: { detail },
    headers: {},
    config: {} as never,
  });
}

/** A stream the test drives by hand, to observe the state between events. */
function controlledStream() {
  let handlers!: ChatStreamHandlers;
  let finish!: () => void;
  let fail!: (error: unknown) => void;
  mockedStream.mockImplementationOnce((_input, streamHandlers) => {
    handlers = streamHandlers;
    return new Promise<void>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
  });
  return {
    handlers: () => handlers,
    finish: () => finish(),
    fail: (error: unknown) => fail(error),
  };
}

async function renderLoadedChat() {
  const view = await renderHook(() => useChat());
  await waitFor(() => expect(view.result.current.isLoadingHistory).toBe(false));
  return view;
}

const USER_TEXT = "¿Cómo hago un cortado?";

describe("useChat", () => {
  beforeEach(() => {
    mockedStream.mockReset();
    mockedLatest.mockReset();
    mockedLatest.mockResolvedValue({ conversation_id: null, messages: [] });
  });

  describe("history", () => {
    it("loads the latest conversation on mount", async () => {
      const stored = [
        { role: "user" as const, content: "Hola" },
        { role: "assistant" as const, content: "Hola, Ana" },
      ];
      mockedLatest.mockResolvedValue({ conversation_id: 12, messages: stored });

      const { result } = await renderHook(() => useChat());
      await waitFor(() => expect(result.current.isLoadingHistory).toBe(false));

      expect(result.current.messages).toEqual(stored);
      expect(result.current.conversationId).toBe(12);
      expect(result.current.error).toBeNull();
    });

    it("reports loading until the history arrives and ignores a send meanwhile", async () => {
      let resolveLatest!: (value: Awaited<ReturnType<typeof getLatestConversation>>) => void;
      mockedLatest.mockReturnValue(new Promise((resolve) => (resolveLatest = resolve)));

      const { result } = await renderHook(() => useChat());
      expect(result.current.isLoadingHistory).toBe(true);
      expect(result.current.canStartNewConversation).toBe(false);

      await act(async () => {
        await result.current.send(USER_TEXT);
      });
      expect(mockedStream).not.toHaveBeenCalled();

      await act(async () => {
        resolveLatest({ conversation_id: null, messages: [] });
      });
      expect(result.current.isLoadingHistory).toBe(false);
    });

    it("shows an error on a failed load and leaves the chat usable", async () => {
      mockedLatest.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
      const { result } = await renderLoadedChat();

      expect(result.current.error).toBe(es.chat.errors.history);
      expect(result.current.messages).toEqual([]);

      mockedStream.mockImplementationOnce(async (_input, handlers) => {
        handlers.onStart(3);
        handlers.onDelta("Hola");
      });
      await act(async () => {
        await result.current.send(USER_TEXT);
      });

      expect(mockedStream.mock.calls[0][0]).toEqual({ conversationId: null, message: USER_TEXT });
      expect(result.current.error).toBeNull();
      expect(result.current.conversationId).toBe(3);
    });
  });

  describe("send", () => {
    it("adds both bubbles, grows the assistant one with deltas and stores the conversation id", async () => {
      const stream = controlledStream();
      const { result } = await renderLoadedChat();

      await act(async () => {
        result.current.setInput(USER_TEXT);
      });
      await act(async () => {
        void result.current.send(USER_TEXT);
      });

      expect(result.current.input).toBe("");
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAwaitingFirstDelta).toBe(true);
      expect(result.current.messages).toEqual([
        { role: "user", content: USER_TEXT },
        { role: "assistant", content: "" },
      ]);

      await act(async () => stream.handlers().onStart(21));
      expect(result.current.conversationId).toBe(21);
      expect(result.current.isAwaitingFirstDelta).toBe(true);

      await act(async () => stream.handlers().onDelta("Un cortado "));
      expect(result.current.isAwaitingFirstDelta).toBe(false);
      expect(result.current.isLoading).toBe(true);
      await act(async () => stream.handlers().onDelta("lleva leche."));
      expect(result.current.messages[1].content).toBe("Un cortado lleva leche.");

      await act(async () => stream.finish());
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("continues the current conversation, posting only the new message", async () => {
      mockedLatest.mockResolvedValue({
        conversation_id: 12,
        messages: [{ role: "user", content: "Hola" }],
      });
      mockedStream.mockResolvedValue(undefined);
      const { result } = await renderLoadedChat();

      await act(async () => {
        await result.current.send(`  ${USER_TEXT}  `);
      });

      expect(mockedStream.mock.calls[0][0]).toEqual({ conversationId: 12, message: USER_TEXT });
    });

    it("replaces the whole assistant bubble on replace", async () => {
      const stream = controlledStream();
      const { result } = await renderLoadedChat();
      await act(async () => {
        void result.current.send(USER_TEXT);
      });

      await act(async () => stream.handlers().onDelta("texto filtrado"));
      await act(async () => stream.handlers().onReplace("Prefiero hablar de café."));
      expect(result.current.messages[1]).toEqual({ role: "assistant", content: "Prefiero hablar de café." });

      await act(async () => stream.finish());
      expect(result.current.messages[1].content).toBe("Prefiero hablar de café.");
    });

    it("drops the empty assistant bubble when done arrives with no text", async () => {
      mockedStream.mockResolvedValue(undefined);
      const { result } = await renderLoadedChat();

      await act(async () => {
        await result.current.send(USER_TEXT);
      });

      expect(result.current.messages).toEqual([{ role: "user", content: USER_TEXT }]);
    });

    it("ignores a second send while one is in flight", async () => {
      const stream = controlledStream();
      const { result } = await renderLoadedChat();

      await act(async () => {
        void result.current.send(USER_TEXT);
        void result.current.send(USER_TEXT);
      });
      expect(mockedStream).toHaveBeenCalledTimes(1);

      await act(async () => stream.finish());
    });
  });

  describe("failures", () => {
    const prior = [
      { role: "user" as const, content: "Hola" },
      { role: "assistant" as const, content: "Hola, Ana" },
    ];

    it.each([
      ["model_busy", new ChatStreamError("model_busy"), es.chat.errors.modelBusy],
      ["model_unavailable", new ChatStreamError("model_unavailable"), es.chat.errors.modelUnavailable],
      ["no terminal event", new ChatStreamError("connection"), es.chat.errors.connection],
      ["transport failure", new AxiosError("Network Error", "ERR_NETWORK"), es.chat.errors.connection],
      ["401", httpError(401, "Tu sesión venció."), "Tu sesión venció."],
      ["404", httpError(404, "No encontramos esa conversación."), "No encontramos esa conversación."],
      ["422", httpError(422, "El mensaje no es válido."), "El mensaje no es válido."],
      ["429", httpError(429, "Llegaste al límite."), "Llegaste al límite."],
    ])("on %s removes both bubbles, restores the input and shows the message", async (_name, failure, message) => {
      mockedLatest.mockResolvedValue({ conversation_id: 12, messages: prior });
      const stream = controlledStream();
      const { result } = await renderLoadedChat();

      await act(async () => {
        void result.current.send(USER_TEXT);
      });
      await act(async () => stream.handlers().onDelta("Un cort"));
      await act(async () => stream.fail(failure));

      expect(result.current.messages).toEqual(prior);
      expect(result.current.input).toBe(USER_TEXT);
      expect(result.current.error).toBe(message);
      expect(result.current.isLoading).toBe(false);
    });

    it("keeps the conversation id from start, so a retry stays in the same conversation", async () => {
      const stream = controlledStream();
      const { result } = await renderLoadedChat();
      await act(async () => {
        void result.current.send(USER_TEXT);
      });
      await act(async () => stream.handlers().onStart(30));
      await act(async () => stream.fail(new ChatStreamError("model_busy")));

      mockedStream.mockResolvedValue(undefined);
      await act(async () => {
        await result.current.send(USER_TEXT);
      });

      expect(mockedStream.mock.calls[1][0]).toEqual({ conversationId: 30, message: USER_TEXT });
    });

    it("clears the error on the next send", async () => {
      mockedStream.mockRejectedValueOnce(new ChatStreamError("model_busy"));
      const { result } = await renderLoadedChat();
      await act(async () => {
        await result.current.send(USER_TEXT);
      });
      expect(result.current.error).toBe(es.chat.errors.modelBusy);

      const stream = controlledStream();
      await act(async () => {
        void result.current.send(USER_TEXT);
      });
      expect(result.current.error).toBeNull();
      await act(async () => stream.finish());
    });
  });

  describe("newConversation", () => {
    it("clears the messages and the conversation id", async () => {
      mockedLatest.mockResolvedValue({ conversation_id: 12, messages: [{ role: "user", content: "Hola" }] });
      mockedStream.mockResolvedValue(undefined);
      const { result } = await renderLoadedChat();

      await act(async () => {
        result.current.newConversation();
      });
      expect(result.current.messages).toEqual([]);
      expect(result.current.conversationId).toBeNull();

      await act(async () => {
        await result.current.send(USER_TEXT);
      });
      expect(mockedStream.mock.calls[0][0]).toEqual({ conversationId: null, message: USER_TEXT });
    });

    it("does nothing while sending", async () => {
      mockedLatest.mockResolvedValue({ conversation_id: 12, messages: [] });
      const stream = controlledStream();
      const { result } = await renderLoadedChat();
      await act(async () => {
        void result.current.send(USER_TEXT);
      });
      expect(result.current.canStartNewConversation).toBe(false);

      await act(async () => {
        result.current.newConversation();
      });
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.conversationId).toBe(12);

      await act(async () => stream.finish());
      expect(result.current.canStartNewConversation).toBe(true);
    });
  });
});
