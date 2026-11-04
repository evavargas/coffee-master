"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { requestPasswordReset, verifyResetCode } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildCodeSchema, type CodeFormValues } from "@/lib/schemas/auth";

interface UseVerifyResetCodeOptions {
  email: string;
  // Called with the short-lived reset token once the code is verified, so the parent flow
  // can advance to the new-password step. Never displayed, only passed along.
  onVerified: (resetToken: string) => void;
}

/** Step 2 of the password-reset flow: verifies the 6-digit code and lets the user resend it. */
export function useVerifyResetCode({ email, onVerified }: UseVerifyResetCodeOptions) {
  const t = useTranslations("validation");
  const tAuth = useTranslations("auth.resetPassword");
  const [serverError, setServerError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const schema = useMemo(() => buildCodeSchema(t), [t]);
  const form = useForm<CodeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const { reset_token } = await verifyResetCode({ email, code: values.code });
      onVerified(reset_token);
    } catch (error) {
      setServerError(getApiErrorMessage(error, tAuth("verifyErrorFallback")));
    }
  });

  async function resendCode() {
    setIsResending(true);
    setResendError(null);
    try {
      const response = await requestPasswordReset(email);
      setResendMessage(response.message);
    } catch (error) {
      setResendError(getApiErrorMessage(error, tAuth("resendErrorFallback")));
    } finally {
      setIsResending(false);
    }
  }

  return {
    form,
    onSubmit,
    serverError,
    isSubmitting: form.formState.isSubmitting,
    resendCode,
    resendMessage,
    resendError,
    isResending,
  };
}
