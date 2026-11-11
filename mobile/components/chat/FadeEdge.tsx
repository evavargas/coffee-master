import { StyleSheet, View } from "react-native";

import { useAppTheme } from "@/context/ThemeContext";
import { withAlpha } from "@/lib/color";

const STEPS = 10;

/**
 * Soft edge over a scrolling list: the screen background fading in toward the edge, so messages do not end in a
 * hard cut and it is clear there is more to scroll. Stacked translucent strips, because React Native has no gradient
 * without a native module. It never takes touches.
 */
export function FadeEdge({ edge, height = 28 }: { edge: "top" | "bottom"; height?: number }) {
  const { colors } = useAppTheme();
  return (
    <View pointerEvents="none" style={[styles.edge, edge === "top" ? styles.top : styles.bottom, { height }]}>
      {Array.from({ length: STEPS }, (_, i) => {
        const t = (i + 0.5) / STEPS;
        return <View key={i} testID="fade-strip" style={[styles.strip, { backgroundColor: withAlpha(colors.background, edge === "top" ? 1 - t : t) }]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { position: "absolute", left: 0, right: 0 },
  top: { top: 0 },
  bottom: { bottom: 0 },
  strip: { flex: 1 },
});
