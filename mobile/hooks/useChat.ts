import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getApiErrorMessage } from "@/lib/api/client";
import {
  ChatStreamError,
  getLatestConversation,
  streamChat,
  type ChatMessage,
  type ChatStreamErrorCode,
} from "@/lib/api/chat";

const STREAM_ERROR_KEYS: Record<ChatStreamErrorCode, string> = {
  model_busy: "chat.errors.modelBusy",
  model_unavailable: "chat.errors.modelUnavailable",
  connection: "chat.errors.connection",
};

/**
 * Conversation state for the chat screen. The server keeps the history, so `send`
 * posts only the new message plus the current `conversationId`.
 */
export function useChat() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State only updates on the next render, too late to stop a double tap.
  const isSendingRef = useRef(false);

  // Runs once: a language change must not reload the conversation.
  useEffect(() => {
    let cancelled = false;
    getLatestConversation()
      .then((latest) => {
        if (cancelled) return;
        setConversationId(latest.conversation_id);
        setMessages(latest.messages);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getApiErrorMessage(err, t("chat.errors.history")));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateAssistantBubble(update: (content: string) => string) {
    setMessages((current) => {
      const last = current[current.length - 1];
      return [...current.slice(0, -1), { role: "assistant", content: update(last.content) }];
    });
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || isSendingRef.current || isLoadingHistory) return;

    isSendingRef.current = true;
    setInput("");
    setError(null);
    setIsLoading(true);
    setMessages((current) => [...current, { role: "user", content }, { role: "assistant", content: "" }]);

    try {
      await streamChat(
        { conversationId, message: content },
        {
          onStart: setConversationId,
          onDelta: (delta) => updateAssistantBubble((bubble) => bubble + delta),
          onReplace: (replacement) => updateAssistantBubble(() => replacement),
        },
      );
      // The contract allows `done` with zero deltas; an empty bubble would be left behind.
      setMessages((current) => (current[current.length - 1].content ? current : current.slice(0, -1)));
    } catch (err) {
      setMessages((current) => current.slice(0, -2));
      setInput(text);
      setError(
        err instanceof ChatStreamError
          ? t(STREAM_ERROR_KEYS[err.code])
          : getApiErrorMessage(err, t("chat.errors.connection")),
      );
    } finally {
      isSendingRef.current = false;
      setIsLoading(false);
    }
  }

  function newConversation() {
    if (isSendingRef.current || isLoadingHistory) return;
    setMessages([]);
    setConversationId(null);
    setError(null);
  }

  const lastMessage = messages[messages.length - 1];
  const isAwaitingFirstDelta = isLoading && lastMessage?.role === "assistant" && lastMessage.content === "";

  return {
    messages,
    conversationId,
    input,
    setInput,
    isLoadingHistory,
    isLoading,
    isAwaitingFirstDelta,
    canStartNewConversation: !isLoading && !isLoadingHistory,
    error,
    send,
    newConversation,
  };
}
