import { useRouter } from "expo-router";

import { LoginForm } from "@/components/auth/LoginForm";
import { Screen } from "@/components/layout/Screen";
import { useSessionContext } from "@/context/SessionContext";

export default function LoginRoute() {
  const router = useRouter();
  const { signIn } = useSessionContext();
  return (
    <Screen>
      <LoginForm
        onAuthenticated={signIn}
        onRequestRegister={() => router.push("/register")}
        onRequestForgotPassword={() => router.push("/forgot-password")}
      />
    </Screen>
  );
}
