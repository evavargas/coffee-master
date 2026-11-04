import { useCallback, useEffect, useState } from "react";

/**
 * How long a confirmation/reset code stays valid, in seconds. The backend doesn't send an
 * expiry timestamp in its responses, so this is a hardcoded mirror of its setting and must
 * stay in sync with `verification_code_minutes` in `backend/app/core/config.py`.
 */
export const VERIFICATION_CODE_EXPIRY_SECONDS = 15 * 60;

/**
 * Ticks a countdown down to zero, once per second, formatted as `mm:ss`.
 *
 * Call `restart()` after the user asks for a new code (resend), since a
 * fresh code gets a fresh expiry window and the displayed clock must
 * reflect that instead of continuing to count down from the old one.
 */
export function useCountdown(totalSeconds: number) {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

  useEffect(() => {
    setSecondsLeft(totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const restart = useCallback(() => setSecondsLeft(totalSeconds), [totalSeconds]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return { secondsLeft, formatted, isExpired: secondsLeft <= 0, restart };
}
