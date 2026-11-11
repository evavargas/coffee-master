import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus } from "lucide-react-native";

import { ActionButton } from "@/components/recipes/ActionButton";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Text } from "@/components/ui/Text";
import { useAppTheme } from "@/context/ThemeContext";
import { useConversationPanel } from "@/context/ConversationPanelContext";
import { useRecipeRefName } from "@/hooks/useRecipeRefName";
import { useSignOut } from "@/hooks/useSignOut";
import type { ConversationSummary } from "@/lib/api/chat";
import { useCurrentConversationId } from "@/lib/conversationsStore";
import { fonts } from "@/lib/fonts";

/** Title of a conversation: the recipe it is about, else its first message, else its date. */
function ConversationTitle({ item, color }: { item: ConversationSummary; color: string }) {
  const { t, i18n } = useTranslation();
  const { name } = useRecipeRefName(item.recipe_ref);
  let date: string;
  try {
    date = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
      new Date(item.updated_at),
    );
  } catch {
    // Intl can be missing or reject a locale on some engines; the raw date is still a usable title.
    date = item.updated_at;
  }
  return (
    <Text numberOfLines={1} style={{ color }}>
      {name ?? item.preview ?? t("chat.switcher.untitled", { date })}
    </Text>
  );
}

/** Left panel with "new conversation", the history and the account controls. Opened from the header's menu button. */
export function ConversationPanel() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const signOut = useSignOut();
  const currentId = useCurrentConversationId();
  const { isOpen, close, conversations } = useConversationPanel();
  const { items, isLoading, error, createError, isCreating, hasMore, loadMore, retry, open: openConversation, startNew } = conversations;
  const panelWidth = Math.min(320, width * 0.85);
  const slide = useRef(new Animated.Value(-panelWidth)).current;

  // Slides in on open; closing is immediate, so the panel never lingers over a screen the user already moved to.
  useEffect(() => {
    if (!isOpen) return;
    slide.setValue(-panelWidth);
    Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }).start();
  }, [isOpen, panelWidth, slide]);

  async function newConversation() {
    if (await startNew()) close();
  }

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.root}>
        <Animated.View
          accessibilityViewIsModal
          // iOS escape gesture (two-finger Z): the scrim is outside the modal view, so a screen reader cannot reach it.
          onAccessibilityEscape={close}
          accessibilityLabel={t("chat.switcher.toggle")}
          style={[
            styles.panel,
            {
              width: panelWidth,
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 8,
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <View style={styles.brand}>
            <Image source={require("../../assets/brand/cup-lavanda.png")} style={styles.cup} accessibilityElementsHidden importantForAccessibility="no" />
            <Text style={[styles.title, { color: colors.primary }]}>{t("common.appTitle")}</Text>
          </View>

          <Pressable
            style={[styles.newButton, { backgroundColor: colors.primary }, isCreating && styles.disabled]}
            onPress={() => void newConversation()}
            disabled={isCreating}
            accessibilityRole="button"
            accessibilityLabel={t("chat.switcher.new")}
            accessibilityState={{ disabled: isCreating }}
          >
            <Plus size={16} color={colors.primaryForeground} />
            <Text style={{ color: colors.primaryForeground, fontWeight: "600" }}>{t("chat.switcher.new")}</Text>
          </Pressable>
          {createError && (
            <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
              {createError}
            </Text>
          )}

          <Text style={[styles.heading, { color: colors.mutedForeground }]}>{t("nav.recents")}</Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {isLoading && items.length === 0 && <ActivityIndicator color={colors.primary} accessibilityLabel={t("chat.switcher.loading")} />}
            {error && (
              <View style={styles.row}>
                <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
                  {error}
                </Text>
                <ActionButton label={t("chat.switcher.retry")} onPress={retry} disabled={false} />
              </View>
            )}
            {!isLoading && !error && items.length === 0 && <Text style={{ color: colors.mutedForeground }}>{t("chat.switcher.empty")}</Text>}
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
            {hasMore && <ActionButton label={t("chat.switcher.loadMore")} onPress={loadMore} disabled={isLoading} />}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <View style={styles.controls}>
              <LanguageSwitcher />
              <ThemeToggle />
            </View>
            <Pressable
              onPress={() => {
                close();
                void signOut();
              }}
              style={styles.signOut}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("nav.signOut")}</Text>
            </Pressable>
          </View>
        </Animated.View>
        <Pressable
          style={[styles.scrim, { backgroundColor: colors.overlay }]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("chat.switcher.close")}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row" },
  scrim: { flex: 1 },
  panel: { paddingHorizontal: 12, gap: 10, borderRightWidth: 1 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  cup: { width: 32, height: 32 },
  title: { fontSize: 22, fontFamily: fonts.display },
  newButton: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, borderRadius: 999, paddingHorizontal: 14 },
  disabled: { opacity: 0.4 },
  heading: { fontSize: 12, fontWeight: "600", paddingHorizontal: 12 },
  list: { flex: 1 },
  row: { gap: 8 },
  item: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, minHeight: 44, justifyContent: "center" },
  footer: { borderTopWidth: 1, paddingTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  controls: { flexDirection: "row", alignItems: "center", gap: 4 },
  signOut: { paddingHorizontal: 8, paddingVertical: 10 },
});
