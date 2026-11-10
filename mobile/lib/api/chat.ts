import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import type { ApiSchemas } from "@/lib/api/contract";
import type { RecipeData } from "@/lib/api/recipes";
import { createSseParser, type SseEvent } from "@/lib/api/sse";
import { conversationCreatedSchema } from "@/lib/schemas/recipes";

export type ChatMessage = ApiSchemas["StoredMessage"];

/** Replies can take far longer than the client's default timeout of 30 s. */
export const chatStreamTimeoutMs = 180_000;

export const chatMessageMaxLength = 4000;

/** Every field the proposal card dereferences is tolerant: a wrong shape degrades to "absent" instead of crashing the chat. */
const rangeSchema = z.object({ min: z.number(), max: z.number().nullish() }).loose().nullish().catch(null);
const proposalRecipeSchema = z
  .object({
    name: z.string(),
    method: z.string(),
    steps: z.array(z.object({ action: z.string() }).loose()).catch([]),
    coffee: z.object({ name: z.string().nullish().catch(null) }).loose().nullish().catch(null),
    dose_g: rangeSchema,
    water_g: rangeSchema,
    temperature_c: rangeSchema,
    brew_time_seconds: rangeSchema,
    ratio: z.number().nullish().catch(null),
  })
  .loose()
  .transform((r) => r as unknown as RecipeData);
export const recipeProposalSchema = z.object({ proposal_id: z.number().int(), recipe: proposalRecipeSchema });
export type RecipeProposalEvent = z.infer<typeof recipeProposalSchema>;

/** A malformed proposal on a stored message is dropped; the text of the message still shows. */
const storedMessageSchema = z
  .object({ role: z.enum(["user", "assistant"]), content: z.string(), proposal: z.unknown().optional() })
  .transform((m): ChatMessage => {
    const proposal = recipeProposalSchema.extend({ saved_recipe_id: z.number().int().nullish() }).safeParse(m.proposal);
    const base = { role: m.role, content: m.content };
    return proposal.success
      ? { ...base, proposal: { ...proposal.data, saved_recipe_id: proposal.data.saved_recipe_id ?? null } }
      : base;
  });

const recipeRefSchema = z.object({ kind: z.enum(["catalog", "user"]), ref: z.union([z.string(), z.number()]) });
export type RecipeRef = z.infer<typeof recipeRefSchema>;

const latestConversationSchema = z.object({
  conversation_id: z.number().int().nullable(),
  messages: z.array(storedMessageSchema),
  recipe_ref: recipeRefSchema.nullish().catch(null),
}) satisfies z.ZodType<ApiSchemas["LatestConversationResponse"]>;

export type LatestConversation = { conversation_id: number | null; messages: ChatMessage[]; recipe_ref?: RecipeRef | null };

const conversationDetailSchema = z.object({
  id: z.number().int(),
  messages: z.array(storedMessageSchema),
  recipe_ref: recipeRefSchema.nullish().catch(null),
});
export type ConversationDetail = { id: number; messages: ChatMessage[]; recipe_ref: RecipeRef | null };

const validDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)));
const conversationSummarySchema = z.object({
  id: z.number().int(),
  recipe_ref: recipeRefSchema.nullish().catch(null),
  // A date that does not parse would throw in Intl formatting, so such a row is dropped.
  created_at: validDate,
  updated_at: validDate,
});
export type ConversationSummary = { id: number; recipe_ref: RecipeRef | null; created_at: string; updated_at: string };

export interface ConversationPage {
  items: ConversationSummary[];
  total: number;
  limit: number;
  offset: number;
}

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
  onRecipe?: (proposal: RecipeProposalEvent) => void;
}

export async function getLatestConversation(signal?: AbortSignal): Promise<LatestConversation> {
  const { data } = await apiClient.get("/api/conversations/latest", { signal });
  const parsed = latestConversationSchema.parse(data);
  return { ...parsed, recipe_ref: parsed.recipe_ref ?? null };
}

export async function getConversation(id: number, signal?: AbortSignal): Promise<ConversationDetail> {
  const { data } = await apiClient.get(`/api/conversations/${id}`, { signal });
  const parsed = conversationDetailSchema.parse(data);
  return { ...parsed, recipe_ref: parsed.recipe_ref ?? null };
}

/** Malformed items are dropped so one bad row never takes the list down. */
export async function listConversations(
  { limit, offset }: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<ConversationPage> {
  const { data } = await apiClient.get<unknown>("/api/conversations", { params: { limit, offset }, signal });
  const page = z
    .object({ items: z.array(z.unknown()), total: z.number(), limit: z.number(), offset: z.number() })
    .parse(data);
  const items = page.items.flatMap((raw) => {
    const r = conversationSummarySchema.safeParse(raw);
    return r.success ? [{ ...r.data, recipe_ref: r.data.recipe_ref ?? null }] : [];
  });
  return { ...page, items };
}

/** Creates an empty conversation (no recipe) and returns its id. */
export async function createConversation(): Promise<number> {
  const { data } = await apiClient.post<unknown>("/api/conversations", {});
  return conversationCreatedSchema.parse(data).id;
}

/**
 * Sends one message and reports the reply as it streams. Resolves on `done` and
 * rejects with a ChatStreamError, or with the AxiosError of a pre-stream failure.
 *
 * `signal` aborts the request (conversation switch, unmount); the call then rejects with the axios cancel error.
 *
 * React Native's XHR exposes the text received so far once a `progress` listener
 * is attached, which axios does for `onDownloadProgress`. `responseType` stays
 * unset on purpose: that is what keeps axios parsing JSON error bodies, so
 * `getApiErrorMessage` still gets `detail`.
 */
export async function streamChat(
  input: { conversationId: number | null; message: string },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
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
      case "recipe": {
        // A malformed proposal only loses the card; the reply text and the stream carry on.
        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch {
          break;
        }
        const proposal = recipeProposalSchema.safeParse(payload);
        if (proposal.success) handlers.onRecipe?.(proposal.data);
        break;
      }
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

  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller);

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
  } finally {
    signal?.removeEventListener("abort", abortFromCaller);
  }

  if (outcome === "done") return;
  throw outcome ?? new ChatStreamError("connection");
}
