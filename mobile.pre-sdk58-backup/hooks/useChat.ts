import { useState } from "react";
import { useTranslation } from "react-i18next";

import { getApiErrorMessage } from "@/lib/api/client";
import { sendChatMessages, type ChatMessage } from "@/lib/api/chat";

/** Chat state and the send action. The backend keeps no history, so the client sends it each time. */
export function useChat() {
  const { t } = useTranslation();
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
      setError(getApiErrorMessage(err, t("chat.genericError")));
    } finally {
      setIsLoading(false);
    }
  }

  return { messages, send, isLoading, error };
}
