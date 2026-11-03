import axios from "axios";
import { Platform } from "react-native";

import { getToken } from "@/lib/session";

// On Android emulators the host machine is 10.0.2.2. On a physical phone, set
// EXPO_PUBLIC_API_URL to your computer's LAN IP.
const DEFAULT_API_URL = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";

/** Single HTTP client for the app. Components and hooks never call axios directly. */
export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// Attach the session token to every request when one exists.
apiClient.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Lets the app react to an expired session (401) without the client knowing about React.
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);

/** Returns the backend's `detail` message when it is a string, or the fallback otherwise. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}
