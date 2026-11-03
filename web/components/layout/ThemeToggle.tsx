"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type ThemeMode = "system" | "light" | "dark";

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  system: "light",
  light: "dark",
  dark: "system",
};

/**
 * Cycles system -> light -> dark -> system. Renders a neutral placeholder until mounted
 * to avoid a hydration mismatch (the theme is only known on the client).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("common");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const mode = (mounted ? (theme as ThemeMode) : "system") ?? "system";
  const modeLabel = { system: t("themeSystem"), light: t("themeLight"), dark: t("themeDark") }[mode];

  function toggleTheme() {
    setTheme(NEXT_MODE[mode]);
  }

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;

  return (
    <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label={`${t("switchTheme")}: ${modeLabel}`}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}
