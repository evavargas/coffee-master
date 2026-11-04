import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

// These tests run the real axios xhr adapter on top of React Native's real
// XMLHttpRequest. Only the native networking module below it is replaced, so they
// exercise how the two actually interact: throttled progress events, what
// `event.target.responseText` holds, and the error paths.
type Listener = (args: unknown[]) => void;

const mockNetworking = {
  listeners: new Map<string, Set<Listener>>(),
  requests: [] as {
    method: string;
    url: string;
    headers: Record<string, string>;
    data: string;
    responseType: string;
    incrementalUpdates: boolean;
    timeout: number;
  }[],
  abortRequest: jest.fn(),
};

jest.mock("react-native/Libraries/Network/RCTNetworking", () => ({
  __esModule: true,
  default: {
    addListener(name: string, listener: Listener) {
      const listeners = mockNetworking.listeners.get(name) ?? new Set<Listener>();
      listeners.add(listener);
      mockNetworking.listeners.set(name, listeners);
      return { remove: () => listeners.delete(listener) };
    },
    sendRequest(
      method: string,
      _trackingName: unknown,
      url: string,
      headers: Record<string, string>,
      data: string,
      responseType: string,
      incrementalUpdates: boolean,
      timeout: number,
      callback: (requestId: number) => void,
    ) {
      mockNetworking.requests.push({ method, url, headers, data, responseType, incrementalUpdates, timeout });
      callback(REQUEST_ID);
    },
    abortRequest: (...args: unknown[]) => mockNetworking.abortRequest(...args),
    clearCookies: () => undefined,
  },
}));

jest.mock("@/lib/session", () => ({ getToken: jest.fn(async () => "test-token") }));

const REQUEST_ID = 1;
const PROGRESS_THROTTLE_MS = 400;

type ChatModule = typeof import("@/lib/api/chat");
type ClientModule = typeof import("@/lib/api/client");

let chat: ChatModule;
let client: ClientModule;

beforeAll(() => {
  // axios decides whether the xhr adapter exists when it loads, so the global must come first.
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = (
    jest.requireActual("react-native/Libraries/Network/XMLHttpRequest") as { default: unknown }
  ).default;
  chat = require("@/lib/api/chat") as ChatModule;
  client = require("@/lib/api/client") as ClientModule;
});

function emit(name: string, ...args: unknown[]) {
  for (const listener of [...(mockNetworking.listeners.get(name) ?? [])]) listener(args);
}

const receiveHeaders = (status: number, contentType: string) =>
  emit("didReceiveNetworkResponse", REQUEST_ID, status, { "Content-Type": contentType }, "http://test/api/chat");
const receiveChunk = (text: string) => emit("didReceiveNetworkIncrementalData", REQUEST_ID, text, 1, -1);
const complete = (error: string | null = null) => emit("didCompleteNetworkResponse", REQUEST_ID, error, false);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForRequest() {
  while (mockNetworking.requests.length === 0) await wait(1);
  return mockNetworking.requests[0];
}

function startStream(conversationId: number | null = 7) {
  const handlers = { onStart: jest.fn(), onDelta: jest.fn(), onReplace: jest.fn() };
  const promise = chat.streamChat({ conversationId, message: "Hola" }, handlers);
  return { handlers, promise };
}

const sseEvent = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

