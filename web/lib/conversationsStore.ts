import { useSyncExternalStore } from "react";

import { onSessionChange } from "@/lib/session";

// Shared between the chat (which knows what is open and when a turn ends) and the sidebar (which lists conversations).
let version = 0;
let currentId: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** A turn finished or a conversation was created: the sidebar list must be fetched again. */
export function notifyConversationsChanged(): void {
  version += 1;
  emit();
}

/** The conversation the chat shows (null while none is open), so the sidebar can mark it. */
export function setCurrentConversation(id: number | null): void {
  if (currentId === id) return;
  currentId = id;
  emit();
}

export const useConversationsVersion = () => useSyncExternalStore(subscribe, () => version, () => 0);
export const useCurrentConversationId = () => useSyncExternalStore(subscribe, () => currentId, () => null);

// Per-user state: forget the open conversation when the session starts or ends. Lists are not refetched here:
// the screens that show them unmount with the session.
onSessionChange(() => {
  currentId = null;
  emit();
});
