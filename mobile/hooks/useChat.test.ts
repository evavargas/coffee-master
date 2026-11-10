import { AxiosError } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Side-effect import: initializes the i18next singleton so `t()` resolves
// real translations instead of echoing the raw key.
import "@/i18n";
import { useChat } from "@/hooks/useChat";
import { getConversation, getLatestConversation, streamChat, type ChatStreamHandlers } from "@/lib/api/chat";
import es from "@/i18n/locales/es.json";
import { clearSession } from "@/lib/session";

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams }));
jest.mock("@/lib/api/chat", () => {
  const actual = jest.requireActual<typeof import("@/lib/api/chat")>("@/lib/api/chat");
  return { ...actual, getLatestConversation: jest.fn(), getConversation: jest.fn(), streamChat: jest.fn() };
});

const { ChatStreamError } = jest.requireActual<typeof import("@/lib/api/chat")>("@/lib/api/chat");

const mockedLatest = getLatestConversation as jest.MockedFunction<typeof getLatestConversation>;
const mockedConversation = getConversation as jest.MockedFunction<typeof getConversation>;
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
    mockParams = {};
    mockedStream.mockReset();
    mockedConversation.mockReset();
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
  describe("recipe-aware conversations", () => {
    const ref = { kind: "catalog" as const, ref: "v60-dulce" };
    const detail = (id: number, recipe_ref: typeof ref | null = ref) => ({ id, messages: [], recipe_ref });

    it("opens ?c=<id> by id instead of latest", async () => {
      mockParams = { c: "15" };
      mockedConversation.mockResolvedValue({ id: 15, messages: [{ role: "user", content: "Hola" }], recipe_ref: ref });
      const { result } = await renderLoadedChat();

      expect(mockedConversation.mock.calls[0][0]).toBe(15);
      expect(mockedLatest).not.toHaveBeenCalled();
      expect(result.current.conversationId).toBe(15);
      expect(result.current.recipeRef).toEqual(ref);
    });

    it("exposes the recipe_ref of /latest too", async () => {
      mockedLatest.mockResolvedValue({ conversation_id: 4, messages: [], recipe_ref: ref });
      const { result } = await renderLoadedChat();
      expect(result.current.recipeRef).toEqual(ref);
    });

    it.each(["abc", "0", "-3", "1.5"])("falls back to latest for an invalid c (%s)", async (c) => {
      mockParams = { c };
      await renderLoadedChat();
      expect(mockedLatest).toHaveBeenCalled();
      expect(mockedConversation).not.toHaveBeenCalled();
    });

    it("shows its own message on a 404", async () => {
      mockParams = { c: "99" };
      mockedConversation.mockRejectedValue(httpError(404, "no"));
      const { result } = await renderLoadedChat();
      expect(result.current.error).toBe(es.chat.conversationNotFound);
    });

    it("prefills the opening prompt without sending it, only with a recipe_ref", async () => {
      mockParams = { c: "15", intent: "adapt" };
      mockedConversation.mockResolvedValue(detail(15));
      const { result } = await renderLoadedChat();
      await waitFor(() => expect(result.current.input).toBe(es.chat.intent.adapt));
      expect(mockedStream).not.toHaveBeenCalled();
    });

    it("does not prefill when the conversation has no recipe_ref or the intent is unknown", async () => {
      mockParams = { c: "15", intent: "ask" };
      mockedConversation.mockResolvedValue(detail(15, null));
      const first = await renderLoadedChat();
      expect(first.result.current.input).toBe("");

      mockParams = { c: "16", intent: "bogus" };
      mockedConversation.mockResolvedValue(detail(16));
      const second = await renderLoadedChat();
      expect(second.result.current.input).toBe("");
    });

    it("keeps what the user already typed instead of overwriting it with the prompt", async () => {
      mockParams = { c: "15", intent: "ask" };
      mockedConversation.mockResolvedValue(detail(15));
      const { result } = await renderLoadedChat();
      await waitFor(() => expect(result.current.input).toBe(es.chat.intent.ask));
      await act(async () => result.current.setInput("mi pregunta"));
      expect(result.current.input).toBe("mi pregunta");
    });

    it("clears the input when the requested conversation changes", async () => {
      mockParams = { c: "1" };
      mockedConversation.mockResolvedValue(detail(1, null));
      const view = await renderLoadedChat();
      await act(async () => view.result.current.setInput("borrador"));

      mockParams = { c: "2" };
      mockedConversation.mockResolvedValue(detail(2, null));
      await view.rerender({});
      await waitFor(() => expect(view.result.current.conversationId).toBe(2));
      expect(view.result.current.input).toBe("");
    });

    it("stores a recipe event on the assistant message", async () => {
      const stream = controlledStream();
      const { result } = await renderLoadedChat();
      await act(async () => {
        void result.current.send(USER_TEXT);
      });
      await act(async () => stream.handlers().onDelta("Probá esto"));
      await act(async () =>
        stream.handlers().onRecipe?.({ proposal_id: 8, recipe: { name: "V60", method: "v60" } as never }),
      );
      await act(async () => stream.finish());

      expect(result.current.messages[1]).toMatchObject({
        content: "Probá esto",
        proposal: { proposal_id: 8, saved_recipe_id: null },
      });
    });

    it("switching conversation mid-stream aborts it, leaks nothing into B, and B can send", async () => {
      mockParams = { c: "1" };
      mockedConversation.mockResolvedValue(detail(1, null));
      const stream = controlledStream();
      const view = await renderLoadedChat();
      await act(async () => {
        void view.result.current.send(USER_TEXT);
      });
      const signal = mockedStream.mock.calls[0][2] as AbortSignal;
      expect(signal.aborted).toBe(false);
      const handlersOfA = stream.handlers();

      mockParams = { c: "2" };
      const storedB = [
        { role: "user" as const, content: "B" },
        { role: "assistant" as const, content: "respuesta B" },
      ];
      mockedConversation.mockResolvedValue({ id: 2, messages: storedB, recipe_ref: null });
      await view.rerender({});
      expect(signal.aborted).toBe(true);
      await waitFor(() => expect(view.result.current.conversationId).toBe(2));

      // Late events and the late rejection of A must not touch B.
      await act(async () => {
        handlersOfA.onStart(1);
        handlersOfA.onDelta("de A");
        handlersOfA.onRecipe?.({ proposal_id: 1, recipe: { name: "A", method: "v60" } as never });
        stream.fail(new ChatStreamError("model_busy"));
      });
      expect(view.result.current.messages).toEqual(storedB);
      expect(view.result.current.conversationId).toBe(2);
      expect(view.result.current.error).toBeNull();
      expect(view.result.current.isLoading).toBe(false);

      mockedStream.mockResolvedValue(undefined);
      await act(async () => {
        await view.result.current.send(USER_TEXT);
      });
      expect(mockedStream.mock.calls[1][0]).toEqual({ conversationId: 2, message: USER_TEXT });
    });

    it("aborts the stream on unmount", async () => {
      controlledStream();
      const view = await renderLoadedChat();
      await act(async () => {
        void view.result.current.send(USER_TEXT);
      });
      const signal = mockedStream.mock.calls[0][2] as AbortSignal;
      await view.unmount();
      expect(signal.aborted).toBe(true);
    });

    it("ignores a history response that arrives after the conversation changed", async () => {
      let resolveA!: (v: Awaited<ReturnType<typeof getConversation>>) => void;
      mockParams = { c: "1" };
      mockedConversation.mockReturnValueOnce(new Promise((r) => (resolveA = r)));
      const view = await renderHook(() => useChat());

      mockParams = { c: "2" };
      mockedConversation.mockResolvedValueOnce({ id: 2, messages: [{ role: "user", content: "B" }], recipe_ref: null });
      await view.rerender({});
      await waitFor(() => expect(view.result.current.conversationId).toBe(2));

      await act(async () => resolveA({ id: 1, messages: [{ role: "user", content: "A" }], recipe_ref: ref }));
      expect(view.result.current.conversationId).toBe(2);
      expect(view.result.current.messages).toEqual([{ role: "user", content: "B" }]);
      expect(view.result.current.recipeRef).toBeNull();
    });

    it("ignores a history response that arrives after a session change", async () => {
      let resolveLate!: (v: Awaited<ReturnType<typeof getLatestConversation>>) => void;
      mockedLatest.mockReturnValue(new Promise((r) => (resolveLate = r)));
      const { result } = await renderHook(() => useChat());

      await act(async () => clearSession());
      await act(async () => resolveLate({ conversation_id: 77, messages: [{ role: "user", content: "otro usuario" }] }));
      expect(result.current.messages).toEqual([]);
      expect(result.current.conversationId).toBeNull();
    });

    it("a stream event after a session change never writes", async () => {
      const stream = controlledStream();
      const { result } = await renderLoadedChat();
      await act(async () => {
        void result.current.send(USER_TEXT);
      });
      await act(async () => clearSession());
      await act(async () => {
        stream.handlers().onDelta("fantasma");
        stream.finish();
      });
      expect(result.current.messages[1].content).toBe("");
    });
    it("a late finally of A while B is sending does not unlock B (no double send)", async () => {
      mockParams = { c: "1" };
      mockedConversation.mockResolvedValue(detail(1, null));
      const streamA = controlledStream();
      const view = await renderLoadedChat();
      await act(async () => {
        void view.result.current.send(USER_TEXT);
      });

      mockParams = { c: "2" };
      mockedConversation.mockResolvedValue(detail(2, null));
      await view.rerender({});
      await waitFor(() => expect(view.result.current.conversationId).toBe(2));

      const streamB = controlledStream();
      await act(async () => {
        void view.result.current.send("pregunta B");
      });
      expect(view.result.current.isLoading).toBe(true);

      await act(async () => streamA.fail(new ChatStreamError("model_busy")));
      expect(view.result.current.isLoading).toBe(true);

      await act(async () => {
        void view.result.current.send("otra");
      });
      expect(mockedStream).toHaveBeenCalledTimes(2);
      await act(async () => streamB.finish());
      expect(view.result.current.isLoading).toBe(false);
    });

    it("a session change aborts the stream and unlocks the composer", async () => {
      controlledStream();
      const { result } = await renderLoadedChat();
      await act(async () => {
        void result.current.send(USER_TEXT);
      });
      const signal = mockedStream.mock.calls[0][2] as AbortSignal;
      await act(async () => clearSession());
      expect(signal.aborted).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it("keeps an assistant bubble that holds only a proposal", async () => {
      const stream = controlledStream();
      const { result } = await renderLoadedChat();
      await act(async () => {
        void result.current.send(USER_TEXT);
      });
      await act(async () =>
        stream.handlers().onRecipe?.({ proposal_id: 8, recipe: { name: "V60", method: "v60" } as never }),
      );
      await act(async () => stream.finish());
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].proposal?.proposal_id).toBe(8);
    });
  });
});
