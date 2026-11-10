"use client";

import { useRouter } from "next/navigation";

import { clearSession } from "@/lib/session";

/** Local only: clears this browser's session. The backend has no logout endpoint by design. */
export function useSignOut() {
  const router = useRouter();

  return () => {
    clearSession();
    router.replace("/login");
  };
}
