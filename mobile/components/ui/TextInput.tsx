import type { ComponentPropsWithRef } from "react";
import { TextInput as RNTextInput } from "react-native";

import { fonts } from "@/lib/fonts";

/** `TextInput` with the brand body font; sizes are untouched. */
export function TextInput({ style, ...props }: ComponentPropsWithRef<typeof RNTextInput>) {
  return <RNTextInput {...props} style={[style, { fontFamily: fonts.regular }]} />;
}
