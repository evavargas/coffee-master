"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/chat", key: "chat" },
  { href: "/recipes", key: "recipes" },
  { href: "/my-recipes", key: "myRecipes" },
] as const;

/** Main navigation of the signed-in app. Wraps on narrow screens instead of scrolling. */
export function AppNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("ariaLabel")} className="flex shrink-0 flex-wrap gap-1">
      {LINKS.map(({ href, key }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
