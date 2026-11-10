import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";

/** Themed full-height container with the app's horizontal padding. */
export function Screen({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return <View style={[styles.body, { backgroundColor: colors.background }]}>{children}</View>;
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
});
