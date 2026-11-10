"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  fetchConversation,
  fetchLatestConversation,
  streamChatMessage,
  ChatStreamIncompleteError,
  type ChatErrorCode,
  type ChatMessage,
  type RecipeRef,
} from "@/lib/api/chat";
import { chatEpoch } from "@/lib/chatEpoch";
import { getApiErrorMessage } from "@/lib/api/client";

/** `ok: false` carries the text so the caller can put it back in the input. */
export type SendResult = { ok: true } | { ok: false; text: string };

const intents = ["ask", "adapt"] as const;

/**
 * Chat state. The server keeps the history: on mount we load the latest conversation, and each
 * send posts only the new message plus the current conversation id. The reply streams in as
 * deltas into the last (assistant) message. `?c=<id>` opens that conversation instead of the latest one,
 * and `?intent=ask|adapt` only picks an opening prompt for the input (it is never sent by itself).
 */
export function useChat() {
  const t = useTranslations("chat");
  const params = useSearchParams();
  const rawC = params?.get("c");
  const requestedId = rawC && /^\d+$/.test(rawC) && Number(rawC) > 0 ? Number(rawC) : null;
  const intent = intents.find((i) => i === params?.get("intent")) ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [recipeRef, setRecipeRef] = useState<RecipeRef | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  // Bumped whenever another conversation is opened, so a stream of the old one cannot write into the new one.
  const generation = useRef(0);
  const streamAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const epoch = chatEpoch();
    generation.current += 1;
    sendingRef.current = false;
    setIsLoading(false);
    setMessages([]);
    setConversationId(null);
    setRecipeRef(null);
    setError(null);
    setIsLoadingHistory(true);
    const stale = () => controller.signal.aborted || chatEpoch() !== epoch;
    const request =
      requestedId === null
        ? fetchLatestConversation(controller.signal).then((latest) => ({ id: latest.conversation_id, messages: latest.messages, ref: latest.recipe_ref }))
        : fetchConversation(requestedId, controller.signal).then((c) => ({ id: c.id, messages: c.messages, ref: c.recipe_ref }));
    request
      .then((loaded) => {
        if (stale()) return;
        setConversationId(loaded.id);
        setMessages(loaded.messages);
        setRecipeRef(loaded.ref ?? null);
      })
      .catch((e: unknown) => {
        // The chat stays usable (a new conversation will start) when history cannot be loaded.
        if (stale() || axios.isCancel(e)) return;
        setError(axios.isAxiosError(e) && e.response?.status === 404 && requestedId !== null ? t("conversationNotFound") : t("historyError"));
      })
      .finally(() => {
        if (!stale()) setIsLoadingHistory(false);
      });
    return () => {
      controller.abort();
      // Switching conversation or leaving the page also cancels a reply still streaming for the old one.
      streamAbort.current?.abort();
    };
    // Reload only when the requested conversation changes; `t` only changes with the locale.
  }, [requestedId]);

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

      const abort = new AbortController();
      streamAbort.current = abort;
      const gen = generation.current;
      const epoch = chatEpoch();
      const isCurrent = () => generation.current === gen && chatEpoch() === epoch;

      const updateAssistant = (update: (message: ChatMessage) => ChatMessage) =>
        setMessages((current) => {
          const last = current[current.length - 1];
          if (!last || last.role !== "assistant") return current;
          return [...current.slice(0, -1), update(last)];
        });

      // Undo both optimistic bubbles. An id received in `start` stays: that conversation exists
      // on the server, so a retry continues it instead of leaving an empty one behind.
      const fail = (message: string): SendResult => {
        if (isCurrent()) {
          setMessages((current) => current.slice(0, -2));
          setError(message);
        }
        return { ok: false, text };
      };

      try {
        const outcome = await streamChatMessage({ conversationId, message: content }, (event) => {
          if (!isCurrent()) return;
          if (event.event === "start") setConversationId(event.data.conversation_id);
          else if (event.event === "delta") updateAssistant((m) => ({ ...m, content: m.content + event.data.text }));
          else if (event.event === "replace") updateAssistant((m) => ({ ...m, content: event.data.text }));
          else if (event.event === "recipe") updateAssistant((m) => ({ ...m, proposal: { ...event.data, saved_recipe_id: null } }));
        }, abort.signal);
        if (outcome.status === "error") return fail(errorMessageForCode(outcome.code));
        return { ok: true };
      } catch (err) {
        return fail(err instanceof ChatStreamIncompleteError ? t("errors.connection") : getApiErrorMessage(err, t("errorFallback")));
      } finally {
        // A superseded send must not clear the flags of whatever conversation is open now.
        if (isCurrent()) {
          sendingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [conversationId, errorMessageForCode, isLoadingHistory, t],
  );

  // The opening prompt only makes sense for a conversation that loaded and is about a recipe.
  return { messages, conversationId, recipeRef, intent: recipeRef ? intent : null, requestedId, isLoadingHistory, isLoading, error, send };
}
