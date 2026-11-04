import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { useSmoothText } from "@/hooks/useSmoothText";

type AssistantMessageProps = {
  content: string;
  /** True for a reply that is arriving now; stored messages appear complete. */
  isStreaming: boolean;
};

/** An assistant reply, revealed gradually while it streams. */
export function AssistantMessage({ content, isStreaming }: AssistantMessageProps) {
  const shown = useSmoothText(content, { animateFromStart: isStreaming });
  return <MarkdownMessage content={shown} />;
}
