import { useRef } from "react";
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
import { ArrowUp, SquarePen } from "lucide-react-native";

import { useAppTheme } from "@/context/ThemeContext";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { useChat } from "@/hooks/useChat";
import { chatMessageMaxLength } from "@/lib/api/chat";

/**
 * Chat conversation for the logged-in user. The message list takes the free space
 * and scrolls; the composer stays pinned at the bottom. Logic lives in useChat.
 */
export function ChatScreen() {
  const {
    messages,
    input,
    setInput,
    isLoadingHistory,
    isLoading,
    isAwaitingFirstDelta,
    canStartNewConversation,
    error,
    send,
    newConversation,
  } = useChat();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const listRef = useRef<FlatList>(null);

  const suggestions = [
    t("chat.suggestions.ratio"),
    t("chat.suggestions.cappuccino"),
    t("chat.suggestions.bitterEspresso"),
  ];
  const isComposerLocked = isLoading || isLoadingHistory;
  const canSend = !isComposerLocked && input.trim().length > 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.toolbar}>
        <Pressable
          style={[
            styles.newConversation,
            { borderColor: colors.border },
            !canStartNewConversation && styles.disabled,
          ]}
          disabled={!canStartNewConversation}
          onPress={newConversation}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canStartNewConversation }}
        >
          <SquarePen size={14} color={colors.foreground} />
          <Text style={[styles.newConversationText, { color: colors.foreground }]}>{t("chat.newConversation")}</Text>
        </Pressable>
      </View>

      {isLoadingHistory ? (
        <View style={styles.historyLoader}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t("common.loading")} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion}
              style={[styles.suggestion, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => void send(suggestion)}
              accessibilityRole="button"
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
          // Fires on every delta too, since the growing bubble changes the content
          // height, so a streaming reply never ends up scrolled out of sight.
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
              ) : item.content === "" ? (
                <ActivityIndicator color={colors.primary} accessibilityLabel={t("common.loading")} />
              ) : (
                <MarkdownMessage content={item.content} />
              )}
            </View>
          )}
        />
      )}

      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

      <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          value={input}
          onChangeText={setInput}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={colors.mutedForeground}
          editable={!isComposerLocked}
          maxLength={chatMessageMaxLength}
          multiline
          accessibilityLabel={t("chat.placeholder")}
        />
        <Pressable
          style={[styles.sendButton, { backgroundColor: colors.primary }, !canSend && styles.disabled]}
          disabled={!canSend}
          onPress={() => void send(input)}
          accessibilityRole="button"
          accessibilityLabel={t("chat.send")}
        >
          {isAwaitingFirstDelta ? (
            <ActivityIndicator color={colors.primaryForeground} accessibilityLabel={t("common.loading")} />
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
  toolbar: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 8 },
  newConversation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 14,
  },
  newConversationText: { fontSize: 13, fontWeight: "600" },
  historyLoader: { flex: 1, alignItems: "center", justifyContent: "center" },
  suggestions: { gap: 8 },
  suggestion: { padding: 12, borderRadius: 10, borderWidth: 1 },
  list: { flex: 1, minHeight: 0 },
  listContent: { gap: 10, paddingBottom: 8 },
  bubble: { maxWidth: "85%", padding: 10, borderRadius: 14 },
  bubbleText: { lineHeight: 20 },
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
  disabled: { opacity: 0.4 },
});
