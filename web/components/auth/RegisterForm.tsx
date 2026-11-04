"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { useConfirmEmailCode } from "@/hooks/useConfirmEmailCode";
import { useCountdown, VERIFICATION_CODE_EXPIRY_SECONDS } from "@/hooks/useCountdown";
import { useRegisterForm } from "@/hooks/useRegisterForm";
import { useResendConfirmation } from "@/hooks/useResendConfirmation";

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const tConfirm = useTranslations("auth.confirmEmail");
  const { form, onSubmit, serverError, successMessage, isSubmitting } = useRegisterForm();
  const { register, formState, getValues } = form;
  const email = getValues("email");
  const resend = useResendConfirmation(email);
  const confirmCode = useConfirmEmailCode(email);
  const { formatted, isExpired, restart } = useCountdown(VERIFICATION_CODE_EXPIRY_SECONDS);

  async function handleResend() {
    await resend.resend();
    restart();
  }

  if (successMessage) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm">
          {successMessage}
        </p>
        <form onSubmit={confirmCode.onSubmit} className="flex flex-col gap-4" noValidate>
          <FormField
            id="code"
            label={tConfirm("codeLabel")}
            inputMode="numeric"
            autoComplete="one-time-code"
            error={confirmCode.form.formState.errors.code}
            {...confirmCode.form.register("code")}
          />
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {isExpired ? tConfirm("codeExpired") : tConfirm("expiresIn", { time: formatted })}
          </p>
          {confirmCode.serverError && (
            <p role="alert" className="text-sm text-destructive">
              {confirmCode.serverError}
            </p>
          )}
          <Button type="submit" disabled={confirmCode.isSubmitting} className="w-full">
            {confirmCode.isSubmitting ? tConfirm("submitting") : tConfirm("submit")}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">{t("resendPrompt")}</p>
        <Button variant="outline" onClick={() => void handleResend()} disabled={resend.isSending}>
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
