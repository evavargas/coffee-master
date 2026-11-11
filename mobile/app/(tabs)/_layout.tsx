import { Tabs } from "expo-router";
import { BookOpen, Heart, MessageCircle } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { ConversationPanel } from "@/components/layout/ConversationPanel";
import { TabsHeader } from "@/components/layout/AppHeader";
import { ConversationPanelProvider } from "@/context/ConversationPanelContext";
import { useAppTheme } from "@/context/ThemeContext";

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <ConversationPanelProvider>
    <Tabs
      screenOptions={{
        header: () => <TabsHeader />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{ title: t("nav.chat"), tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="recipes"
        options={{ title: t("nav.recipes"), tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="my-recipes"
        options={{ title: t("nav.myRecipes"), tabBarIcon: ({ color, size }) => <Heart color={color} size={size} /> }}
      />
    </Tabs>
    <ConversationPanel />
    </ConversationPanelProvider>
  );
}
