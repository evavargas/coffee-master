export type AuthRoute = "/login" | "/chat";

/** Returns the route to redirect to, or null when the user is already in the right place. */
export function resolveAuthRedirect(token: string | null, isReady: boolean, group: string | undefined): AuthRoute | null {
  if (!isReady) return null;
  if (token) return group === "(tabs)" ? null : "/chat";
  return group === "(auth)" ? null : "/login";
}
