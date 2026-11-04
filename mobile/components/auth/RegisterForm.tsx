import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FormField } from "@/components/auth/FormField";
import { useAppTheme } from "@/context/ThemeContext";
import { useConfirmEmailForm } from "@/hooks/useConfirmEmailForm";
import { useCountdown, VERIFICATION_CODE_EXPIRY_SECONDS } from "@/hooks/useCountdown";
import { useRegisterForm } from "@/hooks/useRegisterForm";
import { useResendConfirmation } from "@/hooks/useResendConfirmation";

interface RegisterFormProps {
  onConfirmed: () => void;
  onBackToLogin: () => void;
}

/** Name/email/password registration. On success, switches to an inline email-confirmation step. */
export function RegisterForm({ onConfirmed, onBackToLogin }: RegisterFormProps) {
  const { form, onSubmit, serverError, successMessage, isSubmitting } = useRegisterForm();
  const { control, formState, getValues } = form;
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  if (successMessage) {
    return <ConfirmEmailStep email={getValues("email")} onConfirmed={onConfirmed} onBackToLogin={onBackToLogin} />;
  }

  return (
    <View style={styles.container}>
      <FormField
        control={control}
        name="name"
        label={t("auth.register.nameLabel")}
        autoComplete="name"
        error={formState.errors.name}
      />
      <FormField
        control={control}
        name="email"
        label={t("auth.register.emailLabel")}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={formState.errors.email}
      />
      <FormField
        control={control}
        name="password"
        label={t("auth.register.passwordLabel")}
        secureTextEntry
        autoComplete="new-password"
        error={formState.errors.password}
      />

      {serverError && <Text style={[styles.error, { color: colors.destructive }]}>{serverError}</Text>}

      <Pressable
        style={[styles.button, { backgroundColor: colors.primary }, isSubmitting && styles.buttonDisabled]}
        disabled={isSubmitting}
        onPress={() => void onSubmit()}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          {isSubmitting ? t("auth.register.submitting") : t("auth.register.submit")}
        </Text>
      </Pressable>

      <Pressable onPress={onBackToLogin} accessibilityRole="button">
        <Text style={[styles.link, { color: colors.primary }]}>{t("auth.register.backToLogin")}</Text>
      </Pressable>
    </View>
  );
}

interface ConfirmEmailStepProps {
  email: string;
  onConfirmed: () => void;
  onBackToLogin: () => void;
}

/** Inline email + 6-digit code step shown right after registration succeeds. */
function ConfirmEmailStep({ email, onConfirmed, onBackToLogin }: ConfirmEmailStepProps) {
  const { form, onSubmit, serverError, successMessage, isSubmitting } = useConfirmEmailForm(email);
  const { control, formState } = form;
  const resend = useResendConfirmation(email);
  const { formatted, isExpired, restart } = useCountdown(VERIFICATION_CODE_EXPIRY_SECONDS);
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  // A resend issues a fresh code with a fresh 15-minute window, so the
  // countdown must restart, not keep ticking down from the old code's clock.
  async function handleResend() {
    await resend.resend();
    restart();
  }

  if (successMessage) {
    return (
      <View style={styles.container}>
        <Text style={[styles.status, { color: colors.foreground }]} accessibilityLiveRegion="polite">
          {successMessage}
        </Text>
        <Pressable onPress={onConfirmed} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.primary }]}>{t("auth.confirmEmail.backToLogin")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FormField
        control={control}
        name="email"
        label={t("auth.confirmEmail.emailLabel")}
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

      {serverError && <Text style={[styles.error, { color: colors.destructive }]}>{serverError}</Text>}

      <Pressable
        style={[styles.button, { backgroundColor: colors.primary }, isSubmitting && styles.buttonDisabled]}
        disabled={isSubmitting}
        onPress={() => void onSubmit()}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          {isSubmitting ? t("auth.confirmEmail.submitting") : t("auth.confirmEmail.submit")}
        </Text>
      </Pressable>

      <Pressable onPress={() => void handleResend()} disabled={resend.isSending} accessibilityRole="button">
        <Text style={[styles.link, { color: colors.primary }]}>
          {resend.isSending ? t("auth.code.resending") : t("auth.code.resendCode")}
        </Text>
      </Pressable>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t("auth.code.resendHint")}</Text>
      {resend.message && <Text style={[styles.status, { color: colors.foreground }]}>{resend.message}</Text>}
      {resend.error && <Text style={[styles.error, { color: colors.destructive }]}>{resend.error}</Text>}

      <Pressable onPress={onBackToLogin} accessibilityRole="button">
        <Text style={[styles.link, { color: colors.primary }]}>{t("auth.register.backToLogin")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  error: { fontSize: 13 },
  status: { fontSize: 14 },
  hint: { fontSize: 13 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontWeight: "600" },
  link: { fontSize: 13, fontWeight: "600" },
});
