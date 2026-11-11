import { Image, StyleSheet, View } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";

const splashLight = require("../../assets/splash-light.png");
const splashDark = require("../../assets/splash-dark.png");

/** First thing the user sees while the app loads: the brand sticker, light or dark like the theme. */
export function SplashView() {
  const { colors, scheme } = useAppTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Image source={scheme === "dark" ? splashDark : splashLight} style={styles.image} resizeMode="contain" accessibilityElementsHidden />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: 220, height: 220 },
});
