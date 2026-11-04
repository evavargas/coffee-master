import { apiClient } from "@/lib/api/client";
import type { ApiSchemas } from "@/lib/api/contract";
import { messageResponseSchema, resetTokenResponseSchema, tokenResponseSchema } from "@/lib/schemas/auth";

// Thin functions over the backend auth endpoints (see backend/README.md).

export async function login(input: { email: string; password: string }): Promise<string> {
  const { data } = await apiClient.post("/api/auth/login", input satisfies ApiSchemas["LoginRequest"]);
  return tokenResponseSchema.parse(data).access_token;
}

export async function registerAccount(input: { name: string; email: string; password: string }): Promise<string> {
  const { data } = await apiClient.post("/api/auth/register", input satisfies ApiSchemas["RegisterRequest"]);
  return messageResponseSchema.parse(data).message;
}

export async function resendConfirmation(email: string): Promise<string> {
  const { data } = await apiClient.post("/api/auth/resend-confirmation", { email } satisfies ApiSchemas["EmailRequest"]);
  return messageResponseSchema.parse(data).message;
}

// `code` is the 6-digit string the user reads from the confirmation email.
export async function confirmEmail(input: { email: string; code: string }): Promise<string> {
  const { data } = await apiClient.post("/api/auth/confirm-email", input satisfies ApiSchemas["ConfirmEmailRequest"]);
  return messageResponseSchema.parse(data).message;
}

export async function requestPasswordReset(email: string): Promise<string> {
  const { data } = await apiClient.post("/api/auth/forgot-password", { email } satisfies ApiSchemas["EmailRequest"]);
  return messageResponseSchema.parse(data).message;
}

// Returns the backend's short-lived `reset_token`, to be held in state and
// sent back unchanged to resetPassword.
export async function verifyResetCode(input: { email: string; code: string }): Promise<string> {
  const { data } = await apiClient.post("/api/auth/verify-reset-code", input satisfies ApiSchemas["VerifyResetCodeRequest"]);
  return resetTokenResponseSchema.parse(data).reset_token;
}

export async function resetPassword(input: { resetToken: string; newPassword: string }): Promise<string> {
  const { data } = await apiClient.post("/api/auth/reset-password", {
    reset_token: input.resetToken,
    new_password: input.newPassword,
  } satisfies ApiSchemas["ResetPasswordRequest"]);
  return messageResponseSchema.parse(data).message;
}
