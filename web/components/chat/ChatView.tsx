"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChat } from "@/hooks/useChat";
import { cn } from "@/lib/utils";

/** Chat conversation: suggestions, message list, error banner and composer. Logic lives in useChat. */
export function ChatView() {
  const t = useTranslations("chat");
  const { messages, send, isLoading, error } = useChat();
  const [input, setInput] = useState("");

  const suggestions = [t("suggestion1"), t("suggestion2"), t("suggestion3")];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
    setInput("");
  }

  return (
    <section className="flex flex-1 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div aria-live="polite" className="flex min-h-[50vh] flex-1 flex-col gap-3 overflow-y-auto">
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
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              message.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted",
            )}
          >
            {message.content}
          </div>
        ))}
        {isLoading && <p className="self-start text-sm text-muted-foreground">{t("thinking")}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("questionLabel")}
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || !input.trim()}>
          {t("send")}
        </Button>
      </form>
    </section>
  );
}
