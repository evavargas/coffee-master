import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { chatStreamTimeoutMs, ChatStreamIncompleteError, fetchConversations, fetchLatestConversation, streamChatMessage, type ChatStreamEvent } from "@/lib/api/chat";
import { apiClient, getApiErrorMessage } from "@/lib/api/client";

const originalAdapter = apiClient.defaults.adapter;

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Fake transport: reports progress with the accumulated text (like the XHR does), then resolves with the full body. */
function streamingAdapter(chunks: string[], captured?: { config?: InternalAxiosRequestConfig }): AxiosAdapter {
  return async (config) => {
    if (captured) captured.config = config;
    let accumulated = "";
    for (const chunk of chunks) {
      accumulated += chunk;
      (config.onDownloadProgress as ((p: unknown) => void) | undefined)?.({
        event: { target: { responseText: accumulated } },
      });
    }
    return { data: accumulated, status: 200, statusText: "OK", headers: {}, config };
  };
}

function failingAdapter(status: number, body: unknown): AxiosAdapter {
  return async (config) => {
    const response = { data: JSON.stringify(body), status, statusText: "", headers: {}, config };
    throw new AxiosError("Request failed", String(status), config, undefined, response);
  };
}

async function run(chunks: string[], captured?: { config?: InternalAxiosRequestConfig }) {
  apiClient.defaults.adapter = streamingAdapter(chunks, captured);
  const events: ChatStreamEvent[] = [];
  const outcome = await streamChatMessage({ conversationId: null, message: "hola" }, (e) => events.push(e));
  return { events, outcome };
}

describe("streamChatMessage", () => {
  beforeEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it("delivers events in order, even split mid-event, and ends with done", async () => {
    const full = sse("start", { conversation_id: 7 }) + sse("delta", { text: "Ho" }) + sse("delta", { text: "la" }) + sse("done", {});
    const { events, outcome } = await run([full.slice(0, 20), full.slice(20, 75), full.slice(75)]);

    expect(events.map((e) => e.event)).toEqual(["start", "delta", "delta"]);
    expect(events[0].data).toEqual({ conversation_id: 7 });
    expect(outcome).toEqual({ status: "done" });
  });

  it("processes events that only arrive in the final response text (throttled progress)", async () => {
    apiClient.defaults.adapter = async (config) => {
      const first = sse("start", { conversation_id: 1 });
      (config.onDownloadProgress as (p: unknown) => void)({ event: { target: { responseText: first } } });
      const all = first + sse("delta", { text: "x" }) + sse("done", {});
      return { data: all, status: 200, statusText: "OK", headers: {}, config };
    };
    const events: ChatStreamEvent[] = [];
    const outcome = await streamChatMessage({ conversationId: null, message: "hola" }, (e) => events.push(e));

    expect(events.map((e) => e.event)).toEqual(["start", "delta"]);
    expect(outcome).toEqual({ status: "done" });
  });

  it("returns the error code from a terminal error event", async () => {
    const { outcome } = await run([sse("start", { conversation_id: 1 }), sse("error", { code: "model_busy" })]);
    expect(outcome).toEqual({ status: "error", code: "model_busy" });
  });

  it("throws ChatStreamIncompleteError when the stream ends without a terminal event", async () => {
    await expect(run([sse("start", { conversation_id: 1 }), sse("delta", { text: "a" })])).rejects.toBeInstanceOf(
      ChatStreamIncompleteError,
    );
  });

  it("sends only the new message and conversation id, with the long stream timeout", async () => {
    const captured: { config?: InternalAxiosRequestConfig } = {};
    await run([sse("done", {})], captured);

    expect(JSON.parse(captured.config?.data as string)).toEqual({ conversation_id: null, message: "hola" });
    expect(captured.config?.timeout).toBe(chatStreamTimeoutMs);
    expect(chatStreamTimeoutMs).toBe(180_000);
  });

  it.each([401, 404, 422, 429])("keeps the parsed JSON detail for a %i before the stream", async (status) => {
    apiClient.defaults.adapter = failingAdapter(status, { detail: "Mensaje del servidor" });
    const error = await streamChatMessage({ conversationId: 3, message: "hola" }, () => {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AxiosError);
    expect(getApiErrorMessage(error, "fallback")).toBe("Mensaje del servidor");
  });
});

describe("streamChatMessage recipe event", () => {
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  const recipe = { name: "V60 dulce", method: "v60", steps: [{ action: "Verter" }], extra_field: 1 };

  it("delivers a valid recipe event between the last delta and done", async () => {
    const { events, outcome } = await run([sse("start", { conversation_id: 1 }), sse("delta", { text: "x" }), sse("recipe", { proposal_id: 4, recipe }), sse("done", {})]);
    expect(events.map((e) => e.event)).toEqual(["start", "delta", "recipe"]);
    expect(events[2].data).toEqual({ proposal_id: 4, recipe });
    expect(outcome).toEqual({ status: "done" });
  });

  it.each([
    ["no proposal id", { recipe }],
    ["a non-integer proposal id", { proposal_id: "4", recipe }],
    ["a recipe without a name", { proposal_id: 4, recipe: { method: "v60" } }],
  ])("ignores a malformed recipe event (%s) without breaking the stream", async (_label, payload) => {
    const { events, outcome } = await run([sse("start", { conversation_id: 1 }), sse("recipe", payload), sse("delta", { text: "x" }), sse("done", {})]);
    expect(events.map((e) => e.event)).toEqual(["start", "delta"]);
    expect(outcome).toEqual({ status: "done" });
  });

  it("ignores a recipe event with invalid JSON", async () => {
    const { events, outcome } = await run(["event: recipe\ndata: {oops\n\n", sse("done", {})]);
    expect(events).toEqual([]);
    expect(outcome).toEqual({ status: "done" });
  });
});
