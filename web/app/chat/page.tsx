"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { AppControls } from "@/components/layout/AppControls";
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary">{t("appName")}</h1>
          <p className="text-sm text-muted-foreground">{tChat("greeting", { name: user.name })}</p>
        </div>
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
