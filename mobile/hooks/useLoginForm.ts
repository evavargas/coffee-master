import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";

import { login } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildLoginSchema, type LoginFormValues } from "@/lib/schemas/auth";

/** Login form state. `onAuthenticated` receives the token once the backend accepts the credentials. */
export function useLoginForm(onAuthenticated: (token: string) => Promise<void>) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const loginSchema = useMemo(() => buildLoginSchema((key) => t(`validation.${key}`)), [t]);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const token = await login(values);
      await onAuthenticated(token);
    } catch (error) {
      setServerError(getApiErrorMessage(error, t("auth.login.genericError")));
    }
  });

  return { form, onSubmit, serverError, isSubmitting: form.formState.isSubmitting };
}
