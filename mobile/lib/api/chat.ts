import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { exactSchema, type ApiSchemas } from "@/lib/api/contract";
import { createSseParser, type SseEvent } from "@/lib/api/sse";

export type ChatMessage = ApiSchemas["StoredMessage"];

/** Replies can take far longer than the client's default timeout of 30 s. */
export const chatStreamTimeoutMs = 180_000;

export const chatMessageMaxLength = 4000;

const latestConversationSchema = exactSchema<ApiSchemas["LatestConversationResponse"]>()(
  z.object({
    conversation_id: z.number().nullable(),
    messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  }),
);

// SSE payloads are not described by the OpenAPI schema (see backend/README.md, "Chat streaming").
const startEventSchema = z.object({ conversation_id: z.number() });
const textEventSchema = z.object({ text: z.string() });
const errorEventSchema = z.object({ code: z.enum(["model_busy", "model_unavailable"]) });

export type ChatStreamErrorCode = z.infer<typeof errorEventSchema>["code"] | "connection";

/** The stream failed after the 200: the model reported an error, or it ended without a terminal event. */
export class ChatStreamError extends Error {
  readonly code: ChatStreamErrorCode;

  constructor(code: ChatStreamErrorCode) {
    super(`Chat stream failed: ${code}`);
    this.name = "ChatStreamError";
    this.code = code;
  }
}

export interface ChatStreamHandlers {
  onStart: (conversationId: number) => void;
  onDelta: (text: string) => void;
  onReplace: (text: string) => void;
}

export async function getLatestConversation() {
  const { data } = await apiClient.get("/api/conversations/latest");
  return latestConversationSchema.parse(data);
}

/**
 * Sends one message and reports the reply as it streams. Resolves on `done` and
 * rejects with a ChatStreamError, or with the AxiosError of a pre-stream failure.
 *
 * React Native's XHR exposes the text received so far once a `progress` listener
 * is attached, which axios does for `onDownloadProgress`. `responseType` stays
 * unset on purpose: that is what keeps axios parsing JSON error bodies, so
 * `getApiErrorMessage` still gets `detail`.
 */
export async function streamChat(
  input: { conversationId: number | null; message: string },
  handlers: ChatStreamHandlers,
): Promise<void> {
  const parser = createSseParser();
  const controller = new AbortController();
  let consumedLength = 0;
  let outcome: "done" | ChatStreamError | null = null;

  function handleEvent({ event, data }: SseEvent) {
    switch (event) {
      case "start":
        handlers.onStart(startEventSchema.parse(JSON.parse(data)).conversation_id);
        break;
      case "delta":
        handlers.onDelta(textEventSchema.parse(JSON.parse(data)).text);
        break;
      case "replace":
        handlers.onReplace(textEventSchema.parse(JSON.parse(data)).text);
        break;
      case "done":
        outcome = "done";
        break;
      case "error":
        outcome = new ChatStreamError(errorEventSchema.parse(JSON.parse(data)).code);
        break;
    }
  }

  function consume(text: string) {
    if (outcome || text.length <= consumedLength) return;
    const chunk = text.slice(consumedLength);
    consumedLength = text.length;

    for (const event of parser.feed(chunk)) {
      if (outcome) return;
      try {
        handleEvent(event);
      } catch {
        // This can run on axios's throttle timer, where a throw would go uncaught
        // instead of rejecting, so a malformed event ends the request here.
        outcome = new ChatStreamError("connection");
        controller.abort();
      }
    }
  }

  try {
    const response = await apiClient.post<unknown>(
      "/api/chat",
      {
        conversation_id: input.conversationId,
        message: input.message,
      } satisfies ApiSchemas["ChatRequest"],
      {
        timeout: chatStreamTimeoutMs,
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
        onDownloadProgress: ({ event }) => {
          const xhr = event?.target as XMLHttpRequest | null | undefined;
          // Non-200 bodies are JSON errors, and they reach the caller through the rejection.
          if (xhr?.status === 200) consume(xhr.responseText);
        },
      },
    );
    // Progress events are throttled and optional, so the full text is the source of truth.
    if (typeof response.data === "string") consume(response.data);
  } catch (error) {
    // A connection dropped after the terminal event does not change the outcome.
    if (!outcome) throw error;
  }

  if (outcome === "done") return;
  throw outcome ?? new ChatStreamError("connection");
}
