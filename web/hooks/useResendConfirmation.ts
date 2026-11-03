"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { resendConfirmation } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";

/** Asks the backend to send the confirmation email again. Shows the backend's message either way. */
export function useResendConfirmation(email: string) {
  const t = useTranslations("auth.register");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function resend() {
    setIsSending(true);
    setError(null);
    try {
      const response = await resendConfirmation(email);
      setMessage(response.message);
    } catch (err) {
      setError(getApiErrorMessage(err, t("resendErrorFallback")));
    } finally {
      setIsSending(false);
    }
  }

  return { resend, message, error, isSending };
}