describe("streamChat over the real React Native XHR", () => {
  beforeEach(() => {
    mockNetworking.listeners.clear();
    mockNetworking.requests.length = 0;
    mockNetworking.abortRequest.mockReset();
  });

  afterEach(() => {
    client.setUnauthorizedHandler(null);
  });

  it("sends only the new message, the bearer token and the long timeout, asking for incremental text", async () => {
    const { promise } = startStream(7);
    const request = await waitForRequest();

    expect(request.method).toBe("POST");
    expect(JSON.parse(request.data)).toEqual({ conversation_id: 7, message: "Hola" });
    // React Native's XHR lowercases header names.
    expect(request.headers.authorization).toBe("Bearer test-token");
    expect(request.timeout).toBe(chat.chatStreamTimeoutMs);
    expect(chat.chatStreamTimeoutMs).toBe(180_000);
    expect(request.responseType).toBe("text");
    expect(request.incrementalUpdates).toBe(true);

    receiveHeaders(200, "text/event-stream");
    receiveChunk(sseEvent("start", { conversation_id: 7 }) + sseEvent("done", {}));
    complete();
    await promise;
  });

  it("delivers deltas while the request is still open, with no event lost to the throttle", async () => {
    const { handlers, promise } = startStream();
    await waitForRequest();
    receiveHeaders(200, "text/event-stream");

    receiveChunk(sseEvent("start", { conversation_id: 7 }));
    expect(handlers.onStart).toHaveBeenCalledWith(7);

    // Arrives inside the throttle window, so it is delivered later by axios's timer.
    receiveChunk(sseEvent("delta", { text: "Hola " }));
    await wait(PROGRESS_THROTTLE_MS);
    expect(handlers.onDelta.mock.calls).toEqual([["Hola "]]);

    // Split mid-event: nothing is delivered until the rest of the event arrives.
    const split = sseEvent("delta", { text: "Ana" });
    receiveChunk(split.slice(0, 12));
    await wait(PROGRESS_THROTTLE_MS);
    expect(handlers.onDelta).toHaveBeenCalledTimes(1);
    receiveChunk(split.slice(12));
    await wait(PROGRESS_THROTTLE_MS);
    expect(handlers.onDelta.mock.calls).toEqual([["Hola "], ["Ana"]]);

    // Pending inside the throttle window when the request completes.
    receiveChunk(sseEvent("replace", { text: "Otra cosa" }) + sseEvent("done", {}));
    receiveChunk("");
    complete();
    await promise;

    expect(handlers.onReplace.mock.calls).toEqual([["Otra cosa"]]);
    expect(handlers.onDelta).toHaveBeenCalledTimes(2);
  });

  it("delivers the whole reply when no progress event ever fires", async () => {
    const { handlers, promise } = startStream();
    await waitForRequest();
    receiveHeaders(200, "text/event-stream");
    // The native non-incremental path sets the text at once, without a progress event.
    emit(
      "didReceiveNetworkData",
      REQUEST_ID,
      sseEvent("start", { conversation_id: 9 }) + sseEvent("delta", { text: "Hola" }) + sseEvent("done", {}),
    );
    complete();
    await promise;

    expect(handlers.onStart).toHaveBeenCalledWith(9);
    expect(handlers.onDelta.mock.calls).toEqual([["Hola"]]);
  });

  it.each(["model_busy", "model_unavailable"] as const)("rejects with the %s stream error", async (code) => {
    const { handlers, promise } = startStream();
    await waitForRequest();
    receiveHeaders(200, "text/event-stream");
    receiveChunk(sseEvent("start", { conversation_id: 7 }) + sseEvent("error", { code }));
    complete();

    await expect(promise).rejects.toMatchObject({ name: "ChatStreamError", code });
    expect(handlers.onStart).toHaveBeenCalledWith(7);
  });

  it("treats a stream with no terminal event as a connection error", async () => {
    const { promise } = startStream();
    await waitForRequest();
    receiveHeaders(200, "text/event-stream");
    receiveChunk(sseEvent("start", { conversation_id: 7 }) + sseEvent("delta", { text: "Hola" }));
    complete();

    await expect(promise).rejects.toMatchObject({ name: "ChatStreamError", code: "connection" });
  });

  it("treats a 200 that is not an event stream as a connection error", async () => {
    const { promise } = startStream();
    await waitForRequest();
    receiveHeaders(200, "application/json");
    receiveChunk('{"reply": "old contract"}');
    complete();

    await expect(promise).rejects.toMatchObject({ name: "ChatStreamError", code: "connection" });
  });

  it("aborts and reports a connection error on a malformed event", async () => {
    const { promise } = startStream();
    await waitForRequest();
    receiveHeaders(200, "text/event-stream");
    receiveChunk("event: delta\ndata: {not json\n\n");

    await expect(promise).rejects.toMatchObject({ name: "ChatStreamError", code: "connection" });
    expect(mockNetworking.abortRequest).toHaveBeenCalled();
  });

  it("rejects when the connection drops mid-stream, ignoring the native error text", async () => {
    const { handlers, promise } = startStream();
    await waitForRequest();
    receiveHeaders(200, "text/event-stream");
    receiveChunk(sseEvent("start", { conversation_id: 7 }));
    // Leaves a throttled progress event pending, which axios flushes during the failure.
    receiveChunk(sseEvent("delta", { text: "Ho" }));
    complete("The network connection was lost.");

    await expect(promise).rejects.toMatchObject({ isAxiosError: true });
    expect(client.getApiErrorMessage(await promise.catch((error: unknown) => error), "fallback")).toBe("fallback");
    expect(handlers.onDelta.mock.calls.flat().join("")).not.toContain("network");
  });

  it("keeps the success when the connection drops after the terminal event", async () => {
    const { promise } = startStream();
    await waitForRequest();
    receiveHeaders(200, "text/event-stream");
    receiveChunk(sseEvent("start", { conversation_id: 7 }) + sseEvent("done", {}));
    complete("The network connection was lost.");

    await expect(promise).resolves.toBeUndefined();
  });

  it.each([
    [401, "Tu sesión venció."],
    [404, "No encontramos esa conversación."],
    [422, "El mensaje no es válido."],
    [429, "Llegaste al límite de mensajes de hoy. Volvé a probar mañana."],
  ])("gives getApiErrorMessage the parsed detail of a %i", async (status, detail) => {
    const onUnauthorized = jest.fn();
    client.setUnauthorizedHandler(onUnauthorized);

    const { handlers, promise } = startStream();
    await waitForRequest();
    receiveHeaders(status, "application/json");
    receiveChunk(JSON.stringify({ detail }));
    complete();

    const error = await promise.catch((rejection: unknown) => rejection);
    expect(client.getApiErrorMessage(error, "fallback")).toBe(detail);
    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });
});
