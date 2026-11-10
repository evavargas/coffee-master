import { Stack } from "expo-router";

import { AppHeader } from "@/components/layout/AppHeader";

export default function AuthLayout() {
  return <Stack screenOptions={{ header: () => <AppHeader />, animation: "none" }} />;
}
