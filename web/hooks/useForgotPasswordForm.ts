"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { requestPasswordReset } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildForgotPasswordSchema, type ForgotPasswordFormValues } from "@/lib/schemas/auth";

export function useForgotPasswordForm() {
  const t = useTranslations("validation");
  const tAuth = useTranslations("auth.forgotPassword");
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const schema = useMemo(() => buildForgotPasswordSchema(t), [t]);
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const response = await requestPasswordReset(values.email);
      setSuccessMessage(response.message);
    } catch (error) {
      setServerError(getApiErrorMessage(error, tAuth("errorFallback")));
    }
  });

  return { form, onSubmit, serverError, successMessage, isSubmitting: form.formState.isSubmitting };
}
