import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { requestPasswordReset } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildForgotPasswordSchema, type ForgotPasswordFormValues } from "@/lib/schemas/auth";

/** First step of password recovery: ask the backend to email a reset code. */
export function useForgotPasswordForm() {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const schema = useMemo(() => buildForgotPasswordSchema((key) => t(`validation.${key}`)), [t]);
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const message = await requestPasswordReset(values.email);
      setSuccessMessage(message);
    } catch (error) {
      setServerError(getApiErrorMessage(error, t("auth.forgotPassword.errorFallback")));
    }
  });

  return { form, onSubmit, serverError, successMessage, isSubmitting: form.formState.isSubmitting };
}
