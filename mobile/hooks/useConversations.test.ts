import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { conversationsPageSize, useConversations } from "@/hooks/useConversations";
import es from "@/i18n/locales/es.json";
import { createConversation, listConversations, type ConversationPage } from "@/lib/api/chat";
import { clearSession } from "@/lib/session";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: mockNavigate }) }));
jest.mock("@/lib/api/chat", () => ({ listConversations: jest.fn(), createConversation: jest.fn() }));

const mList = listConversations as jest.MockedFunction<typeof listConversations>;
const mCreate = createConversation as jest.MockedFunction<typeof createConversation>;

const item = (id: number) => ({ id, recipe_ref: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", preview: null });
const page = (ids: number[], offset: number, total: number): ConversationPage => ({
  items: ids.map(item),
  total,
  limit: conversationsPageSize,
  offset,
});

describe("useConversations", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mList.mockReset();
    mCreate.mockReset();
  });

  it("does not load until enabled, then lists newest first", async () => {
    mList.mockResolvedValue(page([3, 2, 1], 0, 3));
    const view = await renderHook(({ on }: { on: boolean }) => useConversations(on), { initialProps: { on: false } });
    expect(mList).not.toHaveBeenCalled();
    await view.rerender({ on: true });
    await waitFor(() => expect(view.result.current.items.map((i) => i.id)).toEqual([3, 2, 1]));
    expect(view.result.current.hasMore).toBe(false);
  });

  it("pages with the server offset and dedupes by id", async () => {
    mList.mockResolvedValueOnce(page([5, 4], 0, 25)).mockResolvedValueOnce(page([4, 3], conversationsPageSize, 25));
    const { result } = await renderHook(() => useConversations(true));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual([5, 4, 3]));
    expect(mList.mock.calls[1][0]).toEqual({ limit: conversationsPageSize, offset: conversationsPageSize });
    expect(result.current.hasMore).toBe(false);
  });

  it("shows a load error and retries", async () => {
    mList.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(page([1], 0, 1));
    const { result } = await renderHook(() => useConversations(true));
    await waitFor(() => expect(result.current.error).toBe(es.chat.switcher.loadError));
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });

  it("aborts the request when disabled and ignores a response after a session change", async () => {
    let resolve!: (p: ConversationPage) => void;
    mList.mockReturnValue(new Promise((r) => (resolve = r)));
    const view = await renderHook(({ on }: { on: boolean }) => useConversations(on), { initialProps: { on: true } });
    const signal = mList.mock.calls[0][1] as AbortSignal;
    await act(async () => clearSession());
    await act(async () => resolve(page([9], 0, 1)));
    expect(view.result.current.items).toEqual([]);
    await view.rerender({ on: false });
    expect(signal.aborted).toBe(true);
  });

  it("opens a conversation by id, clearing the intent", async () => {
    mList.mockResolvedValue(page([], 0, 0));
    const { result } = await renderHook(() => useConversations(false));
    await act(async () => result.current.open(7));
    expect(mockNavigate).toHaveBeenCalledWith("/(tabs)/chat?c=7");
  });

  it("creates a conversation once and opens it by id (it is not 'latest' yet)", async () => {
    let resolve!: (id: number) => void;
    mCreate.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useConversations(false));
    await act(async () => {
      void result.current.startNew();
      void result.current.startNew();
    });
    expect(result.current.isCreating).toBe(true);
    await act(async () => resolve(44));
    expect(mCreate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/(tabs)/chat?c=44");
    expect(result.current.isCreating).toBe(false);
  });

  it("reports a create error, and does not navigate after a session change", async () => {
    mCreate.mockRejectedValueOnce(new Error("x"));
    const { result } = await renderHook(() => useConversations(false));
    await act(async () => result.current.startNew());
    expect(result.current.createError).toBe(es.chat.switcher.createError);

    let resolve!: (id: number) => void;
    mCreate.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await act(async () => {
      void result.current.startNew();
    });
    await act(async () => clearSession());
    await act(async () => resolve(5));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
