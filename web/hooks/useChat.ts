"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { sendChatMessages, type ChatMessage } from "@/lib/api/chat";
import { getApiErrorMessage } from "@/lib/api/client";

/** Chat state and the send action. The backend keeps no history, so the client sends it each time. */
export function useChat() {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || isLoading) return;

    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setIsLoading(true);
    setError(null);

    try {
      const reply = await sendChatMessages(next);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(getApiErrorMessage(err, t("errorFallback")));
    } finally {
      setIsLoading(false);
    }
  }

  return { messages, send, isLoading, error };
}
