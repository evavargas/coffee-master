import * as SecureStore from "expo-secure-store";

// The JWT lives in the device's secure storage (Keychain on iOS, Keystore on Android).
const TOKEN_KEY = "coffeemaster.token";

export function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export function saveToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function clearSession(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}
