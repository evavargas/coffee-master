import { apiClient } from "@/lib/api/client";
import {
  messageResponseSchema,
  resetTokenResponseSchema,
  tokenResponseSchema,
  userPublicSchema,
  type MessageResponse,
  type ResetTokenResponse,
  type TokenResponse,
  type UserPublic,
} from "@/lib/schemas/auth";

// Thin functions over the backend auth endpoints (see backend/README.md).
// Each one validates the response with zod so a contract change fails loudly.

export async function registerAccount(input: { name: string; email: string; password: string }): Promise<MessageResponse> {
  const { data } = await apiClient.post("/api/auth/register", input);
  return messageResponseSchema.parse(data);
}

export async function resendConfirmation(email: string): Promise<MessageResponse> {
  const { data } = await apiClient.post("/api/auth/resend-confirmation", { email });
  return messageResponseSchema.parse(data);
}

export async function confirmEmail(input: { email: string; code: string }): Promise<MessageResponse> {
  const { data } = await apiClient.post("/api/auth/confirm-email", input);
  return messageResponseSchema.parse(data);
}

export async function login(input: { email: string; password: string }): Promise<TokenResponse> {
  const { data } = await apiClient.post("/api/auth/login", input);
  return tokenResponseSchema.parse(data);
}

export async function requestPasswordReset(email: string): Promise<MessageResponse> {
  const { data } = await apiClient.post("/api/auth/forgot-password", { email });
  return messageResponseSchema.parse(data);
}

export async function verifyResetCode(input: { email: string; code: string }): Promise<ResetTokenResponse> {
  const { data } = await apiClient.post("/api/auth/verify-reset-code", input);
  return resetTokenResponseSchema.parse(data);
}

export async function resetPassword(input: { resetToken: string; newPassword: string }): Promise<MessageResponse> {
  const { data } = await apiClient.post("/api/auth/reset-password", {
    reset_token: input.resetToken,
    new_password: input.newPassword,
  });
  return messageResponseSchema.parse(data);
}

export async function fetchCurrentUser(): Promise<UserPublic> {
  const { data } = await apiClient.get("/api/auth/me");
  return userPublicSchema.parse(data);
}
