import { useRouter } from "expo-router";

import { RegisterForm } from "@/components/auth/RegisterForm";
import { Screen } from "@/components/layout/Screen";

// Email confirmation is the second step inside RegisterForm, not a separate route.
export default function RegisterRoute() {
  const router = useRouter();
  const toLogin = () => router.replace("/login");
  return (
    <Screen>
      <RegisterForm onConfirmed={toLogin} onBackToLogin={toLogin} />
    </Screen>
  );
}
