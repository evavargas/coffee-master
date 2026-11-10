import "@/i18n";

import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "@/context/SessionContext";
import { ThemeProvider, useAppTheme } from "@/context/ThemeContext";
import { useAuthGuard } from "@/hooks/useAuthGuard";

function Root() {
  const { colors, scheme } = useAppTheme();
  const { isReady, isRedirecting } = useAuthGuard();

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {/* The navigator stays mounted so the guard can redirect once the session is restored. */}
      <Slot />
      {(!isReady || isRedirecting) && (
        <View style={[StyleSheet.absoluteFill, styles.flex, { backgroundColor: colors.background }]}>
          <ActivityIndicator style={styles.flex} color={colors.primary} />
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
