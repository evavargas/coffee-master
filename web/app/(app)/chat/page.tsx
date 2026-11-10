"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { AppControls } from "@/components/layout/AppControls";
import { Brand } from "@/components/layout/Brand";
import { ChatView } from "@/components/chat/ChatView";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { clearSession } from "@/lib/session";

export default function ChatPage() {
  const router = useRouter();
  const t = useTranslations("common");
  const tChat = useTranslations("chat");
  const { user, isLoading } = useRequireAuth();

  if (isLoading || !user) {
    return <main className="p-6 text-sm text-muted-foreground">{t("loading")}</main>;
  }

  function handleSignOut() {
    // Local only: clears this browser's session. The backend has no logout endpoint by design.
    clearSession();
    router.replace("/login");
  }

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col gap-4 overflow-hidden p-4">
      <header className="flex shrink-0 items-center justify-between">
        <Brand subtitle={tChat("greeting", { name: user.name })} />
        <div className="flex items-center gap-1">
          <AppControls />
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            {t("signOut")}
          </Button>
        </div>
      </header>
      <ChatView />
    </main>
  );
}
