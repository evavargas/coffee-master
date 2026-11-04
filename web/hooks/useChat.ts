"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  fetchLatestConversation,
  streamChatMessage,
  ChatStreamIncompleteError,
  type ChatErrorCode,
  type ChatMessage,
} from "@/lib/api/chat";
import { getApiErrorMessage } from "@/lib/api/client";

/** `ok: false` carries the text so the caller can put it back in the input. */
export type SendResult = { ok: true } | { ok: false; text: string };

/**
 * Chat state. The server keeps the history: on mount we load the latest conversation, and each
 * send posts only the new message plus the current conversation id. The reply streams in as
 * deltas into the last (assistant) message.
 */
export function useChat() {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchLatestConversation()
      .then((latest) => {
        if (cancelled) return;
        setConversationId(latest.conversation_id);
        setMessages(latest.messages);
      })
      .catch(() => {
        // The chat stays usable (a new conversation will start) when history cannot be loaded.
        if (!cancelled) setError(t("historyError"));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
    // Load once on mount; `t` only changes with the locale.
  }, []);

  const errorMessageForCode = useCallback(
    (code: ChatErrorCode) => (code === "model_busy" ? t("errors.modelBusy") : t("errors.modelUnavailable")),
    [t],
  );

  const send = useCallback(
    async (text: string): Promise<SendResult> => {
      const content = text.trim();
      if (!content || sendingRef.current || isLoadingHistory) return { ok: false, text };

      sendingRef.current = true;
      setIsLoading(true);
      setError(null);
      setMessages((current) => [...current, { role: "user", content }, { role: "assistant", content: "" }]);

      const updateAssistant = (update: (current: string) => string) =>
        setMessages((current) => {
          const last = current[current.length - 1];
          if (!last || last.role !== "assistant") return current;
          return [...current.slice(0, -1), { role: "assistant", content: update(last.content) }];
        });

      // Undo both optimistic bubbles. An id received in `start` stays: that conversation exists
      // on the server, so a retry continues it instead of leaving an empty one behind.
      const fail = (message: string): SendResult => {
        setMessages((current) => current.slice(0, -2));
        setError(message);
        return { ok: false, text };
      };

      try {
        const outcome = await streamChatMessage({ conversationId, message: content }, (event) => {
          if (event.event === "start") setConversationId(event.data.conversation_id);
          else if (event.event === "delta") updateAssistant((current) => current + event.data.text);
          else if (event.event === "replace") updateAssistant(() => event.data.text);
        });
        if (outcome.status === "error") return fail(errorMessageForCode(outcome.code));
        return { ok: true };
      } catch (err) {
        return fail(err instanceof ChatStreamIncompleteError ? t("errors.connection") : getApiErrorMessage(err, t("errorFallback")));
      } finally {
        sendingRef.current = false;
        setIsLoading(false);
      }
    },
    [conversationId, errorMessageForCode, isLoadingHistory, t],
  );

  const newConversation = useCallback(() => {
    if (sendingRef.current) return;
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  return { messages, conversationId, isLoadingHistory, isLoading, error, send, newConversation };
}
