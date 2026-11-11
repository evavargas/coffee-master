"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { AppShell } from "@/components/layout/AppShell";
import { useRequireAuth } from "@/hooks/useRequireAuth";

/** Layout of every screen behind login: redirects to /login without a session and frames the content with the sidebar. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const { user, isLoading } = useRequireAuth();

  if (isLoading || !user) {
    return <main role="status" className="p-6 text-sm text-muted-foreground">{t("loading")}</main>;
  }

  return <AppShell userName={user.name}>{children}</AppShell>;
}
