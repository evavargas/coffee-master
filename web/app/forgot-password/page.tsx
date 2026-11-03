"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { AuthShell } from "@/components/auth/AuthShell";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { useForgotPasswordForm } from "@/hooks/useForgotPasswordForm";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const { form, onSubmit, serverError, successMessage, isSubmitting } = useForgotPasswordForm();
  const { register, formState } = form;

  return (
    <AuthShell
      title={t("title")}
      description={t("description")}
      footer={
        <Link href="/login" className="underline">
          {t("backToLogin")}
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
            id="email"
            label={t("emailLabel")}
            type="email"
            autoComplete="email"
            error={formState.errors.email}
            {...register("email")}
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
