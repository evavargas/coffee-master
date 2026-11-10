import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useAppTheme } from "@/context/ThemeContext";
import { useSignOut } from "@/hooks/useSignOut";

/** Brand title plus language/theme switchers; the sign-out button only shows inside the tabs. */
export function AppHeader({ showSignOut = false }: { showSignOut?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();

  return (
    <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View>
        <Text style={[styles.title, { color: colors.primary }]}>{t("common.appTitle")}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t("common.appSubtitle")}</Text>
      </View>
      <View style={styles.actions}>
        <LanguageSwitcher />
        <ThemeToggle />
        {showSignOut && (
          <Pressable onPress={() => void signOut()} accessibilityRole="button">
            <Text style={[styles.signOut, { color: colors.primary }]}>{t("nav.signOut")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { marginTop: 2 },
  signOut: { fontWeight: "600" },
});
