import { createContext, useContext, type ReactNode } from "react";

import { useSession } from "@/hooks/useSession";

type SessionValue = ReturnType<typeof useSession>;

const SessionContext = createContext<SessionValue | null>(null);

/** Hosts the single session state so every route sees the same token. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSessionContext(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSessionContext must be used inside SessionProvider");
  return value;
}
