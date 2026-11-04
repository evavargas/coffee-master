"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * How long a confirmation/reset code stays valid, in seconds. The backend doesn't send an
 * expiry timestamp in its responses, so this is a hardcoded mirror of its setting and must
 * stay in sync with `verification_code_minutes` in `backend/app/core/config.py`.
 */
export const VERIFICATION_CODE_EXPIRY_SECONDS = 15 * 60;

function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(totalSeconds, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Ticks down once per second from `totalSeconds`. Call `restart` to reset it back to
 * `totalSeconds` (e.g. after the user asks for a new code).
 */
export function useCountdown(totalSeconds: number) {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

  useEffect(() => {
    setSecondsLeft(totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  const restart = useCallback(() => setSecondsLeft(totalSeconds), [totalSeconds]);

  return {
    secondsLeft,
    formatted: formatTime(secondsLeft),
    isExpired: secondsLeft <= 0,
    restart,
  };
}
