import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { resetPassword } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildResetPasswordSchema, type ResetPasswordFormValues } from "@/lib/schemas/auth";

/**
 * Final step of password recovery: new password + confirmation, submitted
 * with the `resetToken` obtained from the previous step (not from a URL).
 */
export function useResetPasswordForm(resetToken: string) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const schema = useMemo(() => buildResetPasswordSchema((key) => t(`validation.${key}`)), [t]);
  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const message = await resetPassword({ resetToken, newPassword: values.password });
      setSuccessMessage(message);
    } catch (error) {
      setServerError(getApiErrorMessage(error, t("auth.resetPassword.errorFallback")));
    }
  });

  return { form, onSubmit, serverError, successMessage, isSubmitting: form.formState.isSubmitting };
}
