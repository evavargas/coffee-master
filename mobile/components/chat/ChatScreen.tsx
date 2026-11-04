import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowUp } from "lucide-react-native";

import { useAppTheme } from "@/context/ThemeContext";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { useChat } from "@/hooks/useChat";

/**
 * Chat conversation for the logged-in user. The message list takes the free space
 * and scrolls; the composer stays pinned at the bottom. Logic lives in useChat.
 */
export function ChatScreen() {
  const { messages, send, isLoading, error } = useChat();
  const [input, setInput] = useState("");
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const listRef = useRef<FlatList>(null);

  const suggestions = [
    t("chat.suggestions.ratio"),
    t("chat.suggestions.cappuccino"),
    t("chat.suggestions.bitterEspresso"),
  ];
  const canSend = !isLoading && input.trim().length > 0;

  function handleSend(text: string) {
    void send(text);
    setInput("");
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {messages.length === 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion}
              style={[styles.suggestion, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleSend(suggestion)}
            >
              <Text style={{ color: colors.foreground }}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          data={messages}
          keyExtractor={(_, index) => String(index)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          // Keep the latest message in view as the conversation grows, instead
          // of leaving the agent's reply scrolled out of sight.
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user" ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted },
              ]}
            >
              {item.role === "user" ? (
                <Text style={[styles.bubbleText, { color: colors.primaryForeground }]}>{item.content}</Text>
              ) : (
                <MarkdownMessage content={item.content} />
              )}
            </View>
          )}
        />
      )}

      {isLoading && <ActivityIndicator style={styles.loader} color={colors.primary} />}
      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

      <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          value={input}
          onChangeText={setInput}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={colors.mutedForeground}
          editable={!isLoading}
          multiline
          accessibilityLabel={t("chat.placeholder")}
        />
        <Pressable
          style={[
            styles.sendButton,
            { backgroundColor: colors.primary },
            !canSend && styles.sendButtonDisabled,
          ]}
          disabled={!canSend}
          onPress={() => handleSend(input)}
          accessibilityRole="button"
          accessibilityLabel={t("chat.send")}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <ArrowUp size={18} color={colors.primaryForeground} strokeWidth={2.5} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  suggestions: { gap: 8 },
  suggestion: { padding: 12, borderRadius: 10, borderWidth: 1 },
  list: { flex: 1, minHeight: 0 },
  listContent: { gap: 10, paddingBottom: 8 },
  bubble: { maxWidth: "85%", padding: 10, borderRadius: 14 },
  bubbleText: { lineHeight: 20 },
  loader: { marginVertical: 6 },
  error: { marginVertical: 4 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 8,
    padding: 6,
    borderWidth: 1,
    borderRadius: 22,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 140,
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.4 },
});
