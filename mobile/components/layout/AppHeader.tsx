import { useTranslation } from "react-i18next";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Plus } from "lucide-react-native";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Text } from "@/components/ui/Text";
import { useConversationPanel } from "@/context/ConversationPanelContext";
import { useAppTheme } from "@/context/ThemeContext";
import { fonts } from "@/lib/fonts";

function Brand({ subtitle }: { subtitle?: string }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View style={styles.brand}>
      <Image source={require("../../assets/brand/cup-lavanda.png")} style={styles.cup} accessibilityElementsHidden importantForAccessibility="no" />
      <View>
        <Text style={[styles.title, { color: colors.primary }]}>{t("common.appTitle")}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

/** Header of the auth screens: brand plus the language and theme switchers. */
export function AppHeader() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <Brand subtitle={t("common.appSubtitle")} />
      <View style={styles.actions}>
        <LanguageSwitcher />
        <ThemeToggle />
      </View>
    </View>
  );
}

/** Header of the signed-in tabs: menu (opens the side panel), brand and "new conversation". */
export function TabsHeader() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { open, conversations } = useConversationPanel();

  return (
    <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <Pressable style={styles.iconButton} onPress={open} accessibilityRole="button" accessibilityLabel={t("nav.menu")}>
        <Menu size={22} color={colors.foreground} />
      </Pressable>
      <View style={styles.brandSlot}>
        <Brand />
      </View>
      <Pressable
        style={[styles.iconButton, conversations.isCreating && styles.disabled]}
        onPress={() => void conversations.startNew()}
        disabled={conversations.isCreating}
        accessibilityRole="button"
        accessibilityLabel={t("chat.switcher.new")}
        accessibilityState={{ disabled: conversations.isCreating }}
      >
        <Plus size={22} color={colors.foreground} />
      </Pressable>
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
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandSlot: { flex: 1, paddingHorizontal: 8 },
  cup: { width: 36, height: 36 },
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.4 },
  title: { fontSize: 24, fontFamily: fonts.display },
  subtitle: { marginTop: 2, fontFamily: fonts.hand },
});
