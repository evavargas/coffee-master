import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import type { RecipeData } from "@/lib/api/recipes";
import type { components } from "@/lib/api/schema.gen";
import { conversationCreatedSchema } from "@/lib/schemas/recipes";
import { SseParser } from "@/lib/api/sse";

type Schemas = components["schemas"];

export type ChatMessage = Schemas["StoredMessage"];

/** Generous on purpose: a streamed answer stays open far longer than the client's 30 s default. */
export const chatStreamTimeoutMs = 180_000;

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
const storedMessageSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string(), proposal: z.unknown().optional() }).transform((m): ChatMessage => {
  const proposal = recipeProposalSchema.extend({ saved_recipe_id: z.number().int().nullish() }).safeParse(m.proposal);
  const base = { role: m.role, content: m.content };
  return proposal.success ? { ...base, proposal: { ...proposal.data, saved_recipe_id: proposal.data.saved_recipe_id ?? null } } : base;
});

const recipeRefSchema = z.object({ kind: z.enum(["catalog", "user"]), ref: z.union([z.string(), z.number()]) });
export type RecipeRef = z.infer<typeof recipeRefSchema>;

const latestConversationSchema = z.object({
  conversation_id: z.number().int().nullable(),
  messages: z.array(storedMessageSchema),
  recipe_ref: recipeRefSchema.nullish().catch(null),
}) satisfies z.ZodType<Schemas["LatestConversationResponse"]>;

export type LatestConversation = { conversation_id: number | null; messages: ChatMessage[]; recipe_ref?: RecipeRef | null };

export async function fetchLatestConversation(signal?: AbortSignal): Promise<LatestConversation> {
  const { data } = await apiClient.get("/api/conversations/latest", { signal });
  const parsed = latestConversationSchema.parse(data);
  return { ...parsed, recipe_ref: parsed.recipe_ref ?? null };
}

const conversationDetailSchema = z.object({
  id: z.number().int(),
  messages: z.array(storedMessageSchema),
  recipe_ref: recipeRefSchema.nullish().catch(null),
});
export type ConversationDetail = { id: number; messages: ChatMessage[]; recipe_ref: RecipeRef | null };

export async function fetchConversation(id: number, signal?: AbortSignal): Promise<ConversationDetail> {
  const { data } = await apiClient.get(`/api/conversations/${id}`, { signal });
  const parsed = conversationDetailSchema.parse(data);
  return { ...parsed, recipe_ref: parsed.recipe_ref ?? null };
}

const conversationSummarySchema = z.object({
  id: z.number().int(),
  recipe_ref: recipeRefSchema.nullish().catch(null),
  // A date that does not parse would throw in Intl formatting, so such a row is dropped.
  created_at: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
  updated_at: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
  preview: z.string().nullish().catch(null),
});
export type ConversationSummary = {
  id: number;
  recipe_ref: RecipeRef | null;
  created_at: string;
  updated_at: string;
  /** First user message, shortened by the server. Plain text. */
  preview: string | null;
};

export interface ConversationPage {
  items: ConversationSummary[];
  total: number;
  limit: number;
  offset: number;
}

/** Malformed items are dropped so one bad row never takes the list down. */
export async function fetchConversations({ limit, offset }: { limit: number; offset: number }, signal?: AbortSignal): Promise<ConversationPage> {
  const { data } = await apiClient.get<unknown>("/api/conversations", { params: { limit, offset }, signal });
  const page = z.object({ items: z.array(z.unknown()), total: z.number(), limit: z.number(), offset: z.number() }).parse(data);
  const items = page.items.flatMap((raw) => {
    const r = conversationSummarySchema.safeParse(raw);
    return r.success ? [{ ...r.data, recipe_ref: r.data.recipe_ref ?? null, preview: r.data.preview ?? null }] : [];
  });
  return { ...page, items };
}

/** Creates an empty conversation (no recipe) and returns its id. */
export async function createConversation(): Promise<number> {
  const { data } = await apiClient.post<unknown>("/api/conversations", {});
  return conversationCreatedSchema.parse(data).id;
}

// SSE payloads are not part of the OpenAPI schema, so they are defined here (see backend/README.md).
export const chatErrorCodeSchema = z.enum(["model_busy", "model_unavailable"]);
export type ChatErrorCode = z.infer<typeof chatErrorCodeSchema>;

const chatEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("start"), data: z.object({ conversation_id: z.number().int() }) }),
  z.object({ event: z.literal("delta"), data: z.object({ text: z.string() }) }),
  z.object({ event: z.literal("replace"), data: z.object({ text: z.string() }) }),
  z.object({ event: z.literal("recipe"), data: recipeProposalSchema }),
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
 * (start, delta, replace, recipe) as it arrives. Resolves with the terminal outcome (done / error).
 * Rejects with an AxiosError for pre-stream failures (401/404/422/429 keep their JSON `detail`)
 * and with ChatStreamIncompleteError if the stream closes without a terminal event.
 */
export async function streamChatMessage(
  input: { conversationId: number | null; message: string },
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
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
    signal,
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
