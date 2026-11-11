import "@/i18n";

import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SplashView } from "@/components/layout/SplashView";
import { SessionProvider } from "@/context/SessionContext";
import { ThemeProvider, useAppTheme } from "@/context/ThemeContext";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { fontAssets } from "@/lib/fonts";

/**
 * Nothing but the splash is mounted until the fonts are ready. Texts laid out with a fallback font keep that
 * measure on Android and get clipped (a "ES" shown as "E"), so the screens must never render before the fonts.
 */
function FontGate({ children }: { children: ReactNode }) {
  // A font error falls back to the system font; the app must not stay on the splash.
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  if (!fontsLoaded && fontError === null) return <SplashView />;
  return <>{children}</>;
}

function Root() {
  const { colors, scheme } = useAppTheme();
  const { isReady, isRedirecting } = useAuthGuard();

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {/* The navigator stays mounted so the guard can redirect once the session is restored. */}
      <Slot />
      {(!isReady || isRedirecting) && (
        <View style={StyleSheet.absoluteFill}>
          <SplashView />
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FontGate>
          <SessionProvider>
            <Root />
          </SessionProvider>
        </FontGate>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
