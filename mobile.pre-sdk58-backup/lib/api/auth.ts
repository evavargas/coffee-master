import { apiClient } from "@/lib/api/client";
import { tokenResponseSchema } from "@/lib/schemas/auth";

// Thin function over the backend login endpoint (see backend/README.md).
// Registration and password recovery run in the web app for now.
export async function login(input: { email: string; password: string }): Promise<string> {
  const { data } = await apiClient.post("/api/auth/login", input);
  return tokenResponseSchema.parse(data).access_token;
}
