"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, LoaderCircle } from "lucide-react";

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { CardErrorBoundary } from "@/components/chat/CardErrorBoundary";
import { RecipeBanner } from "@/components/chat/RecipeBanner";
import { RecipeProposalCard } from "@/components/chat/RecipeProposalCard";
import { useUserName } from "@/components/layout/UserContext";
import { Button } from "@/components/ui/button";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { useChat } from "@/hooks/useChat";
import { setCurrentConversation } from "@/lib/conversationsStore";
import { cn } from "@/lib/utils";

/**
 * Chat conversation: suggestions, message list, error banner and composer.
 * The message list scrolls inside its own area; the composer stays pinned below it.
 */
export function ChatView() {
  const t = useTranslations("chat");
  const { messages, send, isLoading, isLoadingHistory, error, conversationId, recipeRef, intent, requestedId } = useChat();
  const userName = useUserName();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useAutoResizeTextarea(input);

  // The opening prompt only fills the input: the user reads it and decides to send it.
  // A draft typed in one conversation must not leak into another.
  useEffect(() => {
    setInput("");
  }, [requestedId]);
  const openingPrompt = intent ? t(`intent.${intent}`) : null;
  useEffect(() => {
    if (openingPrompt) setInput((current) => current || openingPrompt);
  }, [openingPrompt]);

  // The sidebar marks the open conversation.
  useEffect(() => {
    setCurrentConversation(conversationId);
    return () => setCurrentConversation(null);
  }, [conversationId]);

  const suggestions = [t("suggestion1"), t("suggestion2"), t("suggestion3")];
  const canSend = !isLoading && !isLoadingHistory && input.trim().length > 0;
  // The assistant bubble exists from the start but is empty until the first delta arrives.
  const lastMessage = messages[messages.length - 1];
  const isWaitingForFirstDelta = isLoading && lastMessage?.role === "assistant" && lastMessage.content === "";

  // Keep the latest message (including the "thinking…" state) in view as the
  // conversation grows. Smooth scrolling lags behind a fast stream, so follow it instantly while loading.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: isLoading ? "auto" : "smooth" });
  }, [messages, isLoading]);

  // The reply is revealed gradually, also after the stream ends, so the list follows the visible text.
  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
  }, []);

  // Clears the input right away; if the send fails the text is put back (unless the user already typed something new).
  async function sendAndRestore(text: string) {
    const result = await send(text);
    if (!result.ok) setInput((current) => current || result.text);
  }

  function submit() {
    if (!canSend) return;
    const text = input;
    setInput("");
    void sendAndRestore(text);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  // Enter sends; Shift+Enter adds a new line, like most messaging apps.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      {recipeRef && <RecipeBanner recipeRef={recipeRef} />}
      <div ref={scrollRef} aria-live="polite" aria-busy={isLoading} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {isLoadingHistory && (
          <p role="status" className="self-start text-sm text-muted-foreground">
            {t("loadingHistory")}
          </p>
        )}
        {!isLoadingHistory && messages.length === 0 && userName && <p className="my-auto text-center text-lg font-semibold">{t("greeting", { name: userName })}</p>}
        {messages.map((message, index) =>
          message.role === "assistant" && message.content === "" ? null : (
          <Fragment key={index}>
          <div
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              message.role === "user"
                ? "self-end whitespace-pre-wrap bg-primary text-primary-foreground"
                : "self-start bg-muted",
            )}
          >
            {message.role === "user" ? (
              message.content
            ) : (
              <AssistantMessage
                content={message.content}
                isStreaming={isLoading && index === messages.length - 1}
                onGrow={scrollToBottom}
              />
            )}
          </div>
          {message.proposal && <CardErrorBoundary>
              <RecipeProposalCard proposal={message.proposal} />
            </CardErrorBoundary>}
          </Fragment>
          ),
        )}
        {isWaitingForFirstDelta && <p className="self-start text-sm text-muted-foreground">{t("thinking")}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {!isLoadingHistory && messages.length === 0 && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <p className="w-full text-xs text-muted-foreground">{t("suggestionsLabel")}</p>
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal rounded-full bg-muted px-3 py-1.5 text-left font-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => void sendAndRestore(suggestion)}
              disabled={isLoading}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="flex shrink-0 items-end gap-2 rounded-2xl border border-input bg-background p-2 shadow-sm focus-within:border-ring"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("placeholder")}
          aria-label={t("questionLabel")}
          disabled={isLoading || isLoadingHistory}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-full"
          disabled={!canSend}
          aria-label={t("send")}
          title={t("send")}
        >
          {isLoading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
        </Button>
      </form>
    </section>
  );
}
