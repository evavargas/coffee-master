import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { History, Plus } from "lucide-react-native";

import { ActionButton } from "@/components/recipes/ActionButton";
import { useAppTheme } from "@/context/ThemeContext";
import { useConversations } from "@/hooks/useConversations";
import { useRecipeRefName } from "@/hooks/useRecipeRefName";
import type { ConversationSummary } from "@/lib/api/chat";

function ConversationTitle({ item, color }: { item: ConversationSummary; color: string }) {
  const { t, i18n } = useTranslation();
  const { name } = useRecipeRefName(item.recipe_ref);
  let date: string;
  try {
    date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.updated_at));
  } catch {
    // Intl can be missing or reject a locale on some engines; the raw date is still a usable title.
    date = item.updated_at;
  }
  return <Text style={{ color }}>{name ?? t("chat.switcher.untitled", { date })}</Text>;
}

/** Lists the user's conversations (in a modal panel, loaded on open), switches between them and starts a new one. */
export function ConversationSwitcher({ currentId, disabled }: { currentId: number | null; disabled?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const { items, isLoading, error, createError, isCreating, hasMore, loadMore, retry, open: openConversation, startNew } =
    useConversations(open);
  const close = () => setOpen(false);

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Pressable
          style={[styles.button, { borderColor: colors.border }]}
          onPress={() => {
            // The keyboard would cover the bottom panel.
            Keyboard.dismiss();
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t("chat.switcher.toggle")}
          accessibilityState={{ expanded: open }}
        >
          <History size={14} color={colors.foreground} />
          <Text style={[styles.buttonText, { color: colors.foreground }]}>{t("chat.switcher.toggle")}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, { borderColor: colors.border }, (disabled || isCreating) && styles.disabled]}
          onPress={() => void startNew()}
          disabled={disabled || isCreating}
          accessibilityRole="button"
          accessibilityLabel={t("chat.switcher.new")}
          accessibilityState={{ disabled: !!(disabled || isCreating) }}
        >
          <Plus size={14} color={colors.foreground} />
          <Text style={[styles.buttonText, { color: colors.foreground }]}>{t("chat.switcher.new")}</Text>
        </Pressable>
      </View>
      {createError && (
        <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
          {createError}
        </Text>
      )}
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t("chat.switcher.close")}
          />
          <View
            accessibilityViewIsModal
            accessibilityLabel={t("chat.switcher.toggle")}
            style={[styles.panel, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              {isLoading && items.length === 0 && (
                <ActivityIndicator color={colors.primary} accessibilityLabel={t("chat.switcher.loading")} />
              )}
              {error && (
                <View style={styles.row}>
                  <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
                    {error}
                  </Text>
                  <ActionButton label={t("chat.switcher.retry")} onPress={retry} disabled={false} />
                </View>
              )}
              {!isLoading && !error && items.length === 0 && (
                <Text style={{ color: colors.mutedForeground }}>{t("chat.switcher.empty")}</Text>
              )}
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.item, item.id === currentId && { backgroundColor: colors.muted }]}
                  onPress={() => {
                    close();
                    openConversation(item.id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === currentId }}
                >
                  <ConversationTitle item={item} color={colors.foreground} />
                </Pressable>
              ))}
              {hasMore && (
                <ActionButton label={t("chat.switcher.loadMore")} onPress={loadMore} disabled={isLoading} />
              )}
            </ScrollView>
            <ActionButton label={t("chat.switcher.close")} onPress={close} disabled={false} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: 8, gap: 4 },
  toolbar: { flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 14,
  },
  buttonText: { fontSize: 13, fontWeight: "600" },
  disabled: { opacity: 0.4 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  panel: { maxHeight: "70%", padding: 12, gap: 8, borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  row: { gap: 8 },
  item: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, minHeight: 44, justifyContent: "center" },
});
