"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { confirmEmail } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { buildCodeSchema, type CodeFormValues } from "@/lib/schemas/auth";

/** Confirms the email with the 6-digit code sent after registration, then redirects to /login. */
export function useConfirmEmailCode(email: string) {
  const router = useRouter();
  const t = useTranslations("validation");
  const tAuth = useTranslations("auth.confirmEmail");
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const schema = useMemo(() => buildCodeSchema(t), [t]);
  const form = useForm<CodeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const response = await confirmEmail({ email, code: values.code });
      setSuccessMessage(response.message);
      router.replace("/login");
    } catch (error) {
      setServerError(getApiErrorMessage(error, tAuth("errorFallback")));
    }
  });

  return { form, onSubmit, serverError, successMessage, isSubmitting: form.formState.isSubmitting };
}
