import { z } from "zod";

import { apiClient } from "@/lib/api/client";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const chatResponseSchema = z.object({ reply: z.string() });

export async function sendChatMessages(messages: ChatMessage[]): Promise<string> {
  const { data } = await apiClient.post("/api/chat", { messages });
  return chatResponseSchema.parse(data).reply;
}
