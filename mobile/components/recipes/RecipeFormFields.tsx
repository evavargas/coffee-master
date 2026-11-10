import { useState } from "react";
import { Controller, get, type Control, type FieldErrors, type Path } from "react-hook-form";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";
import type { RecipeFormValues } from "@/lib/schemas/recipeForm";

type Name = Path<RecipeFormValues>;

export interface FieldCtx {
  control: Control<RecipeFormValues>;
  errors: FieldErrors<RecipeFormValues>;
}

const errorOf = (errors: FieldErrors<RecipeFormValues>, name: Name) => (get(errors, name) as { message?: string } | undefined)?.message;

/** Empty text means "not set"; unparsable text becomes NaN so the schema reports it. Accepts a decimal comma. */
export const toNumber = (text: string) => {
  const clean = text.trim();
  if (clean === "") return undefined;
  // Digits with one optional separator only: Number() alone would accept hex, exponents and "Infinity".
  return /^\d*[.,]?\d*$/.test(clean) ? Number(clean.replace(",", ".")) : NaN;
};

function ErrorText({ message }: { message?: string }) {
  const { colors } = useAppTheme();
  return message ? (
    <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
      {message}
    </Text>
  ) : null;
}

/** Numeric input. It keeps what the user typed ("1." stays "1.") and writes the parsed number to the form. */
export function NumberField({ name, label, ctx, integer }: { name: Name; label: string; ctx: FieldCtx; integer?: boolean }) {
  const { colors } = useAppTheme();
  const message = errorOf(ctx.errors, name);
  return (
    <Controller
      control={ctx.control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <NumberInput label={label} initial={typeof value === "number" ? String(value) : ""} onChange={onChange} onBlur={onBlur} integer={integer} borderColor={message ? colors.destructive : colors.border}>
          <ErrorText message={message} />
        </NumberInput>
      )}
    />
  );
}

function NumberInput({
  label,
  initial,
  onChange,
  onBlur,
  integer,
  borderColor,
  children,
}: {
  label: string;
  initial: string;
  onChange: (v: number | undefined) => void;
  onBlur: () => void;
  integer?: boolean;
  borderColor: string;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const [text, setText] = useState(initial);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          onChange(toNumber(v));
        }}
        onBlur={onBlur}
        keyboardType={integer ? "number-pad" : "decimal-pad"}
        accessibilityLabel={label}
        style={[styles.input, { backgroundColor: colors.card, borderColor, color: colors.foreground }]}
      />
      {children}
    </View>
  );
}

export function RangeFields({ name, label, ctx, minLabel, maxLabel }: { name: string; label: string; ctx: FieldCtx; minLabel: string; maxLabel: string }) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityLabel={label} style={styles.group}>
      <Text style={[styles.legend, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.pair}>
        <View style={styles.half}>
          <NumberField name={`${name}.min` as Name} label={`${label} ${minLabel}`} ctx={ctx} />
        </View>
        <View style={styles.half}>
          <NumberField name={`${name}.max` as Name} label={`${label} ${maxLabel}`} ctx={ctx} />
        </View>
      </View>
    </View>
  );
}

/** Single choice shown as chips (selected state exposed to screen readers). */
export function ChoiceField({ name, label, ctx, options }: { name: Name; label: string; ctx: FieldCtx; options: [string, string][] }) {
  const { colors } = useAppTheme();
  return (
    <Controller
      control={ctx.control}
      name={name}
      render={({ field: { onChange, value } }) => (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
          <View style={styles.chips}>
            {options.map(([optionValue, text]) => {
              const selected = value === optionValue;
              return (
                <Pressable
                  key={optionValue}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}: ${text}`}
                  accessibilityState={{ selected }}
                  onPress={() => onChange(optionValue)}
                  style={[styles.chip, { borderColor: colors.border, backgroundColor: selected ? colors.primary : colors.card }]}
                >
                  <Text style={{ color: selected ? colors.primaryForeground : colors.foreground }}>{text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "500" },
  legend: { fontSize: 14, fontWeight: "500" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
  error: { fontSize: 13 },
  group: { gap: 6 },
  pair: { flexDirection: "row", gap: 8 },
  half: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
});
