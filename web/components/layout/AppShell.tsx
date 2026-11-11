"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, Plus } from "lucide-react";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { UserNameProvider } from "@/components/layout/UserContext";
import { Button } from "@/components/ui/button";
import { useConversations } from "@/hooks/useConversations";
import { useSignOut } from "@/hooks/useSignOut";
import { cn } from "@/lib/utils";

const DOCKED_KEY = "coffeemaster.sidebar";
const isWide = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches;

/**
 * Frame of the signed-in app: a docked sidebar on wide screens (foldable, remembered) and a drawer on narrow ones,
 * with a slim top bar that holds the menu and "new conversation" buttons whenever the sidebar is not docked.
 */
export function AppShell({ userName, children }: { userName: string; children: ReactNode }) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tSwitch = useTranslations("chat.switcher");
  const pathname = usePathname();
  const signOut = useSignOut();
  const conversations = useConversations(true);
  const [docked, setDocked] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Remembered per browser; the server and first render always dock it, so there is no hydration mismatch.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(DOCKED_KEY) === "0") setDocked(false);
    } catch {
      /* storage can be blocked: the sidebar just starts docked */
    }
  }, []);
  const dock = useCallback((value: boolean) => {
    setDocked(value);
    try {
      window.localStorage.setItem(DOCKED_KEY, value ? "1" : "0");
    } catch {
      /* not remembered */
    }
  }, []);

  useEffect(() => setDrawerOpen(false), [pathname]);

  // Focus moves into the drawer when it opens and back to the menu button when it closes.
  useEffect(() => {
    if (drawerOpen) asideRef.current?.focus();
    else if (wasOpen.current) menuRef.current?.focus();
    wasOpen.current = drawerOpen;
  }, [drawerOpen]);

  function openMenu() {
    if (isWide()) dock(true);
    else setDrawerOpen(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && drawerOpen) setDrawerOpen(false);
  }

  return (
    <UserNameProvider value={userName}>
      <div className="flex h-dvh overflow-hidden">
        {drawerOpen && <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setDrawerOpen(false)} />}
        <aside
          id="app-sidebar"
          ref={asideRef}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cn(
            "w-72 shrink-0 flex-col border-r border-border bg-background outline-none",
            drawerOpen ? "fixed inset-y-0 left-0 z-40 flex" : "hidden",
            docked ? "md:static md:z-auto md:flex" : "md:hidden",
          )}
        >
          <AppSidebar
            userName={userName}
            conversations={conversations}
            signOut={signOut}
            onNavigate={() => setDrawerOpen(false)}
            onCollapse={() => dock(false)}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className={cn("flex shrink-0 items-center gap-2 px-3 pt-3", docked && "md:hidden")}>
            <Button
              ref={menuRef}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t(docked ? "menu" : "showSidebar")}
              aria-expanded={drawerOpen}
              aria-controls="app-sidebar"
              onClick={openMenu}
            >
              <Menu aria-hidden="true" />
            </Button>
            <div className="flex min-w-0 flex-1 items-center gap-2" aria-hidden="true">
              <Image src="/brand/cup-lavanda.png" alt="" width={28} height={28} />
              <span className="font-display truncate text-lg text-primary">{tCommon("appName")}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tSwitch("new")}
              title={tSwitch("new")}
              disabled={conversations.isCreating}
              onClick={() => void conversations.startNew()}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col p-4">{children}</div>
          </main>
        </div>
      </div>
    </UserNameProvider>
  );
}
