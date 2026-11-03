"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AuthShell } from "@/components/auth/AuthShell";
import { useConfirmEmail } from "@/hooks/useConfirmEmail";

function ConfirmEmailStatus() {
  const t = useTranslations("auth.confirmEmail");
  const token = useSearchParams().get("token");
  const { status, message } = useConfirmEmail(token);

  return (
    <AuthShell
      title={t("title")}
      footer={
        <Link href="/login" className="underline">
          {t("goToLogin")}
        </Link>
      }
    >
      <p role="status" className={status === "error" ? "text-sm text-destructive" : "text-sm"}>
        {status === "pending" ? t("pending") : message}
      </p>
    </AuthShell>
  );
}

// useSearchParams needs a Suspense boundary in the App Router.
export default function ConfirmEmailPage() {
  return (
    <Suspense>
      <ConfirmEmailStatus />
    </Suspense>
  );
}
