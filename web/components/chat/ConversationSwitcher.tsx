"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { History, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConversations } from "@/hooks/useConversations";
import { useRecipeRefName } from "@/hooks/useRecipeRefName";
import type { ConversationSummary } from "@/lib/api/chat";

function ConversationTitle({ item }: { item: ConversationSummary }) {
  const t = useTranslations("chat.switcher");
  const locale = useLocale();
  const { name } = useRecipeRefName(item.recipe_ref);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.updated_at));
  return <>{name ?? t("untitled", { date })}</>;
}

/** Lists the user's conversations (opened on demand), switches between them and starts a new one. Works on any width. */
export function ConversationSwitcher({ currentId, disabled }: { currentId: number | null; disabled?: boolean }) {
  const t = useTranslations("chat.switcher");
  const panelId = useId();
  const toggleId = useId();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // Focus moves into the panel when it opens and back to the toggle when it closes.
  useEffect(() => {
    if (open) panelRef.current?.focus();
    else if (wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const { items, isLoading, error, createError, isCreating, hasMore, loadMore, retry, startNew } = useConversations(open);

  return (
    <div className="shrink-0 space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button ref={toggleRef} id={toggleId} type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          <History aria-hidden="true" />
          {t("toggle")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void startNew()} disabled={disabled || isCreating}>
          <Plus aria-hidden="true" />
          {t("new")}
        </Button>
      </div>
      {createError && (
        <p role="alert" className="text-sm text-destructive">
          {createError}
        </p>
      )}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-labelledby={toggleId}
          tabIndex={-1}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background p-1 outline-none">
          {isLoading && items.length === 0 && (
            <p role="status" className="p-2 text-sm text-muted-foreground">
              {t("loading")}
            </p>
          )}
          {error && (
            <div role="alert" className="flex flex-wrap items-center gap-2 p-2 text-sm text-destructive">
              {error}
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                {t("retry")}
              </Button>
            </div>
          )}
          {!isLoading && !error && items.length === 0 && <p className="p-2 text-sm text-muted-foreground">{t("empty")}</p>}
          {items.length > 0 && (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/chat?c=${item.id}`}
                    aria-current={item.id === currentId ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className="block break-words rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-muted aria-[current=page]:font-medium"
                  >
                    <ConversationTitle item={item} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <Button type="button" variant="ghost" size="sm" onClick={loadMore} disabled={isLoading}>
              {t("loadMore")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
