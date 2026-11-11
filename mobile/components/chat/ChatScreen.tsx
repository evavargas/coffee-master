import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { TextInput } from "@/components/ui/TextInput";
import { ArrowUp } from "lucide-react-native";

import { useAppTheme } from "@/context/ThemeContext";
import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { CardErrorBoundary } from "@/components/chat/CardErrorBoundary";
import { RecipeBanner } from "@/components/chat/RecipeBanner";
import { RecipeProposalCard } from "@/components/chat/RecipeProposalCard";
import { useChat } from "@/hooks/useChat";
import { chatMessageMaxLength } from "@/lib/api/chat";
import { setCurrentConversation } from "@/lib/conversationsStore";

/**
 * Chat conversation for the logged-in user. The message list takes the free space
 * and scrolls; the composer stays pinned at the bottom. Logic lives in useChat.
 */
export function ChatScreen() {
  const {
    messages,
    conversationId,
    recipeRef,
    input,
    setInput,
    isLoadingHistory,
    isLoading,
    isAwaitingFirstDelta,
    error,
    send,
  } = useChat();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const listRef = useRef<FlatList>(null);

  // The side panel marks the open conversation.
  useEffect(() => {
    setCurrentConversation(conversationId);
    return () => setCurrentConversation(null);
  }, [conversationId]);

  const suggestions = [
    t("chat.suggestions.ratio"),
    t("chat.suggestions.cappuccino"),
    t("chat.suggestions.bitterEspresso"),
  ];
  const isComposerLocked = isLoading || isLoadingHistory;
  const canSend = !isComposerLocked && input.trim().length > 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {recipeRef && <RecipeBanner recipeRef={recipeRef} />}

      {isLoadingHistory ? (
        <View style={styles.historyLoader}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t("common.loading")} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.list} />
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          data={messages}
          keyExtractor={(_, index) => String(index)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          // Fires as the reply is revealed too, since the growing bubble changes the content height,
          // so it never ends up out of sight. Not animated: scroll animations this frequent fight each other.
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => (
            <View style={styles.entry}>
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
                  <AssistantMessage content={item.content} isStreaming={isLoading && index === messages.length - 1} />
                )}
              </View>
              {item.proposal && (
                <CardErrorBoundary key={item.proposal.proposal_id}>
                  <RecipeProposalCard proposal={item.proposal} />
                </CardErrorBoundary>
              )}
            </View>
          )}
        />
      )}

      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

      {!isLoadingHistory && messages.length === 0 && (
        <View style={styles.suggestions}>
          <Text style={[styles.suggestionsLabel, { color: colors.mutedForeground }]}>{t("chat.suggestionsLabel")}</Text>
          <View style={styles.chips}>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion}
                style={[styles.chip, { backgroundColor: colors.muted, borderColor: colors.border }, isLoading && styles.disabled]}
                onPress={() => void send(suggestion)}
                disabled={isLoading}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, { color: colors.mutedForeground }]}>{suggestion}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

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
  historyLoader: { flex: 1, alignItems: "center", justifyContent: "center" },
  suggestions: { gap: 6, marginTop: 8 },
  suggestionsLabel: { fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: "center" },
  chipText: { fontSize: 14 },
  list: { flex: 1, minHeight: 0 },
  listContent: { gap: 10, paddingBottom: 8 },
  entry: { gap: 8 },
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
