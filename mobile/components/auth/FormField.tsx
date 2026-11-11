import { useState } from "react";
import { Controller, type Control, type FieldError, type FieldValues, type Path } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View, type KeyboardTypeOptions, type TextInputProps } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { Text } from "@/components/ui/Text";
import { TextInput } from "@/components/ui/TextInput";

import { useAppTheme } from "@/context/ThemeContext";

interface FormFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
  error?: FieldError;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  /** iOS AutoFill hint (the counterpart of `autoComplete`). */
  textContentType?: TextInputProps["textContentType"];
  autoCorrect?: boolean;
  secureTextEntry?: boolean;
  /** With `secureTextEntry`: adds an eye button that shows or hides what was typed. */
  revealable?: boolean;
  accessibilityLabel?: string;
  multiline?: boolean;
  maxLength?: number;
}

/**
 * Shared Controller + themed TextInput + label + error block for every auth form field.
 * Extracted from the block that used to be inlined per field in LoginForm.
 */
export function FormField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  error,
  keyboardType,
  autoCapitalize,
  autoComplete,
  textContentType,
  autoCorrect,
  secureTextEntry,
  revealable,
  accessibilityLabel,
  multiline,
  maxLength,
}: FormFieldProps<TFieldValues>) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const canReveal = Boolean(secureTextEntry && revealable);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
          <View>
            <TextInput
              style={[
                styles.input,
                multiline && styles.multiline,
                canReveal && styles.revealable,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
              value={typeof value === "string" ? value : ""}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType={keyboardType}
              autoCapitalize={autoCapitalize}
              autoComplete={autoComplete}
              textContentType={textContentType}
              autoCorrect={autoCorrect}
              secureTextEntry={secureTextEntry && !visible}
              accessibilityLabel={accessibilityLabel ?? label}
              multiline={multiline}
              maxLength={maxLength}
            />
            {canReveal && (
              <Pressable
                style={styles.eye}
                onPress={() => setVisible((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={t(visible ? "common.hidePassword" : "common.showPassword")}
                accessibilityState={{ selected: visible }}
              >
                {visible ? <EyeOff size={18} color={colors.mutedForeground} /> : <Eye size={18} color={colors.mutedForeground} />}
              </Pressable>
            )}
          </View>
          {error && <Text style={[styles.error, { color: colors.destructive }]}>{error.message}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  revealable: { paddingRight: 44 },
  eye: { position: "absolute", right: 0, top: 0, bottom: 0, width: 44, alignItems: "center", justifyContent: "center" },
  error: { fontSize: 13 },
});
