import { useRouter } from "expo-router";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { Screen } from "@/components/layout/Screen";

export default function ForgotPasswordRoute() {
  const router = useRouter();
  const toLogin = () => router.replace("/login");
  return (
    <Screen>
      <ForgotPasswordForm onDone={toLogin} onBackToLogin={toLogin} />
    </Screen>
  );
}
