import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/schema.gen";
import { SseParser } from "@/lib/api/sse";

type Schemas = components["schemas"];

export type ChatMessage = Schemas["StoredMessage"];

/** Generous on purpose: a streamed answer stays open far longer than the client's 30 s default. */
export const chatStreamTimeoutMs = 180_000;

const latestConversationSchema = z.object({
  conversation_id: z.number().int().nullable(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
}) satisfies z.ZodType<Schemas["LatestConversationResponse"]>;

export type LatestConversation = z.infer<typeof latestConversationSchema>;

export async function fetchLatestConversation(): Promise<LatestConversation> {
  const { data } = await apiClient.get("/api/conversations/latest");
  return latestConversationSchema.parse(data);
}

// SSE payloads are not part of the OpenAPI schema, so they are defined here (see backend/README.md).
export const chatErrorCodeSchema = z.enum(["model_busy", "model_unavailable"]);
export type ChatErrorCode = z.infer<typeof chatErrorCodeSchema>;

const chatEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("start"), data: z.object({ conversation_id: z.number().int() }) }),
  z.object({ event: z.literal("delta"), data: z.object({ text: z.string() }) }),
  z.object({ event: z.literal("replace"), data: z.object({ text: z.string() }) }),
  z.object({ event: z.literal("done"), data: z.object({}) }),
  z.object({ event: z.literal("error"), data: z.object({ code: chatErrorCodeSchema }) }),
]);

export type ChatStreamEvent = z.infer<typeof chatEventSchema>;
export type ChatStreamOutcome = { status: "done" } | { status: "error"; code: ChatErrorCode };

/** Thrown when the connection closes before a `done` or `error` event arrives. */
export class ChatStreamIncompleteError extends Error {
  constructor() {
    super("Chat stream ended without a terminal event");
    this.name = "ChatStreamIncompleteError";
  }
}

function toChatEvent(name: string, rawData: string): ChatStreamEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(rawData);
  } catch {
    return null;
  }
  const parsed = chatEventSchema.safeParse({ event: name, data });
  return parsed.success ? parsed.data : null;
}

/**
 * Sends one message and streams the reply. `onEvent` receives every non-terminal event
 * (start, delta, replace) as it arrives. Resolves with the terminal outcome (done / error).
 * Rejects with an AxiosError for pre-stream failures (401/404/422/429 keep their JSON `detail`)
 * and with ChatStreamIncompleteError if the stream closes without a terminal event.
 */
export async function streamChatMessage(
  input: { conversationId: number | null; message: string },
  onEvent: (event: ChatStreamEvent) => void,
): Promise<ChatStreamOutcome> {
  const parser = new SseParser();
  let processed = 0;
  // Held in an object because it is assigned inside closures (keeps TypeScript narrowing honest).
  const state: { outcome: ChatStreamOutcome | null } = { outcome: null };

  function feed(chunk: string) {
    for (const message of parser.push(chunk)) {
      if (state.outcome) return; // nothing after a terminal event matters
      const event = toChatEvent(message.event, message.data);
      if (!event) continue;
      if (event.event === "done") state.outcome = { status: "done" };
      else if (event.event === "error") state.outcome = { status: "error", code: event.data.code };
      else onEvent(event);
    }
  }

  const body: Schemas["ChatRequest"] = { conversation_id: input.conversationId, message: input.message };

  // No `responseType` on purpose: with the default, axios still JSON-parses error bodies
  // (so `detail` reaches getApiErrorMessage) and the XHR keeps `responseText` readable.
  const response = await apiClient.post<unknown>("/api/chat", body, {
    timeout: chatStreamTimeoutMs,
    onDownloadProgress: (progress) => {
      const target = (progress.event as { target?: { responseText?: unknown } } | undefined)?.target;
      const text = target?.responseText;
      if (typeof text !== "string") return;
      feed(text.slice(processed));
      processed = text.length;
    },
  });

  // Progress events are throttled, so whatever arrived since the last one is still unread.
  if (typeof response.data === "string") {
    feed(response.data.slice(processed));
    processed = response.data.length;
  }

  if (!state.outcome) throw new ChatStreamIncompleteError();
  return state.outcome;
}
