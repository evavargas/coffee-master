import { Controller, type Control, type FieldError, type FieldValues, type Path } from "react-hook-form";
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";

interface FormFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
  error?: FieldError;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  secureTextEntry?: boolean;
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
  secureTextEntry,
  accessibilityLabel,
  multiline,
  maxLength,
}: FormFieldProps<TFieldValues>) {
  const { colors } = useAppTheme();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
          <TextInput
            style={[
              styles.input,
              multiline && styles.multiline,
              { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
            ]}
            value={typeof value === "string" ? value : ""}
            onChangeText={onChange}
            onBlur={onBlur}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoComplete={autoComplete}
            secureTextEntry={secureTextEntry}
            accessibilityLabel={accessibilityLabel ?? label}
            multiline={multiline}
            maxLength={maxLength}
          />
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
  error: { fontSize: 13 },
});
