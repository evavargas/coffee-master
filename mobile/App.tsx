import "@/i18n";

import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context"; // <-- 1. Importar SafeAreaProvider

import { ChatScreen } from "@/components/chat/ChatScreen";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ThemeProvider, useAppTheme } from "@/context/ThemeContext";
import { useSession } from "@/hooks/useSession";

type AuthScreen = "login" | "register" | "forgotPassword";

function AppContent() {
  const { token, isReady, signIn, signOut } = useSession();
  const { colors, scheme } = useAppTheme();
  const { t } = useTranslation();
  const [authScreen, setAuthScreen] = useState<AuthScreen>("login");

  const insets = useSafeAreaInsets();

  if (!isReady) {
    return (
      <View style={[styles.safe, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </View>
    );
  }

  let authContent;
  switch (authScreen) {
    case "register":
      authContent = (
        <RegisterForm onConfirmed={() => setAuthScreen("login")} onBackToLogin={() => setAuthScreen("login")} />
      );
      break;
    case "forgotPassword":
      authContent = (
        <ForgotPasswordForm onDone={() => setAuthScreen("login")} onBackToLogin={() => setAuthScreen("login")} />
      );
      break;
    case "login":
    default:
      authContent = (
        <LoginForm
          onAuthenticated={signIn}
          onRequestRegister={() => setAuthScreen("register")}
          onRequestForgotPassword={() => setAuthScreen("forgotPassword")}
        />
      );
  }

  return (
    <View
      style={[
        styles.safe,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom
        }
      ]}
    >
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
      <View style={styles.body}>{token ? <ChatScreen /> : authContent}</View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
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