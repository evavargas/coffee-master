import { useState } from "react";
import { useTranslation } from "react-i18next";

import { resendConfirmation } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";

/** Asks the backend to resend the confirmation code to the given email. Shows the backend's message either way. */
export function useResendConfirmation(email: string) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function resend() {
    setIsSending(true);
    setError(null);
    try {
      const response = await resendConfirmation(email);
      setMessage(response);
    } catch (err) {
      setError(getApiErrorMessage(err, t("auth.code.resendErrorFallback")));
    } finally {
      setIsSending(false);
    }
  }

  return { resend, message, error, isSending };
}
