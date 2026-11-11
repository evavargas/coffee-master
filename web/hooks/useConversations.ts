"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { chatEpoch } from "@/lib/chatEpoch";
import { createConversation, fetchConversations, type ConversationSummary } from "@/lib/api/chat";
import { getApiErrorMessage } from "@/lib/api/client";
import { notifyConversationsChanged, useConversationsVersion } from "@/lib/conversationsStore";

export const conversationsPageSize = 20;

/** Conversation list for the sidebar (newest first, paged) plus "start a new one". Loads only while `enabled` and again when a turn ends. */
export function useConversations(enabled: boolean) {
  const t = useTranslations("chat.switcher");
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
        const page = await fetchConversations({ limit: conversationsPageSize, offset }, mine.signal);
        if (mine.signal.aborted || chatEpoch() !== epoch) return;
        setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items.filter((i) => !prev.some((p) => p.id === i.id))]));
        setTotal(page.total);
        setNextOffset(Math.min(offset + page.limit, page.total));
      } catch (e) {
        if (!mine.signal.aborted && !axios.isCancel(e) && chatEpoch() === epoch) setError(getApiErrorMessage(e, t("loadError")));
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

  const loadMore = () => void load(nextOffset);

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
        router.push(`/chat?c=${id}`);
        return true;
      }
    } catch (e) {
      if (chatEpoch() === epoch) setCreateError(getApiErrorMessage(e, t("createError")));
    } finally {
      creating.current = false;
      setIsCreating(false);
    }
    return false;
  }

  return { items, isLoading, error, createError, isCreating, hasMore: nextOffset < total, loadMore, retry: () => void load(0), startNew };
}
