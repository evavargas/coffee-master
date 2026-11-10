import { Stack } from "expo-router";

// The tabs layout already renders the app header, so the nested stack only adds the push/back behavior.
export default function RecipesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
