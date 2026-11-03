import type { ReactNode } from "react";

import { AppControls } from "@/components/layout/AppControls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared layout for the auth pages: centered card with title, body and optional footer links. */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="relative w-full max-w-md">
        <div className="absolute top-4 right-4">
          <AppControls />
        </div>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer && <div className="flex flex-col gap-2 px-6 pb-6 text-sm text-muted-foreground">{footer}</div>}
      </Card>
    </main>
  );
}
