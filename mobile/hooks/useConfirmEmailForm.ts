import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { confirmEmail } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildCodeSchema, type CodeFormValues } from "@/lib/schemas/auth";

/**
 * Email + 6-digit code form for confirming the account.
 * Submit-driven rather than an auto-effect: there is no URL arrival event on
 * mobile, the user types the code from the email and taps submit.
 */
export function useConfirmEmailForm(defaultEmail = "") {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const schema = useMemo(() => buildCodeSchema((key) => t(`validation.${key}`)), [t]);
  const form = useForm<CodeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: defaultEmail, code: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const message = await confirmEmail(values);
      setSuccessMessage(message);
    } catch (error) {
      setServerError(getApiErrorMessage(error, t("auth.confirmEmail.errorFallback")));
    }
  });

  return { form, onSubmit, serverError, successMessage, isSubmitting: form.formState.isSubmitting };
}
