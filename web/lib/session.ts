// Client-side session storage. The backend issues a JWT that lasts 7 days.
const TOKEN_KEY = "coffeemaster.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}
