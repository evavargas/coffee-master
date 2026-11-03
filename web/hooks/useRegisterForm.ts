"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { registerAccount } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildRegisterSchema, type RegisterFormValues } from "@/lib/schemas/auth";

export function useRegisterForm() {
  const t = useTranslations("validation");
  const tAuth = useTranslations("auth.register");
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const schema = useMemo(() => buildRegisterSchema(t), [t]);
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const response = await registerAccount(values);
      setSuccessMessage(response.message);
    } catch (error) {
      setServerError(getApiErrorMessage(error, tAuth("errorFallback")));
    }
  });

  return { form, onSubmit, serverError, successMessage, isSubmitting: form.formState.isSubmitting };
}
