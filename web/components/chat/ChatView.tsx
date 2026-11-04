"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, LoaderCircle, Plus } from "lucide-react";

import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { Button } from "@/components/ui/button";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { useChat } from "@/hooks/useChat";
import { cn } from "@/lib/utils";

/**
 * Chat conversation: suggestions, message list, error banner and composer.
 * The message list scrolls inside its own area; the composer stays pinned below it.
 */
export function ChatView() {
  const t = useTranslations("chat");
  const { messages, send, isLoading, isLoadingHistory, error, newConversation } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useAutoResizeTextarea(input);

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
      <div className="flex shrink-0 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={newConversation} disabled={isLoading || isLoadingHistory}>
          <Plus aria-hidden="true" />
          {t("newConversation")}
        </Button>
      </div>
      <div ref={scrollRef} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {isLoadingHistory && (
          <p role="status" className="self-start text-sm text-muted-foreground">
            {t("loadingHistory")}
          </p>
        )}
        {!isLoadingHistory && messages.length === 0 && (
          <div className="flex flex-col gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                className="h-auto justify-start whitespace-normal py-3 text-left"
                onClick={() => void sendAndRestore(suggestion)}
                disabled={isLoading}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}
        {messages.map((message, index) =>
          message.role === "assistant" && message.content === "" ? null : (
          <div
            key={index}
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              message.role === "user"
                ? "self-end whitespace-pre-wrap bg-primary text-primary-foreground"
                : "self-start bg-muted",
            )}
          >
            {message.role === "user" ? message.content : <MarkdownMessage content={message.content} />}
          </div>
          ),
        )}
        {isWaitingForFirstDelta && <p className="self-start text-sm text-muted-foreground">{t("thinking")}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

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
