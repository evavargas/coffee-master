import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Keyboard } from "react-native";

import { useConversations } from "@/hooks/useConversations";

interface ConversationPanelValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  conversations: ReturnType<typeof useConversations>;
}

const ConversationPanelContext = createContext<ConversationPanelValue | null>(null);

/** Holds the side panel's open state and the single conversation list shared by the header and the panel. */
export function ConversationPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const conversations = useConversations(isOpen);
  const open = useCallback(() => {
    // The keyboard would stay over the panel.
    Keyboard.dismiss();
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close, conversations }), [isOpen, open, close, conversations]);
  return <ConversationPanelContext.Provider value={value}>{children}</ConversationPanelContext.Provider>;
}

export function useConversationPanel(): ConversationPanelValue {
  const value = useContext(ConversationPanelContext);
  if (!value) throw new Error("useConversationPanel must be used inside ConversationPanelProvider");
  return value;
}
