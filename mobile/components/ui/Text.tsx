import type { ComponentPropsWithRef } from "react";
import { StyleSheet, Text as RNText } from "react-native";

import { bodyFont } from "@/lib/fonts";

/** `Text` with the brand body font. An explicit `fontFamily` wins; otherwise `fontWeight` picks the file. Sizes are untouched. */
export function Text({ style, ...props }: ComponentPropsWithRef<typeof RNText>) {
  const flat = StyleSheet.flatten(style);
  return <RNText {...props} style={[style, { fontFamily: flat?.fontFamily ?? bodyFont(flat?.fontWeight), fontWeight: "normal" }]} />;
}
