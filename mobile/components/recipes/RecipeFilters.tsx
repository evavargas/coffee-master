import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { TextInput } from "@/components/ui/TextInput";

import { useAppTheme } from "@/context/ThemeContext";
import { recipeMethods, type RecipeMethod } from "@/lib/api/recipes";

interface Props {
  q: string;
  method: RecipeMethod | undefined;
  onQChange: (q: string) => void;
  onMethodChange: (method: RecipeMethod | undefined) => void;
}

export function RecipeFilters({ q, method, onQChange, onMethodChange }: Props) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const chip = (value: RecipeMethod | undefined, label: string) => {
    const selected = method === value;
    return (
      <Pressable
        key={value ?? "all"}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={() => onMethodChange(value)}
        style={[styles.chip, { borderColor: colors.border, backgroundColor: selected ? colors.primary : colors.card }]}
      >
        <Text style={{ color: selected ? colors.primaryForeground : colors.foreground }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        value={q}
        onChangeText={onQChange}
        placeholder={t("recipes.searchPlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={t("recipes.searchLabel")}
        returnKeyType="search"
        autoCorrect={false}
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
      />
      <View accessibilityLabel={t("recipes.methodLabel")} style={styles.chips}>
        {chip(undefined, t("recipes.allMethods"))}
        {recipeMethods.map((m) => chip(m, t(`recipes.methods.${m}`)))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 44 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
});
