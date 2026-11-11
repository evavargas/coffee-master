"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { BookOpen, Heart, MessageCircle, PanelLeftClose, Plus } from "lucide-react";

import { AppControls } from "@/components/layout/AppControls";
import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import type { useConversations } from "@/hooks/useConversations";
import { useRecipeRefName } from "@/hooks/useRecipeRefName";
import type { ConversationSummary } from "@/lib/api/chat";
import { useCurrentConversationId } from "@/lib/conversationsStore";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/chat", key: "chat", Icon: MessageCircle },
  { href: "/recipes", key: "recipes", Icon: BookOpen },
  { href: "/my-recipes", key: "myRecipes", Icon: Heart },
] as const;

/** Title of a conversation: the recipe it is about, else its first message, else its date. */
function ConversationTitle({ item }: { item: ConversationSummary }) {
  const t = useTranslations("chat.switcher");
  const locale = useLocale();
  const { name } = useRecipeRefName(item.recipe_ref);
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.updated_at));
  return <>{name ?? item.preview ?? t("untitled", { date })}</>;
}

export interface AppSidebarProps {
  userName: string;
  conversations: ReturnType<typeof useConversations>;
  /** Called after the user picks a destination, so a drawer can close. */
  onNavigate?: () => void;
  /** Shown on wide screens only: folds the docked sidebar away. */
  onCollapse?: () => void;
  signOut: () => void;
}

/** Navigation, new-conversation button, conversation history and account controls of the signed-in app. */
export function AppSidebar({ userName, conversations, onNavigate, onCollapse, signOut }: AppSidebarProps) {
  const t = useTranslations("nav");
  const tSwitch = useTranslations("chat.switcher");
  const pathname = usePathname();
  const currentId = useCurrentConversationId();
  const { items, isLoading, error, createError, isCreating, hasMore, loadMore, retry, startNew } = conversations;
  const onChat = pathname === "/chat" || pathname.startsWith("/chat/");

  async function newConversation() {
    if (await startNew()) onNavigate?.();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <Brand />
        {onCollapse && (
          <Button type="button" variant="ghost" size="icon" className="hidden md:inline-flex" aria-label={t("hideSidebar")} title={t("hideSidebar")} onClick={onCollapse}>
            <PanelLeftClose aria-hidden="true" />
          </Button>
        )}
      </div>

      <Button type="button" className="w-full justify-start" onClick={() => void newConversation()} disabled={isCreating}>
        <Plus aria-hidden="true" />
        {tSwitch("new")}
      </Button>
      {createError && (
        <p role="alert" className="text-sm text-destructive">
          {createError}
        </p>
      )}

      <nav aria-label={t("ariaLabel")} className="flex flex-col gap-1">
        {LINKS.map(({ href, key, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      <section aria-labelledby="recents-heading" className="flex min-h-0 flex-1 flex-col">
        <h2 id="recents-heading" className="px-3 pb-1 text-xs font-medium text-muted-foreground">
          {t("recents")}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && items.length === 0 && (
            <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
              {tSwitch("loading")}
            </p>
          )}
          {error && (
            <div role="alert" className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm text-destructive">
              {error}
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                {tSwitch("retry")}
              </Button>
            </div>
          )}
          {!isLoading && !error && items.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">{tSwitch("empty")}</p>}
          {items.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = onChat && item.id === currentId;
                return (
                  <li key={item.id}>
                    <Link
                      href={`/chat?c=${item.id}`}
                      onClick={onNavigate}
                      aria-current={active ? "true" : undefined}
                      className="block truncate rounded-lg px-3 py-2 text-sm outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:bg-muted aria-[current=true]:font-medium"
                    >
                      <ConversationTitle item={item} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {hasMore && (
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={loadMore} disabled={isLoading}>
              {tSwitch("loadMore")}
            </Button>
          )}
        </div>
      </section>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border pt-3">
        <p className="truncate px-1 text-sm font-medium">{userName}</p>
        <div className="flex items-center justify-between gap-2">
          <AppControls />
          <Button type="button" variant="ghost" size="sm" onClick={signOut}>
            {t("signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}
