import { z } from "zod";

// Validation for the login form. Messages are user-facing and come from i18n,
// so the schema is built with the current translator function.
export const buildLoginSchema = (t: (key: string) => string) =>
  z.object({
    email: z.string().trim().min(1, t("emailRequired")).email(t("emailInvalid")),
    password: z.string().min(1, t("passwordRequired")),
  });

export type LoginFormValues = z.infer<ReturnType<typeof buildLoginSchema>>;

// Response shape returned by POST /api/auth/login, validated at the API boundary.
export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("bearer"),
  expires_in: z.number(),
});
