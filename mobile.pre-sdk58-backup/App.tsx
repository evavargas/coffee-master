import "@/i18n";

import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { ChatScreen } from "@/components/chat/ChatScreen";
import { LoginForm } from "@/components/auth/LoginForm";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ThemeProvider, useAppTheme } from "@/context/ThemeContext";
import { useSession } from "@/hooks/useSession";

function AppContent() {
  const { token, isReady, signIn, signOut } = useSession();
  const { colors, scheme } = useAppTheme();
  const { t } = useTranslation();

  if (!isReady) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.primary }]}>{t("common.appTitle")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t("common.appSubtitle")}</Text>
        </View>
        <View style={styles.headerActions}>
          <LanguageSwitcher />
          <ThemeToggle />
          {token && (
            <Pressable onPress={() => void signOut()} accessibilityRole="button">
              <Text style={[styles.signOut, { color: colors.primary }]}>{t("common.signOut")}</Text>
            </Pressable>
          )}
        </View>
      </View>
      <View style={styles.body}>{token ? <ChatScreen /> : <LoginForm onAuthenticated={signIn} />}</View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { marginTop: 2 },
  signOut: { fontWeight: "600" },
  body: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
});
