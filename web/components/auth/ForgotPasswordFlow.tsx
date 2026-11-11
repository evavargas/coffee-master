"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AuthShell } from "@/components/auth/AuthShell";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { useCountdown, VERIFICATION_CODE_EXPIRY_SECONDS } from "@/hooks/useCountdown";
import { useForgotPasswordForm } from "@/hooks/useForgotPasswordForm";
import { useResetPasswordForm } from "@/hooks/useResetPasswordForm";
import { useVerifyResetCode } from "@/hooks/useVerifyResetCode";

type Step = "email" | "code" | "password";

/** Step 1: ask for the email, request a reset code, then advance to the code step. */
function EmailStep({ onAdvance }: { onAdvance: (email: string) => void }) {
  const t = useTranslations("auth.forgotPassword");
  const { form, onSubmit, serverError, successMessage, isSubmitting } = useForgotPasswordForm();
  const { register, formState, getValues } = form;

  useEffect(() => {
    if (successMessage) {
      onAdvance(getValues("email"));
    }
  }, [successMessage, getValues, onAdvance]);

  return (
    <AuthShell
      title={t("title")}
      description={t("description")}
      footer={
        <Link href="/login" className="px-3 py-2 underline">
          {t("backToLogin")}
        </Link>
      }
    >
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
    </AuthShell>
  );
}

/** Step 2: verify the 6-digit code, with a countdown and a "resend code" action. */
function CodeStep({ email, onVerified }: { email: string; onVerified: (resetToken: string) => void }) {
  const t = useTranslations("auth.resetPassword");
  const { form, onSubmit, serverError, isSubmitting, resendCode, resendMessage, resendError, isResending } =
    useVerifyResetCode({ email, onVerified });
  const { register, formState } = form;
  const { formatted, isExpired, restart } = useCountdown(VERIFICATION_CODE_EXPIRY_SECONDS);

  async function handleResend() {
    await resendCode();
    restart();
  }

  return (
    <AuthShell
      title={t("verifyTitle")}
      description={t("codeSentTo", { email })}
      footer={
        <Link href="/login" className="px-3 py-2 underline">
          {t("goToLogin")}
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormField
          id="code"
          label={t("codeLabel")}
          inputMode="numeric"
          autoComplete="one-time-code"
          error={formState.errors.code}
          {...register("code")}
        />
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {isExpired ? t("codeExpired") : t("expiresIn", { time: formatted })}
        </p>
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t("verifySubmitting") : t("verifySubmit")}
        </Button>
        <Button type="button" variant="outline" onClick={() => void handleResend()} disabled={isResending}>
          {isResending ? t("resending") : t("resendCode")}
        </Button>
        <p className="text-sm text-muted-foreground">{t("resendHint")}</p>
        {resendMessage && (
          <p role="status" className="text-sm">
            {resendMessage}
          </p>
        )}
        {resendError && (
          <p role="alert" className="text-sm text-destructive">
            {resendError}
          </p>
        )}
      </form>
    </AuthShell>
  );
}

/** Step 3: set the new password using the reset token handed over by the code step. */
function PasswordStep({ resetToken }: { resetToken: string }) {
  const t = useTranslations("auth.resetPassword");
  const { form, onSubmit, serverError, isSubmitting } = useResetPasswordForm(resetToken);
  const { register, formState } = form;

  return (
    <AuthShell
      title={t("title")}
      footer={
        <Link href="/login" className="px-3 py-2 underline">
          {t("goToLogin")}
        </Link>
      }
    >
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
    </AuthShell>
  );
}

/**
 * The 3-step password-reset flow, replacing the old link-based `?token=` page: email -> code
 * -> new password, all inline. The reset token from step 2 lives only in this component's
 * state, never in the URL.
 */
export function ForgotPasswordFlow() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");

  if (step === "code") {
    return (
      <CodeStep
        email={email}
        onVerified={(token) => {
          setResetToken(token);
          setStep("password");
        }}
      />
    );
  }

  if (step === "password") {
    return <PasswordStep resetToken={resetToken} />;
  }

  return (
    <EmailStep
      onAdvance={(submittedEmail) => {
        setEmail(submittedEmail);
        setStep("code");
      }}
    />
  );
}
