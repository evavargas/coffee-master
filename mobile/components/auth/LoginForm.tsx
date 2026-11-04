import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FormField } from "@/components/auth/FormField";
import { useAppTheme } from "@/context/ThemeContext";
import { useLoginForm } from "@/hooks/useLoginForm";

interface LoginFormProps {
  onAuthenticated: (token: string) => Promise<void>;
  onRequestRegister: () => void;
  onRequestForgotPassword: () => void;
}

/** Email and password form. Validation and the API call live in useLoginForm. */
export function LoginForm({ onAuthenticated, onRequestRegister, onRequestForgotPassword }: LoginFormProps) {
  const { form, onSubmit, serverError, isSubmitting } = useLoginForm(onAuthenticated);
  const { control, formState } = form;
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <FormField
        control={control}
        name="email"
        label={t("auth.login.emailLabel")}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={formState.errors.email}
      />
      <FormField
        control={control}
        name="password"
        label={t("auth.login.passwordLabel")}
        secureTextEntry
        autoComplete="password"
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
          {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </Text>
      </Pressable>

      <Pressable onPress={onRequestRegister} accessibilityRole="button">
        <Text style={[styles.link, { color: colors.primary }]}>{t("auth.login.createAccount")}</Text>
      </Pressable>
      <Pressable onPress={onRequestForgotPassword} accessibilityRole="button">
        <Text style={[styles.link, { color: colors.primary }]}>{t("auth.login.forgotPassword")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  error: { fontSize: 13 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontWeight: "600" },
  link: { fontSize: 13, fontWeight: "600" },
});
