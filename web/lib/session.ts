// Client-side session storage. The backend issues a JWT that lasts 7 days.
const TOKEN_KEY = "coffeemaster.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

const sessionListeners = new Set<() => void>();

/** Registers a reset callback run whenever the session starts or ends (per-user caches must not outlive it). */
export function onSessionChange(callback: () => void): void {
  sessionListeners.add(callback);
}

export function saveToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  sessionListeners.forEach((l) => l());
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  sessionListeners.forEach((l) => l());
}
