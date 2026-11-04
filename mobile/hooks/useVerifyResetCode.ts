import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { verifyResetCode } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildCodeSchema, type CodeFormValues } from "@/lib/schemas/auth";

/**
 * Second step of password recovery: email + 6-digit code.
 * On success, `resetToken` holds the backend's short-lived session token to
 * hand forward to the reset-password step. It is never displayed.
 */
export function useVerifyResetCode(defaultEmail = "") {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const schema = useMemo(() => buildCodeSchema((key) => t(`validation.${key}`)), [t]);
  const form = useForm<CodeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: defaultEmail, code: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const token = await verifyResetCode(values);
      setResetToken(token);
    } catch (error) {
      setServerError(getApiErrorMessage(error, t("auth.verifyResetCode.errorFallback")));
    }
  });

  return { form, onSubmit, serverError, resetToken, isSubmitting: form.formState.isSubmitting };
}
