import axios, { AxiosError } from "axios";

import { clearSession, getToken } from "@/lib/session";

/** Single HTTP client for the whole app. Components and hooks never call axios directly. */
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// Attach the session token to every request when one exists.
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// An expired or invalid session ends the local session and sends the user to login.
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && getToken()) {
      clearSession();
      if (typeof window !== "undefined") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Returns the backend's `detail` message when it is a string (our own Spanish messages),
 * or the fallback for network errors and FastAPI validation arrays.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = (error as AxiosError<{ detail?: unknown }>).response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}
