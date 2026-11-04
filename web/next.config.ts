import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

// Origin only (no path): CSP `connect-src` matches origins, and the API URL may carry a path.
function apiOrigin(): string {
  const url = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

// 'unsafe-inline' for scripts is deliberate: Next.js hydration scripts and the next-themes
// anti-flash script are inline. Nonces would remove it, but they force every page to render
// dynamically (no static optimization), so we do not use them.
// 'unsafe-eval' is only needed by the dev server (React refresh / source maps).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src ${["'self'", apiOrigin(), isDev ? "ws:" : ""].filter(Boolean).join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
