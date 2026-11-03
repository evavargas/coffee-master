"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  const t = useTranslations("auth.register");

  return (
    <AuthShell
      title={t("title")}
      description={t("description")}
      footer={
        <Link href="/login" className="underline">
          {t("haveAccount")}
        </Link>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
