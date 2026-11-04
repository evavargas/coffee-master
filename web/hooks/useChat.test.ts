import { act, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithIntl } from "@/test/renderHookWithIntl";
import { useChat } from "@/hooks/useChat";
import { ChatStreamIncompleteError, fetchLatestConversation, streamChatMessage, type ChatStreamEvent } from "@/lib/api/chat";
import esMessages from "@/messages/es.json";

vi.mock("@/lib/api/chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/chat")>()),
  fetchLatestConversation: vi.fn(),
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
    expect(streamChatMessage).toHaveBeenCalledWith({ conversationId: null, message: "¿Cómo estás?" }, expect.any(Function));
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
    expect(streamChatMessage).toHaveBeenLastCalledWith({ conversationId: 9, message: "y vos?" }, expect.any(Function));
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

  it("newConversation clears messages and the conversation id", async () => {
    vi.mocked(fetchLatestConversation).mockResolvedValue({
      conversation_id: 5,
      messages: [{ role: "user", content: "hola" }],
    });
    const { result } = await renderLoaded();

    act(() => {
      result.current.newConversation();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.conversationId).toBeNull();
  });

  it("newConversation does nothing while a message is being sent", async () => {
    let finish: () => void = () => {};
    vi.mocked(streamChatMessage).mockImplementationOnce(
      (_input, onEvent: Emit) =>
        new Promise((resolve) => {
          onEvent(start(3));
          finish = () => resolve({ status: "done" });
        }),
    );
    const { result } = await renderLoaded();

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.send("hola");
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    act(() => {
      result.current.newConversation();
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.conversationId).toBe(3);

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isLoading).toBe(false);
  });
});
