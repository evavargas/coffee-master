import { useCallback, useEffect, useState } from "react";

import { setUnauthorizedHandler } from "@/lib/api/client";
import { clearSession, getToken, saveToken } from "@/lib/session";

/** Restores the saved session on startup and exposes sign-in and sign-out. */
export function useSession() {
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getToken()
      .then((saved) => {
        if (!cancelled) setToken(saved);
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setToken(null);
  }, []);

  const signIn = useCallback(async (newToken: string) => {
    await saveToken(newToken);
    setToken(newToken);
  }, []);

  // An expired token (401) ends the session automatically.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  return { token, isReady, signIn, signOut };
}
