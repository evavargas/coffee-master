/** Font families of the brand system. Weights are separate families on React Native, so a weight maps to a file. */
export const fonts = {
  regular: "RobotoMono_400Regular",
  medium: "RobotoMono_500Medium",
  semibold: "RobotoMono_600SemiBold",
  bold: "RobotoMono_700Bold",
  display: "BagelFatOne",
  hand: "GochiHand",
} as const;

/** Files loaded at startup by `useFonts` in `app/_layout.tsx`. */
export const fontAssets = {
  [fonts.regular]: require("../assets/fonts/RobotoMono_400Regular.ttf"),
  [fonts.medium]: require("../assets/fonts/RobotoMono_500Medium.ttf"),
  [fonts.semibold]: require("../assets/fonts/RobotoMono_600SemiBold.ttf"),
  [fonts.bold]: require("../assets/fonts/RobotoMono_700Bold.ttf"),
  [fonts.display]: require("../assets/fonts/BagelFatOne-Regular.ttf"),
  [fonts.hand]: require("../assets/fonts/GochiHand-Regular.ttf"),
};

/** Body family for a style's `fontWeight`: 500 medium, 600 semibold, 700 and above bold, otherwise regular. */
export function bodyFont(weight: unknown): string {
  const w = weight === "bold" ? 700 : Number(weight);
  if (w >= 700) return fonts.bold;
  if (w >= 600) return fonts.semibold;
  if (w >= 500) return fonts.medium;
  return fonts.regular;
}
