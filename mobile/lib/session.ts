import * as SecureStore from "expo-secure-store";

// The JWT lives in the device's secure storage (Keychain on iOS, Keystore on Android).
const TOKEN_KEY = "coffeemaster.token";

const sessionListeners = new Set<() => void>();

/** Registers a reset callback run whenever the session starts or ends (per-user caches must not outlive it). */
export function onSessionChange(callback: () => void): () => void {
  sessionListeners.add(callback);
  return () => void sessionListeners.delete(callback);
}

export function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } finally {
    sessionListeners.forEach((l) => l());
  }
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } finally {
    // Per-user caches must clear even when the secure store fails.
    sessionListeners.forEach((l) => l());
  }
}
