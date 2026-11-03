"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { useRegisterForm } from "@/hooks/useRegisterForm";
import { useResendConfirmation } from "@/hooks/useResendConfirmation";

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const { form, onSubmit, serverError, successMessage, isSubmitting } = useRegisterForm();
  const { register, formState, getValues } = form;
  const resend = useResendConfirmation(getValues("email"));

  if (successMessage) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm">
          {successMessage}
        </p>
        <p className="text-sm text-muted-foreground">{t("resendPrompt")}</p>
        <Button variant="outline" onClick={() => void resend.resend()} disabled={resend.isSending}>
          {resend.isSending ? t("resending") : t("resend")}
        </Button>
        {resend.message && <p className="text-sm">{resend.message}</p>}
        {resend.error && <p className="text-sm text-destructive">{resend.error}</p>}
        <Link href="/login" className="text-sm underline">
          {t("goToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField
        id="name"
        label={t("nameLabel")}
        autoComplete="given-name"
        error={formState.errors.name}
        {...register("name")}
      />
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
        autoComplete="new-password"
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
    </form>
  );
}
