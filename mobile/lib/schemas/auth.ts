import { z } from "zod";

import { exactSchema, type ApiSchemas } from "@/lib/api/contract";

// Validation for the auth forms. Messages are user-facing and come from i18n,
// so each schema is built with the current translator function.

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

// Shared by the confirm-email step and the reset-password code-verification
// step: both are an email plus the 6-digit code the user reads from their inbox.
export const buildCodeSchema = (t: Translate) =>
  z.object({
    email: z.string().trim().min(1, t("emailRequired")).email(t("emailInvalid")),
    code: z
      .string()
      .trim()
      .min(1, t("codeRequired"))
      .regex(/^\d{6}$/, t("codeInvalid")),
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
export type CodeFormValues = z.infer<ReturnType<typeof buildCodeSchema>>;
export type ResetPasswordFormValues = z.infer<ReturnType<typeof buildResetPasswordSchema>>;

// Response shape returned by POST /api/auth/login, validated at the API boundary.
export const tokenResponseSchema = exactSchema<ApiSchemas["TokenResponse"]>()(
  z.object({
    access_token: z.string(),
    token_type: z.string(),
    expires_in: z.number(),
  }),
);

// Generic `{message}` response shared by register, resend-confirmation,
// confirm-email, forgot-password, and reset-password.
export const messageResponseSchema = exactSchema<ApiSchemas["MessageResponse"]>()(
  z.object({ message: z.string() }),
);

// Returned by verify-reset-code: a short-lived, opaque session token the
// client holds and sends back unchanged to reset-password.
export const resetTokenResponseSchema = exactSchema<ApiSchemas["ResetTokenResponse"]>()(
  z.object({ reset_token: z.string() }),
);
