"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AuthShell } from "@/components/auth/AuthShell";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { useResetPasswordForm } from "@/hooks/useResetPasswordForm";

function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const token = useSearchParams().get("token");
  const { form, onSubmit, serverError, successMessage, isSubmitting } = useResetPasswordForm(token);
  const { register, formState } = form;

  return (
    <AuthShell
      title={t("title")}
      footer={
        <Link href="/login" className="underline">
          {t("goToLogin")}
        </Link>
      }
    >
      {successMessage ? (
        <p role="status" className="text-sm">
          {successMessage}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FormField
            id="password"
            label={t("passwordLabel")}
            type="password"
            autoComplete="new-password"
            error={formState.errors.password}
            {...register("password")}
          />
          <FormField
            id="confirmPassword"
            label={t("confirmPasswordLabel")}
            type="password"
            autoComplete="new-password"
            error={formState.errors.confirmPassword}
            {...register("confirmPassword")}
          />
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? t("submitting") : t("submit")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

// useSearchParams needs a Suspense boundary in the App Router.
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
