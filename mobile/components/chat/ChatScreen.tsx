import { useState } from "react";
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

import { useAppTheme } from "@/context/ThemeContext";
import { useChat } from "@/hooks/useChat";

/** Chat conversation for the logged-in user. Logic lives in useChat. */
export function ChatScreen() {
  const { messages, send, isLoading, error } = useChat();
  const [input, setInput] = useState("");
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  const suggestions = [
    t("chat.suggestions.ratio"),
    t("chat.suggestions.cappuccino"),
    t("chat.suggestions.bitterEspresso"),
  ];

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
          data={messages}
          keyExtractor={(_, index) => String(index)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user" ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted },
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  item.role === "user" ? { color: colors.primaryForeground } : { color: colors.foreground },
                ]}
              >
                {item.content}
              </Text>
            </View>
          )}
        />
      )}

      {isLoading && <ActivityIndicator style={styles.loader} color={colors.primary} />}
      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

      <View style={styles.composer}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          value={input}
          onChangeText={setInput}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={colors.mutedForeground}
          editable={!isLoading}
          multiline
        />
        <Pressable
          style={[styles.send, { backgroundColor: colors.primary }, (isLoading || !input.trim()) && styles.sendDisabled]}
          disabled={isLoading || !input.trim()}
          onPress={() => handleSend(input)}
        >
          <Text style={[styles.sendText, { color: colors.primaryForeground }]}>{t("chat.send")}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  suggestions: { gap: 8 },
  suggestion: { padding: 12, borderRadius: 10, borderWidth: 1 },
  list: { gap: 10, paddingBottom: 8 },
  bubble: { maxWidth: "85%", padding: 10, borderRadius: 14 },
  bubbleText: { lineHeight: 20 },
  loader: { marginVertical: 6 },
  error: { marginVertical: 4 },
  composer: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "flex-end" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
  },
  send: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  sendDisabled: { opacity: 0.5 },
  sendText: { fontWeight: "600" },
});
