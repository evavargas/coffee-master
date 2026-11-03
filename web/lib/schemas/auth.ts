import { z } from "zod";

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

export type LoginFormValues = z.infer<ReturnType<typeof buildLoginSchema>>;
export type RegisterFormValues = z.infer<ReturnType<typeof buildRegisterSchema>>;
export type ForgotPasswordFormValues = z.infer<ReturnType<typeof buildForgotPasswordSchema>>;
export type ResetPasswordFormValues = z.infer<ReturnType<typeof buildResetPasswordSchema>>;

// Response shapes returned by the backend. Validated at the API boundary.
export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("bearer"),
  expires_in: z.number(),
});

export const messageResponseSchema = z.object({ message: z.string() });

export const userPublicSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
export type UserPublic = z.infer<typeof userPublicSchema>;
