import { useMemo } from "react";
import { StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";

import { useAppTheme } from "@/context/ThemeContext";

/**
 * Renders an assistant reply (Markdown from the model) inside a chat bubble.
 * Styles follow the active theme. Raw HTML is never rendered: the library only
 * shows Markdown syntax as text or native elements.
 */
export function MarkdownMessage({ content }: { content: string }) {
  const { colors } = useAppTheme();
  const markdownStyles = useMemo(() => buildMarkdownStyles(colors), [colors]);

  return <Markdown style={markdownStyles}>{content}</Markdown>;
}

type ThemeColors = ReturnType<typeof useAppTheme>["colors"];

function buildMarkdownStyles(colors: ThemeColors) {
  return StyleSheet.create({
    body: { color: colors.foreground, fontSize: 15, lineHeight: 21 },
    heading1: { color: colors.foreground, fontSize: 17, fontWeight: "600", marginVertical: 6 },
    heading2: { color: colors.foreground, fontSize: 17, fontWeight: "600", marginVertical: 6 },
    heading3: { color: colors.foreground, fontSize: 15, fontWeight: "600", marginVertical: 4 },
    paragraph: { marginTop: 0, marginBottom: 6 },
    strong: { fontWeight: "600" },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { marginVertical: 2 },
    code_inline: {
      backgroundColor: colors.background,
      color: colors.foreground,
      paddingHorizontal: 4,
      borderRadius: 4,
      fontSize: 13,
    },
    link: { color: colors.primary, textDecorationLine: "underline" },
    table: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, marginVertical: 6 },
    tr: { borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row" },
    th: { flex: 1, padding: 6, fontWeight: "600" },
    td: { flex: 1, padding: 6 },
  });
}
