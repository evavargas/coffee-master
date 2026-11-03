"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { login } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";
import { saveToken } from "@/lib/session";
import { buildLoginSchema, type LoginFormValues } from "@/lib/schemas/auth";

export function useLoginForm() {
  const router = useRouter();
  const t = useTranslations("validation");
  const tAuth = useTranslations("auth.login");
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = useMemo(() => buildLoginSchema(t), [t]);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const { access_token } = await login(values);
      saveToken(access_token);
      router.replace("/chat");
    } catch (error) {
      setServerError(getApiErrorMessage(error, tAuth("errorFallback")));
    }
  });

  return { form, onSubmit, serverError, isSubmitting: form.formState.isSubmitting };
}
