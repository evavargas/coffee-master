import { z } from "zod";

import type { components } from "@/lib/api/schema.gen";

// Validation schemas for the auth forms. Messages are user-facing, so they come from a
// translate function (the `validation` namespace) instead of being hardcoded.
// Types are inferred from the factories' return types: there is one source of truth for each shape.

type Translate = (key: string) => string;

export const buildLoginSchema = (t: Translate) =>
  z.object({
    email: z.string().trim().min(1, t("emailRequired")).email(t("emailInvalid")),
    password: z.string().min(1, t("passwordRequired")),
  });

export const buildRegisterSchema = (t: Translate) =>
  z.object({
    name: z.string().trim().min(1, t("nameRequired")).max(60, t("nameMax")),
    email: z.string().trim().min(1, t("emailRequired")).email(t("emailInvalid")),
    password: z.string().min(8, t("passwordMin")).max(128, t("passwordMax")),
  });

export const buildForgotPasswordSchema = (t: Translate) =>
  z.object({
    email: z.string().trim().min(1, t("emailRequired")).email(t("emailInvalid")),
  });

export const buildResetPasswordSchema = (t: Translate) =>
  z
    .object({
      password: z.string().min(8, t("passwordMin")).max(128, t("passwordMax")),
      confirmPassword: z.string().min(1, t("confirmPasswordRequired")),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: t("passwordsMismatch"),
      path: ["confirmPassword"],
    });

// Shared by the confirm-email and verify-reset-code steps: a 6-digit numeric code.
export const buildCodeSchema = (t: Translate) =>
  z.object({
    code: z.string().trim().min(1, t("codeRequired")).length(6, t("codeInvalid")).regex(/^\d+$/, t("codeInvalid")),
  });

export type LoginFormValues = z.infer<ReturnType<typeof buildLoginSchema>>;
export type RegisterFormValues = z.infer<ReturnType<typeof buildRegisterSchema>>;
export type ForgotPasswordFormValues = z.infer<ReturnType<typeof buildForgotPasswordSchema>>;
export type ResetPasswordFormValues = z.infer<ReturnType<typeof buildResetPasswordSchema>>;
export type CodeFormValues = z.infer<ReturnType<typeof buildCodeSchema>>;

// Response shapes returned by the backend. Validated at the API boundary.
// Each `satisfies` ties the schema to the types generated from backend/openapi.json
// (`npm run gen:api`), so a contract change fails `npm run typecheck`.
type Schemas = components["schemas"];

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("bearer"),
  expires_in: z.number(),
}) satisfies z.ZodType<Schemas["TokenResponse"]>;

export const messageResponseSchema = z.object({ message: z.string() }) satisfies z.ZodType<Schemas["MessageResponse"]>;

// Short-lived JWT returned by verify-reset-code, exchanged for a new password at reset-password.
// Held only in memory (component/hook state) - never shown to the user.
export const resetTokenResponseSchema = z.object({ reset_token: z.string() }) satisfies z.ZodType<
  Schemas["ResetTokenResponse"]
>;

export const userPublicSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
}) satisfies z.ZodType<Schemas["UserPublic"]>;

export type TokenResponse = z.infer<typeof tokenResponseSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
export type ResetTokenResponse = z.infer<typeof resetTokenResponseSchema>;
export type UserPublic = z.infer<typeof userPublicSchema>;
