"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, LoaderCircle } from "lucide-react";

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
  const { messages, send, isLoading, error } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useAutoResizeTextarea(input);

  const suggestions = [t("suggestion1"), t("suggestion2"), t("suggestion3")];
  const canSend = !isLoading && input.trim().length > 0;

  // Keep the latest message (including the "thinking…" state) in view as the
  // conversation grows, instead of leaving the agent's reply below the fold.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  function submit() {
    if (!canSend) return;
    void send(input);
    setInput("");
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
      <div ref={scrollRef} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                className="h-auto justify-start whitespace-normal py-3 text-left"
                onClick={() => void send(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}
        {messages.map((message, index) => (
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
        ))}
        {isLoading && <p className="self-start text-sm text-muted-foreground">{t("thinking")}</p>}
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
          disabled={isLoading}
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
