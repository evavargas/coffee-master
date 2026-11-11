"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { useLoginForm } from "@/hooks/useLoginForm";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const { form, onSubmit, serverError, isSubmitting } = useLoginForm();
  const { register, formState } = form;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField
        id="email"
        label={t("emailLabel")}
        type="email"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        error={formState.errors.email}
        {...register("email")}
      />
      <FormField
        id="password"
        label={t("passwordLabel")}
        type="password"
        autoComplete="current-password"
        revealable
        error={formState.errors.password}
        {...register("password")}
      />
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>
      <div className="flex flex-col items-center gap-1 pt-2 text-sm">
        <Link href="/register" className="px-3 py-2 underline">
          {t("createAccount")}
        </Link>
        <Link href="/forgot-password" className="px-3 py-2 underline">
          {t("forgotPassword")}
        </Link>
      </div>
    </form>
  );
}
