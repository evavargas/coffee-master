"use client";

import { useTranslations } from "next-intl";

import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  const t = useTranslations("auth.login");

  return (
    <AuthShell title={t("title")}>
      <LoginForm />
    </AuthShell>
  );
}
