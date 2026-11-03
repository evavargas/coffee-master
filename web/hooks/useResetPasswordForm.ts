"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { resetPassword } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildResetPasswordSchema, type ResetPasswordFormValues } from "@/lib/schemas/auth";

export function useResetPasswordForm(token: string | null) {
  const t = useTranslations("validation");
  const tAuth = useTranslations("auth.resetPassword");
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const schema = useMemo(() => buildResetPasswordSchema(t), [t]);
  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    if (!token) {
      setServerError(tAuth("invalidToken"));
      return;
    }
    try {
      const response = await resetPassword({ token, newPassword: values.password });
      setSuccessMessage(response.message);
    } catch (error) {
      setServerError(getApiErrorMessage(error, tAuth("errorFallback")));
    }
  });

  return { form, onSubmit, serverError, successMessage, isSubmitting: form.formState.isSubmitting };
}
