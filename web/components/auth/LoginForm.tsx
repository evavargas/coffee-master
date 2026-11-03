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
        autoComplete="email"
        error={formState.errors.email}
        {...register("email")}
      />
      <FormField
        id="password"
        label={t("passwordLabel")}
        type="password"
        autoComplete="current-password"
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
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="underline">
          {t("forgotPassword")}
        </Link>
        <Link href="/register" className="underline">
          {t("createAccount")}
        </Link>
      </div>
    </form>
  );
}
