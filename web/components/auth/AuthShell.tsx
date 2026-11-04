import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { AppControls } from "@/components/layout/AppControls";
import { Brand } from "@/components/layout/Brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared layout for the auth pages: app header above a centered card with title, body and optional footer links. */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  const t = useTranslations("common");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <Brand subtitle={t("appSubtitle")} />
          <AppControls />
        </header>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
          {footer && <div className="flex flex-col gap-2 px-6 pb-6 text-sm text-muted-foreground">{footer}</div>}
        </Card>
      </div>
    </main>
  );
}
