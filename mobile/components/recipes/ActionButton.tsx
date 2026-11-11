import { Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/ui/Text";

import { useAppTheme } from "@/context/ThemeContext";

/** Outlined (or primary) action button, at least 44pt tall. `selected` marks toggles such as favorite. */
export function ActionButton({
  label,
  onPress,
  disabled,
  primary,
  selected,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
  selected?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          borderColor: selected ? "transparent" : colors.border,
          backgroundColor: selected ? colors.highlight : primary ? colors.primary : colors.card,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={{ color: selected ? colors.highlightForeground : primary ? colors.primaryForeground : colors.foreground, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
});
