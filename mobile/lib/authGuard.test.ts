import { describe, expect, it } from "@jest/globals";

import { resolveAuthRedirect } from "@/lib/authGuard";

describe("resolveAuthRedirect", () => {
  it("waits until the session is restored", () => {
    expect(resolveAuthRedirect(null, false, undefined)).toBeNull();
  });
  it("sends unauthenticated users to login", () => {
    expect(resolveAuthRedirect(null, true, undefined)).toBe("/login");
    expect(resolveAuthRedirect(null, true, "(tabs)")).toBe("/login");
  });
  it("keeps unauthenticated users inside the auth group", () => {
    expect(resolveAuthRedirect(null, true, "(auth)")).toBeNull();
  });
  it("sends authenticated users to the tabs", () => {
    expect(resolveAuthRedirect("jwt", true, undefined)).toBe("/chat");
    expect(resolveAuthRedirect("jwt", true, "(auth)")).toBe("/chat");
  });
  it("keeps authenticated users inside the tabs", () => {
    expect(resolveAuthRedirect("jwt", true, "(tabs)")).toBeNull();
  });
});
