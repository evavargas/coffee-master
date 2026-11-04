import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { registerAccount } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildRegisterSchema, type RegisterFormValues } from "@/lib/schemas/auth";

/**
 * Registration form state. The backend answers 201 whether or not the email exists, so a
 * non-null `successMessage` always moves the user on to the confirm-code step.
 */
export function useRegisterForm() {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const schema = useMemo(() => buildRegisterSchema((key) => t(`validation.${key}`)), [t]);
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const message = await registerAccount(values);
      setSuccessMessage(message);
    } catch (error) {
      setServerError(getApiErrorMessage(error, t("auth.register.errorFallback")));
    }
  });

  return { form, onSubmit, serverError, successMessage, isSubmitting: form.formState.isSubmitting };
}
