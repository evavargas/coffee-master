import { act, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession } from "@/lib/session";
import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useChat } from "@/hooks/useChat";
import { ChatStreamIncompleteError, fetchConversation, fetchLatestConversation, streamChatMessage, type ChatStreamEvent } from "@/lib/api/chat";
import esMessages from "@/messages/es.json";

vi.mock("@/lib/api/chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/chat")>()),
  fetchLatestConversation: vi.fn(),
  fetchConversation: vi.fn(),
  streamChatMessage: vi.fn(),
}));

type Emit = (event: ChatStreamEvent) => void;

const start = (id: number): ChatStreamEvent => ({ event: "start", data: { conversation_id: id } });
const delta = (text: string): ChatStreamEvent => ({ event: "delta", data: { text } });
const replace = (text: string): ChatStreamEvent => ({ event: "replace", data: { text } });

/** Makes the next stream emit `events` and then settle with `outcome` (or reject). */
function mockStream(events: ChatStreamEvent[], outcome: Awaited<ReturnType<typeof streamChatMessage>> | Error) {
  vi.mocked(streamChatMessage).mockImplementationOnce(async (_input, onEvent: Emit) => {
    events.forEach(onEvent);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
}

async function renderLoaded() {
  const hook = renderHookWithIntl(() => useChat());
  await waitFor(() => expect(hook.result.current.isLoadingHistory).toBe(false));
  return hook;
}

describe("useChat", () => {
  beforeEach(() => {
    vi.mocked(fetchLatestConversation).mockReset().mockResolvedValue({ conversation_id: null, messages: [] });
    vi.mocked(streamChatMessage).mockReset();
  });

  it("loads the latest conversation on mount", async () => {
    vi.mocked(fetchLatestConversation).mockResolvedValue({
      conversation_id: 5,
      messages: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "¡Hola!" },
      ],
    });

    const { result } = renderHookWithIntl(() => useChat());
    expect(result.current.isLoadingHistory).toBe(true);
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false));

    expect(result.current.conversationId).toBe(5);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("shows an error but stays usable when the history fails to load", async () => {
    vi.mocked(fetchLatestConversation).mockRejectedValue(new AxiosError("Network Error"));
    mockStream([start(1), delta("ok")], { status: "done" });

    const { result } = await renderLoaded();
    expect(result.current.error).toBe(esMessages.chat.historyError);
    expect(result.current.messages).toEqual([]);

    await act(async () => {
      await result.current.send("hola");
    });
    expect(result.current.messages.at(-1)).toEqual({ role: "assistant", content: "ok" });
    expect(result.current.error).toBeNull();
  });

  it("grows the assistant bubble with deltas, stores the conversation id and posts only the new message", async () => {
    mockStream([start(9), delta("Ho"), delta("la")], { status: "done" });
    const { result } = await renderLoaded();

    let sendResult: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      sendResult = await result.current.send("  ¿Cómo estás?  ");
    });

    expect(sendResult).toEqual({ ok: true });
    expect(streamChatMessage).toHaveBeenCalledWith({ conversationId: null, message: "¿Cómo estás?" }, expect.any(Function), expect.any(AbortSignal));
    expect(result.current.messages).toEqual([
      { role: "user", content: "¿Cómo estás?" },
      { role: "assistant", content: "Hola" },
    ]);
    expect(result.current.conversationId).toBe(9);
    expect(result.current.isLoading).toBe(false);

    mockStream([delta("Bien")], { status: "done" });
    await act(async () => {
      await result.current.send("y vos?");
    });
    expect(streamChatMessage).toHaveBeenLastCalledWith({ conversationId: 9, message: "y vos?" }, expect.any(Function), expect.any(AbortSignal));
  });

  it("replaces the whole assistant bubble on a replace event", async () => {
    mockStream([start(1), delta("texto malo"), replace("texto seguro")], { status: "done" });
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.send("hola");
    });

    expect(result.current.messages.at(-1)).toEqual({ role: "assistant", content: "texto seguro" });
  });

  it.each([
    ["model_busy", esMessages.chat.errors.modelBusy],
    ["model_unavailable", esMessages.chat.errors.modelUnavailable],
  ] as const)("on error event %s removes both bubbles, restores the text and shows the message", async (code, message) => {
    mockStream([start(4), delta("parcial")], { status: "error", code });
    const { result } = await renderLoaded();

    let sendResult: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      sendResult = await result.current.send("mi pregunta");
    });

    expect(sendResult).toEqual({ ok: false, text: "mi pregunta" });
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversationId).toBe(4);
    expect(result.current.error).toBe(message);
    expect(result.current.isLoading).toBe(false);
  });

  it("on transport failure removes both bubbles and restores the text with the backend detail", async () => {
    const response = { status: 429, data: { detail: "Demasiadas consultas." }, headers: {}, statusText: "", config: {} } as unknown as AxiosResponse;
    mockStream([], new AxiosError("Too many", "429", undefined, undefined, response));
    const { result } = await renderLoaded();

    let sendResult: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      sendResult = await result.current.send("pregunta");
    });

    expect(sendResult).toEqual({ ok: false, text: "pregunta" });
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBe("Demasiadas consultas.");
  });

  it("treats a stream with no terminal event as a connection error", async () => {
    mockStream([start(2), delta("a")], new ChatStreamIncompleteError());
    const { result } = await renderLoaded();

    let sendResult: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      sendResult = await result.current.send("pregunta");
    });

    expect(sendResult).toEqual({ ok: false, text: "pregunta" });
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBe(esMessages.chat.errors.connection);
  });

  it("keeps earlier messages when a later send fails", async () => {
    mockStream([start(1), delta("r1")], { status: "done" });
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.send("p1");
    });
    mockStream([], { status: "error", code: "model_busy" });
    await act(async () => {
      await result.current.send("p2");
    });

    expect(result.current.messages).toEqual([
      { role: "user", content: "p1" },
      { role: "assistant", content: "r1" },
    ]);
    expect(result.current.conversationId).toBe(1);
  });

  it("does not call the API for blank input", async () => {
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.send("   ");
    });
    expect(streamChatMessage).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });
});

