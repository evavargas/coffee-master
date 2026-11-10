import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";

import { useSessionContext } from "@/context/SessionContext";
import { resolveAuthRedirect } from "@/lib/authGuard";

/** Sends unauthenticated users to login and authenticated users to the tabs. */
export function useAuthGuard() {
  const { token, isReady } = useSessionContext();
  const router = useRouter();
  const group = useSegments()[0] as string | undefined;
  const target = resolveAuthRedirect(token, isReady, group);

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  // While a redirect is pending, callers cover the screens to avoid flashing protected content.
  return { isReady, isRedirecting: target !== null };
}
