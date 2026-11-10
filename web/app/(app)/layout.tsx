"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { AppControls } from "@/components/layout/AppControls";
import { AppNav } from "@/components/layout/AppNav";
import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSignOut } from "@/hooks/useSignOut";

/** Shell of every signed-in page: auth guard, header, sign out and navigation. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const tNav = useTranslations("nav");
  const tChat = useTranslations("chat");
  const { user, isLoading } = useRequireAuth();
  const signOut = useSignOut();

  if (isLoading || !user) {
    return <main role="status" className="p-6 text-sm text-muted-foreground">{t("loading")}</main>;
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col gap-4 overflow-hidden p-4">
      <header className="flex shrink-0 items-center justify-between gap-2">
        <Brand subtitle={tChat("greeting", { name: user.name })} />
        <div className="flex items-center gap-1">
          <AppControls />
          <Button variant="ghost" size="sm" onClick={signOut}>
            {tNav("signOut")}
          </Button>
        </div>
      </header>
      <AppNav />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
