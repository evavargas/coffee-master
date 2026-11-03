"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { confirmEmail } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/client";

type ConfirmStatus = "pending" | "success" | "error";

/** Confirms the email once when the page loads with a token from the email link. */
export function useConfirmEmail(token: string | null) {
  const t = useTranslations("auth.confirmEmail");
  const [status, setStatus] = useState<ConfirmStatus>("pending");
  const [message, setMessage] = useState<string | null>(null);
  // Guards against React Strict Mode running the effect twice: the token can be used only once.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!token) {
      setStatus("error");
      setMessage(t("invalidToken"));
      return;
    }

    confirmEmail(token)
      .then((response) => {
        setStatus("success");
        setMessage(response.message);
      })
      .catch((error: unknown) => {
        setStatus("error");
        setMessage(getApiErrorMessage(error, t("errorFallback")));
      });
  }, [token, t]);

  return { status, message };
}
