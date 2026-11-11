import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { createConversation, listConversations, type ConversationSummary } from "@/lib/api/chat";
import { getApiErrorMessage } from "@/lib/api/client";
import { chatEpoch } from "@/lib/chatEpoch";
import { notifyConversationsChanged, useConversationsVersion } from "@/lib/conversationsStore";

export const conversationsPageSize = 20;

/** Conversation list for the side panel (newest first, paged) plus open/start-new. Loads only while `enabled` and again when a turn ends. */
export function useConversations(enabled: boolean) {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useConversationsVersion();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  // Next offset comes from the server page (raw count, malformed rows included), not from items.length.
  const [nextOffset, setNextOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const creating = useRef(false);

  const load = useCallback(
    async (offset: number) => {
      controller.current?.abort();
      const mine = new AbortController();
      controller.current = mine;
      const epoch = chatEpoch();
      setIsLoading(true);
      setError(null);
      try {
        const page = await listConversations({ limit: conversationsPageSize, offset }, mine.signal);
        if (mine.signal.aborted || chatEpoch() !== epoch) return;
        setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items.filter((i) => !prev.some((p) => p.id === i.id))]));
        setTotal(page.total);
        setNextOffset(Math.min(offset + page.limit, page.total));
      } catch (e) {
        if (!mine.signal.aborted && !axios.isCancel(e) && chatEpoch() === epoch) {
          setError(getApiErrorMessage(e, t("chat.switcher.loadError")));
        }
      } finally {
        if (!mine.signal.aborted) setIsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!enabled) return;
    void load(0);
    return () => controller.current?.abort();
  }, [enabled, load, version]);

  // Works from any tab. Leaving `intent` out of the URL keeps the opening prompt of a previous recipe from following the user.
  const open = (id: number) => router.navigate(`/(tabs)/chat?c=${id}`);

  /** Creates and opens a new conversation. Resolves true when it was created (the caller may close its menu). */
  async function startNew(): Promise<boolean> {
    if (creating.current) return false;
    creating.current = true;
    const epoch = chatEpoch();
    setIsCreating(true);
    setCreateError(null);
    try {
      const id = await createConversation();
      if (chatEpoch() === epoch) {
        notifyConversationsChanged();
        open(id);
        return true;
      }
    } catch (e) {
      if (chatEpoch() === epoch) setCreateError(getApiErrorMessage(e, t("chat.switcher.createError")));
    } finally {
      creating.current = false;
      setIsCreating(false);
    }
    return false;
  }

  return {
    items,
    isLoading,
    error,
    createError,
    isCreating,
    hasMore: nextOffset < total,
    loadMore: () => void load(nextOffset),
    retry: () => void load(0),
    open,
    startNew,
  };
}
