import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { getApiErrorMessage } from "@/lib/api/client";
import {
  ChatStreamError,
  getConversation,
  getLatestConversation,
  streamChat,
  type ChatMessage,
  type ChatStreamErrorCode,
  type RecipeRef,
} from "@/lib/api/chat";
import { chatEpoch } from "@/lib/chatEpoch";
import { onSessionChange } from "@/lib/session";

const STREAM_ERROR_KEYS: Record<ChatStreamErrorCode, string> = {
  model_busy: "chat.errors.modelBusy",
  model_unavailable: "chat.errors.modelUnavailable",
  connection: "chat.errors.connection",
};

const intents = ["ask", "adapt"] as const;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Conversation state for the chat screen. The server keeps the history, so `send`
 * posts only the new message plus the current `conversationId`. `?c=<id>` opens that
 * conversation instead of the latest one; `?intent=ask|adapt` only prefills the input
 * (it is never sent by itself).
 */
export function useChat() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ c?: string | string[]; intent?: string | string[] }>();
  const rawC = first(params.c);
  const requestedId = rawC && /^\d+$/.test(rawC) && Number(rawC) > 0 ? Number(rawC) : null;
  const rawIntent = first(params.intent);
  const intent = intents.find((i) => i === rawIntent) ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [recipeRef, setRecipeRef] = useState<RecipeRef | null>(null);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State only updates on the next render, too late to stop a double tap.
  const isSendingRef = useRef(false);
  // Bumped whenever another conversation is opened, so a stream of the old one cannot write into the new one.
  const generation = useRef(0);
  const streamAbort = useRef<AbortController | null>(null);

  // Reloads only when the requested conversation changes: a language change must not reload it.
  useEffect(() => {
    const controller = new AbortController();
    const epoch = chatEpoch();
    generation.current += 1;
    isSendingRef.current = false;
    setIsLoading(false);
    setMessages([]);
    setConversationId(null);
    setRecipeRef(null);
    setError(null);
    // A draft typed in one conversation must not leak into another.
    setInput("");
    setIsLoadingHistory(true);
    const stale = () => controller.signal.aborted || chatEpoch() !== epoch;
    const request =
      requestedId === null
        ? getLatestConversation(controller.signal).then((l) => ({ id: l.conversation_id, messages: l.messages, ref: l.recipe_ref }))
        : getConversation(requestedId, controller.signal).then((c) => ({ id: c.id, messages: c.messages, ref: c.recipe_ref }));
    request
      .then((loaded) => {
        if (stale()) return;
        setConversationId(loaded.id);
        setMessages(loaded.messages);
        setRecipeRef(loaded.ref ?? null);
      })
      .catch((err: unknown) => {
        if (stale() || axios.isCancel(err)) return;
        setError(
          axios.isAxiosError(err) && err.response?.status === 404 && requestedId !== null
            ? t("chat.conversationNotFound")
            : getApiErrorMessage(err, t("chat.errors.history")),
        );
      })
      .finally(() => {
        if (!stale()) setIsLoadingHistory(false);
      });
    return () => {
      controller.abort();
      // Switching conversation or leaving the screen also cancels a reply still streaming for the old one.
      streamAbort.current?.abort();
    };
  }, [requestedId]);

  // A session change (sign-out, 401, login) cancels any reply still streaming and unlocks the composer.
  useEffect(() => {
    const reset = () => {
      streamAbort.current?.abort();
      isSendingRef.current = false;
      setIsLoading(false);
    };
    return onSessionChange(reset);
  }, []);

  // The opening prompt only fills the input, and only for a conversation that loaded and is about a recipe.
  const openingPrompt = recipeRef && intent ? t(`chat.intent.${intent}`) : null;
  useEffect(() => {
    if (openingPrompt) setInput((current) => current || openingPrompt);
  }, [openingPrompt]);

  function updateLastAssistant(update: (message: ChatMessage) => ChatMessage) {
    setMessages((current) => {
      const last = current[current.length - 1];
      if (!last || last.role !== "assistant") return current;
      return [...current.slice(0, -1), update(last)];
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

    const abort = new AbortController();
    streamAbort.current = abort;
    const gen = generation.current;
    const epoch = chatEpoch();
    const isCurrent = () => generation.current === gen && chatEpoch() === epoch;

    try {
      await streamChat(
        { conversationId, message: content },
        {
          onStart: (id) => isCurrent() && setConversationId(id),
          onDelta: (delta) => isCurrent() && updateLastAssistant((m) => ({ ...m, content: m.content + delta })),
          onReplace: (replacement) => isCurrent() && updateLastAssistant((m) => ({ ...m, content: replacement })),
          onRecipe: (proposal) =>
            isCurrent() && updateLastAssistant((m) => ({ ...m, proposal: { ...proposal, saved_recipe_id: null } })),
        },
        abort.signal,
      );
      // The contract allows `done` with zero deltas; an empty bubble would be left behind.
      if (isCurrent()) setMessages((current) => (current[current.length - 1].content || current[current.length - 1].proposal ? current : current.slice(0, -1)));
    } catch (err) {
      if (!isCurrent()) return;
      setMessages((current) => current.slice(0, -2));
      setInput(text);
      setError(
        err instanceof ChatStreamError
          ? t(STREAM_ERROR_KEYS[err.code])
          : getApiErrorMessage(err, t("chat.errors.connection")),
      );
    } finally {
      // A superseded send must not clear the flags of whatever conversation is open now.
      if (isCurrent()) {
        isSendingRef.current = false;
        setIsLoading(false);
      }
    }
  }

  const lastMessage = messages[messages.length - 1];
  const isAwaitingFirstDelta = isLoading && lastMessage?.role === "assistant" && lastMessage.content === "";

  return {
    messages,
    conversationId,
    recipeRef,
    requestedId,
    input,
    setInput,
    isLoadingHistory,
    isLoading,
    isAwaitingFirstDelta,
    canStartNewConversation: !isLoading && !isLoadingHistory,
    error,
    send,
  };
}
