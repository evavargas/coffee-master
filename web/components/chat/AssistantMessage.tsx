"use client";

import { useEffect } from "react";

import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { useSmoothText } from "@/hooks/useSmoothText";

type AssistantMessageProps = {
  content: string;
  /** True for a reply that is arriving now; stored messages appear complete. */
  isStreaming: boolean;
  /** Called as the visible text grows, so the list can stay at the bottom. */
  onGrow: () => void;
};

/** An assistant reply, revealed gradually while it streams. */
export function AssistantMessage({ content, isStreaming, onGrow }: AssistantMessageProps) {
  const shown = useSmoothText(content, { animateFromStart: isStreaming });

  useEffect(() => {
    onGrow();
  }, [shown, onGrow]);

  return <MarkdownMessage content={shown} />;
}
