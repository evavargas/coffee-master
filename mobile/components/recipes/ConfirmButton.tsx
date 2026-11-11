import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, View, type HostInstance } from "react-native";
import { Text } from "@/components/ui/Text";

import { ActionButton } from "@/components/recipes/ActionButton";
import { useAppTheme } from "@/context/ThemeContext";

/** Moves the screen reader focus to a node; a no-op where the platform can't do it. */
function focusNode(node: HostInstance | null) {
  const handle = node ? findNodeHandle(node) : null;
  if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
}

/** Destructive action with an in-screen confirm step (never Alert.alert). Focus moves to the prompt, then back to the trigger on cancel. */
export function ConfirmButton({ label, message, onConfirm, disabled }: { label: string; message: string; onConfirm: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HostInstance>(null);
  const prompt = useRef<HostInstance>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (asking) focusNode(prompt.current);
    else if (returnFocus.current) {
      returnFocus.current = false;
      focusNode(trigger.current);
    }
  }, [asking]);

  const cancel = () => {
    returnFocus.current = true;
    setAsking(false);
  };

  if (!asking) {
    return (
      <View ref={trigger} collapsable={false}>
        <ActionButton label={label} onPress={() => setAsking(true)} disabled={Boolean(disabled)} />
      </View>
    );
  }
  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={label}
      style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <Text ref={prompt} accessible style={{ color: colors.foreground }}>
        {message}
      </Text>
      <View style={styles.buttons}>
        <ActionButton
          label={t("myRecipes.confirmYes")}
          onPress={() => {
            setAsking(false);
            onConfirm();
          }}
          disabled={Boolean(disabled)}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={t("myRecipes.cancel")} onPress={cancel} style={styles.cancel}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("myRecipes.cancel")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8, alignSelf: "stretch" },
  buttons: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  cancel: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center" },
});
