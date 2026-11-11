import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";

import { FormField } from "@/components/auth/FormField";
import { useAppTheme } from "@/context/ThemeContext";
import { useCountdown, VERIFICATION_CODE_EXPIRY_SECONDS } from "@/hooks/useCountdown";
import { useForgotPasswordForm } from "@/hooks/useForgotPasswordForm";
import { useResetPasswordForm } from "@/hooks/useResetPasswordForm";
import { useVerifyResetCode } from "@/hooks/useVerifyResetCode";

type Step = "email" | "code" | "password";

interface ForgotPasswordFormProps {
  onDone: () => void;
  onBackToLogin: () => void;
}

/**
 * Password recovery in three local steps: request a code, verify it, then
 * set a new password with the short-lived reset token from the previous step.
 */
export function ForgotPasswordForm({ onDone, onBackToLogin }: ForgotPasswordFormProps) {
  const [step, setStep] = useState<Step>("email");
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const requestForm = useForgotPasswordForm();
  const email = requestForm.form.getValues("email");
  const verifyForm = useVerifyResetCode(email);
  const { formatted, isExpired, restart } = useCountdown(VERIFICATION_CODE_EXPIRY_SECONDS);

  // A resend issues a fresh code with a fresh 15-minute window, so the
  // countdown must restart, not keep ticking down from the old code's clock.
  async function handleResend() {
    await requestForm.onSubmit();
    restart();
  }

  // Move to the code step once the backend confirms the code was sent.
  useEffect(() => {
    if (requestForm.successMessage) setStep("code");
  }, [requestForm.successMessage]);

  // Move to the password step once the code is verified and we have a reset token.
  useEffect(() => {
    if (verifyForm.resetToken) setStep("password");
  }, [verifyForm.resetToken]);

  if (step === "password" && verifyForm.resetToken) {
    return (
      <ResetPasswordStep resetToken={verifyForm.resetToken} onDone={onDone} onBackToLogin={onBackToLogin} />
    );
  }

  if (step === "code") {
    const { control, formState } = verifyForm.form;
    return (
      <View style={styles.container}>
        <FormField
          control={control}
          name="email"
          label={t("auth.forgotPassword.emailLabel")}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={formState.errors.email}
        />
        <FormField
          control={control}
          name="code"
          label={t("auth.code.codeLabel")}
          keyboardType="number-pad"
          error={formState.errors.code}
        />
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {isExpired ? t("auth.code.expired") : t("auth.code.expiresIn", { time: formatted })}
        </Text>

        {verifyForm.serverError && (
          <Text style={[styles.error, { color: colors.destructive }]}>{verifyForm.serverError}</Text>
        )}

        <Pressable
          style={[
            styles.button,
            { backgroundColor: colors.primary },
            verifyForm.isSubmitting && styles.buttonDisabled,
          ]}
          disabled={verifyForm.isSubmitting}
          onPress={() => void verifyForm.onSubmit()}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
            {verifyForm.isSubmitting ? t("auth.verifyResetCode.submitting") : t("auth.verifyResetCode.submit")}
          </Text>
        </Pressable>

        <Pressable onPress={() => void handleResend()} disabled={requestForm.isSubmitting} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.primary }]}>
            {requestForm.isSubmitting ? t("auth.code.resending") : t("auth.code.resendCode")}
          </Text>
        </Pressable>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t("auth.code.resendHint")}</Text>
        {requestForm.serverError && (
          <Text style={[styles.error, { color: colors.destructive }]}>{requestForm.serverError}</Text>
        )}

        <Pressable onPress={onBackToLogin} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.primary }]}>{t("auth.forgotPassword.backToLogin")}</Text>
        </Pressable>
      </View>
    );
  }

  const { control, formState } = requestForm.form;
  return (
    <View style={styles.container}>
      <FormField
        control={control}
        name="email"
        label={t("auth.forgotPassword.emailLabel")}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={formState.errors.email}
      />

      {requestForm.serverError && (
        <Text style={[styles.error, { color: colors.destructive }]}>{requestForm.serverError}</Text>
      )}

      <Pressable
        style={[
          styles.button,
          { backgroundColor: colors.primary },
          requestForm.isSubmitting && styles.buttonDisabled,
        ]}
        disabled={requestForm.isSubmitting}
        onPress={() => void requestForm.onSubmit()}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          {requestForm.isSubmitting ? t("auth.forgotPassword.submitting") : t("auth.forgotPassword.submit")}
        </Text>
      </Pressable>

      <Pressable onPress={onBackToLogin} accessibilityRole="button">
        <Text style={[styles.link, { color: colors.primary }]}>{t("auth.forgotPassword.backToLogin")}</Text>
      </Pressable>
    </View>
  );
}

interface ResetPasswordStepProps {
  resetToken: string;
  onDone: () => void;
  onBackToLogin: () => void;
}

/** Final step: new password + confirmation, submitted with the reset token from the previous step. */
function ResetPasswordStep({ resetToken, onDone, onBackToLogin }: ResetPasswordStepProps) {
  const { form, onSubmit, serverError, successMessage, isSubmitting } = useResetPasswordForm(resetToken);
  const { control, formState } = form;
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  if (successMessage) {
    return (
      <View style={styles.container}>
        <Text style={[styles.status, { color: colors.foreground }]} accessibilityLiveRegion="polite">
          {successMessage}
        </Text>
        <Pressable onPress={onDone} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.primary }]}>{t("auth.resetPassword.backToLogin")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FormField
        control={control}
        name="password"
        label={t("auth.resetPassword.passwordLabel")}
        secureTextEntry
        autoComplete="new-password"
        error={formState.errors.password}
      />
      <FormField
        control={control}
        name="confirmPassword"
        label={t("auth.resetPassword.confirmPasswordLabel")}
        secureTextEntry
        autoComplete="new-password"
        error={formState.errors.confirmPassword}
      />

      {serverError && <Text style={[styles.error, { color: colors.destructive }]}>{serverError}</Text>}

      <Pressable
        style={[styles.button, { backgroundColor: colors.primary }, isSubmitting && styles.buttonDisabled]}
        disabled={isSubmitting}
        onPress={() => void onSubmit()}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          {isSubmitting ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}
        </Text>
      </Pressable>

      <Pressable onPress={onBackToLogin} accessibilityRole="button">
        <Text style={[styles.link, { color: colors.primary }]}>{t("auth.resetPassword.backToLogin")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  error: { fontSize: 13 },
  status: { fontSize: 14 },
  hint: { fontSize: 13 },
  button: { borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontWeight: "600" },
  link: { fontSize: 13, fontWeight: "600" },
});
