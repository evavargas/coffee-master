"use client";

import { useEffect, useState } from "react";

import { fetchCurrentUser } from "@/lib/api/auth";
import { clearSession, getToken } from "@/lib/session";
import type { UserPublic } from "@/lib/schemas/auth";

/** Loads the logged-in user from the backend. Returns null when there is no valid session. */
export function useCurrentUser() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!getToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const current = await fetchCurrentUser();
        if (!cancelled) setUser(current);
      } catch {
        // The interceptor already clears the session on 401; any other error just means "no user".
        clearSession();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, isLoading };
}
