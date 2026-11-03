import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";
import { useLoginForm } from "@/hooks/useLoginForm";

interface LoginFormProps {
  onAuthenticated: (token: string) => Promise<void>;
}

/** Email and password form. Validation and the API call live in useLoginForm. */
export function LoginForm({ onAuthenticated }: LoginFormProps) {
  const { form, onSubmit, serverError, isSubmitting } = useLoginForm(onAuthenticated);
  const { control, formState } = form;
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>{t("auth.login.emailLabel")}</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              accessibilityLabel={t("auth.login.emailLabel")}
            />
            {formState.errors.email && (
              <Text style={[styles.error, { color: colors.destructive }]}>{formState.errors.email.message}</Text>
            )}
          </View>
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>{t("auth.login.passwordLabel")}</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              secureTextEntry
              autoComplete="password"
              accessibilityLabel={t("auth.login.passwordLabel")}
            />
            {formState.errors.password && (
              <Text style={[styles.error, { color: colors.destructive }]}>{formState.errors.password.message}</Text>
            )}
          </View>
        )}
      />

      {serverError && <Text style={[styles.error, { color: colors.destructive }]}>{serverError}</Text>}

      <Pressable
        style={[styles.button, { backgroundColor: colors.primary }, isSubmitting && styles.buttonDisabled]}
        disabled={isSubmitting}
        onPress={() => void onSubmit()}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </Text>
      </Pressable>

      <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t("auth.login.hint")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: { fontSize: 13 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontWeight: "600" },
  hint: { fontSize: 13 },
});
