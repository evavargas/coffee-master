import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";
import type { MyRecipeFilter } from "@/lib/api/myRecipes";

const filters: MyRecipeFilter[] = ["all", "favorites", "created", "saved"];

/** Segmented buttons mapped one-to-one to the `filter` query of GET /api/me/recipes. */
export function MyRecipesTabs({ value, onChange }: { value: MyRecipeFilter; onChange: (v: MyRecipeFilter) => void }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View accessibilityLabel={t("myRecipes.filtersLabel")} style={styles.wrap}>
      {filters.map((f) => {
        const selected = f === value;
        const label = t(`myRecipes.tabs.${f}`);
        return (
          <Pressable
            key={f}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(f)}
            style={[styles.tab, { borderColor: colors.border, backgroundColor: selected ? colors.primary : colors.card }]}
          >
            <Text style={{ color: selected ? colors.primaryForeground : colors.foreground }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
});
