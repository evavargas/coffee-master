import { useCallback } from "react";
import { useRouter } from "expo-router";

import { useSessionContext } from "@/context/SessionContext";

/** Local only: clears the stored session. The backend has no logout endpoint by design. */
export function useSignOut() {
  const { signOut } = useSessionContext();
  const router = useRouter();

  return useCallback(async () => {
    await signOut();
    router.replace("/login");
  }, [signOut, router]);
}
