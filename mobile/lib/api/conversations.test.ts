import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createConversation, getConversation, getLatestConversation, listConversations } from "@/lib/api/chat";
import { apiClient } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("@/lib/session", () => ({ onSessionChange: jest.fn() }));

const get = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
const post = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

const proposal = { proposal_id: 4, saved_recipe_id: 9, recipe: { name: "V60", method: "v60", steps: [{ action: "Verter" }] } };

describe("conversation endpoints", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("latest keeps the recipe_ref and the proposals, and defaults the ref to null", async () => {
    get.mockResolvedValueOnce({
      data: {
        conversation_id: 3,
        recipe_ref: { kind: "catalog", ref: "v60-dulce" },
        messages: [{ role: "assistant", content: "hola", proposal }],
      },
    });
    const latest = await getLatestConversation();
    expect(latest.recipe_ref).toEqual({ kind: "catalog", ref: "v60-dulce" });
    expect(latest.messages[0].proposal).toMatchObject({ proposal_id: 4, saved_recipe_id: 9 });

    get.mockResolvedValueOnce({ data: { conversation_id: null, messages: [] } });
    expect((await getLatestConversation()).recipe_ref).toBeNull();
  });

  it("drops a malformed stored proposal but keeps the message text", async () => {
    get.mockResolvedValueOnce({
      data: { id: 3, messages: [{ role: "assistant", content: "texto", proposal: { proposal_id: "x", recipe: null } }] },
    });
    const conversation = await getConversation(3);
    expect(conversation.messages).toEqual([{ role: "assistant", content: "texto" }]);
    expect(get.mock.calls[0][0]).toBe("/api/conversations/3");
  });

  it("passes the abort signal through", async () => {
    const { signal } = new AbortController();
    get.mockResolvedValueOnce({ data: { id: 3, messages: [] } });
    await getConversation(3, signal);
    expect(get.mock.calls[0][1]).toMatchObject({ signal });
  });

  it("lists conversations dropping rows with a bad date or id", async () => {
    get.mockResolvedValueOnce({
      data: {
        total: 4,
        limit: 20,
        offset: 0,
        items: [
          { id: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
          { id: 2, created_at: "nope", updated_at: "2026-01-02T00:00:00Z" },
          { id: "3", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
          { id: 4, recipe_ref: { kind: "user", ref: 8 }, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
        ],
      },
    });
    const page = await listConversations({ limit: 20, offset: 0 });
    expect(page.items.map((i) => i.id)).toEqual([1, 4]);
    expect(page.items[0].recipe_ref).toBeNull();
    expect(page.total).toBe(4);
  });

  it("rejects a list that is not a page", async () => {
    get.mockResolvedValueOnce({ data: { nope: true } });
    await expect(listConversations({ limit: 20, offset: 0 })).rejects.toBeDefined();
  });

  it("creates an empty conversation with no recipe and returns its id", async () => {
    post.mockResolvedValueOnce({ data: { id: 12, messages: [] } });
    await expect(createConversation()).resolves.toBe(12);
    expect(post).toHaveBeenCalledWith("/api/conversations", {});
  });
});