describe("useChat recipe proposals", () => {
  beforeEach(() => {
    vi.mocked(fetchLatestConversation).mockReset().mockResolvedValue({ conversation_id: null, messages: [] });
    vi.mocked(streamChatMessage).mockReset();
  });

  it("attaches a streamed recipe event to the assistant message and keeps it through replace", async () => {
    const recipeEvent: ChatStreamEvent = { event: "recipe", data: { proposal_id: 6, recipe: { name: "R", method: "v60" } } };
    mockStream([start(1), delta("hola"), recipeEvent, replace("hola!")], { status: "done" });
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.send("receta");
    });
    expect(result.current.messages.at(-1)).toMatchObject({ content: "hola!", proposal: { proposal_id: 6, saved_recipe_id: null } });
  });
});

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));

describe("useChat conversation switching and edge cases", () => {
  beforeEach(() => {
    search = "";
    vi.mocked(fetchLatestConversation).mockReset().mockResolvedValue({ conversation_id: null, messages: [] });
    vi.mocked(fetchConversation).mockReset();
    vi.mocked(streamChatMessage).mockReset();
  });

  it("a recipe event before any delta still attaches to the assistant message", async () => {
    const recipeEvent: ChatStreamEvent = { event: "recipe", data: { proposal_id: 2, recipe: { name: "R", method: "v60" } } };
    mockStream([start(1), recipeEvent, delta("texto")], { status: "done" });
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.send("x");
    });
    expect(result.current.messages.at(-1)).toMatchObject({ content: "texto", proposal: { proposal_id: 2 } });
  });

  it("shows conversationNotFound when ?c answers 404 and offers no opening prompt", async () => {
    search = "c=9&intent=ask";
    vi.mocked(fetchConversation).mockRejectedValue(new AxiosError("x", "404", undefined, undefined, { status: 404, data: {} } as AxiosResponse));
    const { result } = await renderLoaded();
    expect(result.current.error).toBe(esMessages.chat.conversationNotFound);
    expect(result.current.intent).toBeNull();
  });

  it.each(["0x10", "1e3", "-1", "1.5", "abc", "0"])("ignores ?c=%s and opens the latest conversation", async (c) => {
    search = `c=${c}`;
    vi.mocked(fetchLatestConversation).mockResolvedValue({ conversation_id: 4, messages: [], recipe_ref: null });
    await renderLoaded();
    expect(fetchConversation).not.toHaveBeenCalled();
    expect(fetchLatestConversation).toHaveBeenCalled();
  });

  it("exposes recipe_ref and intent from a loaded ?c conversation and from /latest", async () => {
    search = "c=3&intent=ask";
    vi.mocked(fetchConversation).mockResolvedValue({ id: 3, messages: [], recipe_ref: { kind: "catalog", ref: "a" } });
    const first = await renderLoaded();
    expect(first.result.current.recipeRef).toEqual({ kind: "catalog", ref: "a" });
    expect(first.result.current.intent).toBe("ask");

    search = "";
    vi.mocked(fetchLatestConversation).mockResolvedValue({ conversation_id: 4, messages: [], recipe_ref: { kind: "user", ref: 7 } });
    const second = await renderLoaded();
    expect(second.result.current.recipeRef).toEqual({ kind: "user", ref: 7 });
  });

  it("switching conversation mid-stream aborts it: nothing from A reaches B and B can send", async () => {
    search = "c=1";
    vi.mocked(fetchConversation).mockImplementation(async (id) => ({ id, messages: [], recipe_ref: null }));
    let emitA: Emit = () => {};
    let signalA: AbortSignal | undefined;
    vi.mocked(streamChatMessage).mockImplementationOnce(
      (_input, onEvent: Emit, signal) =>
        new Promise((_resolve, reject) => {
          emitA = onEvent;
          signalA = signal;
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const hook = renderHookWithIntl(() => useChat());
    await waitFor(() => expect(hook.result.current.isLoadingHistory).toBe(false));
    act(() => void hook.result.current.send("pregunta A"));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(true));

    search = "c=2";
    hook.rerender();
    await waitFor(() => expect(hook.result.current.conversationId).toBe(2));
    expect(signalA?.aborted).toBe(true);
    await act(async () => emitA(delta("fuga de A")));
    expect(hook.result.current.messages).toEqual([]);
    expect(hook.result.current.isLoading).toBe(false);

    mockStream([delta("B")], { status: "done" });
    await act(async () => {
      await hook.result.current.send("pregunta B");
    });
    expect(hook.result.current.messages.map((m) => m.content)).toEqual(["pregunta B", "B"]);
  });

  it("a superseded send's finally does not reset isLoading of the newer send", async () => {
    let rejectA: (e: Error) => void = () => {};
    vi.mocked(streamChatMessage).mockImplementationOnce(() => new Promise((_r, reject) => (rejectA = reject)));
    const { result } = await renderLoaded();
    act(() => void result.current.send("a"));
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    act(() => clearSession()); // session change supersedes the first send
    await act(async () => rejectA(new Error("late")));
    // The finally of the superseded send ran but must not have touched the flags.
    expect(result.current.isLoading).toBe(true);
  });
});
